import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { TIERS } from "../../../src/lib/budget";
import { allViews, expectOk, viewOf } from "../support/fixtures";
import { strings } from "../support/asserts";
import type { GameCtx, MmWorld } from "../support/world";

async function create(w: MmWorld, body: Record<string, unknown>) {
  const res = await w.call("POST", "/api/rooms", { body });
  if (res.status === 200 && res.json?.code) {
    const ctx: GameCtx = { code: res.json.code, hostId: w.session!, overrideCode: String(body.overrideCode ?? ""), players: [], alias: {} };
    w.game = ctx;
  }
  return res;
}

When("I create a game with override code {string} and a budget of {int} dollars", async function (this: MmWorld, code: string, cap: number) {
  await create(this, { overrideCode: code, capUsd: cap });
});
When(/^I create a game for (\d+) adults and (\d+) kids with a budget of (\d+) dollars?$/, async function (this: MmWorld, a: string, k: string, cap: string) {
  await create(this, { overrideCode: "hunter2", capUsd: Number(cap), config: { expected: { adults: Number(a), kids: Number(k), toddlers: 0 } } });
});
When(/^I create a game for (\d+) adults and (\d+) kids with a budget of (\d+) dollars? and the "(\w+)" plan$/, async function (this: MmWorld, a: string, k: string, cap: string, plan: string) {
  const tier = TIERS.find((t) => t.id === plan);
  assert.ok(tier, `no media plan tier called ${plan}`);
  await create(this, { overrideCode: "hunter2", capUsd: Number(cap), config: { expected: { adults: Number(a), kids: Number(k), toddlers: 0 } }, plan: tier.plan });
});
When("I create a game named {string} with {int} adults expected", async function (this: MmWorld, name: string, adults: number) {
  await create(this, { overrideCode: "hunter2", capUsd: 5, config: { name, expected: { adults, kids: 0, toddlers: 0 } } });
});
When("I create {int} games", async function (this: MmWorld, n: number) {
  this.s.codes = [];
  for (let i = 0; i < n; i++) {
    const res = expectOk(await create(this, { overrideCode: "hunter2", capUsd: 5 }), `create game ${i}`);
    this.s.codes.push(res.json.code);
  }
});

Then("the game is created", function (this: MmWorld) {
  assert.equal(this.last.status, 200, this.last.text);
  assert.ok(this.last.json?.code, "no join code in the response");
});
Then("the game has a join code of 4 letters", function (this: MmWorld) {
  assert.match(this.last.json.code, /^[A-Z]{4}$/, `join code was ${this.last.json.code}`);
});
Then("the game has no players", async function (this: MmWorld) { assert.equal((await this.room()).players.length, 0); });
Then("no game exists", function (this: MmWorld) { assert.deepEqual(this.store.created, [], "a game was stored although creation was refused"); });
Then("every join code uses only letters from {string}", function (this: MmWorld, alphabet: string) {
  for (const c of this.s.codes as string[]) for (const ch of c) assert.ok(alphabet.includes(ch), `join code ${c} contains "${ch}", which is not in ${alphabet}`);
});
Then("all join codes are different", function (this: MmWorld) {
  const codes = this.s.codes as string[];
  assert.equal(new Set(codes).size, codes.length);
});
Then("no response for the game contains the internal game id", async function (this: MmWorld) {
  const room = await this.room();
  const views = await allViews(this, this.game);
  this.s.gameId = room.gameId;
  assert.ok(room.gameId && room.gameId.length === 26, "the room has no 26 character gameId");
  const texts = [...this.log.map((l) => l.res.text), ...views.map((v) => v.text), ...this.log.flatMap((l) => [...l.res.headers.values()])];
  for (const t of texts) assert.ok(!t.includes(room.gameId), `a response contains the game id: ${t.slice(0, 120)}`);
  for (const v of views) for (const s of strings(v.json)) assert.ok(!s.includes(room.gameId));
});
Then("the join code is not derived from the internal game id", async function (this: MmWorld) {
  const room = await this.room();
  assert.notEqual(room.code, room.gameId);
  assert.ok(!room.gameId.includes(room.code), "the join code is a substring of the game id");
  assert.ok(!room.gameId.startsWith(room.code) && !room.gameId.endsWith(room.code));
});
Then("the game name is trimmed", async function (this: MmWorld) {
  const name = (expectOk(await viewOf(this, this.game, "host"), "host view").json.config.name) as string;
  assert.equal(name, name.trim());
  assert.ok(name.length > 0 && name.length < "  The   Party  ".length, `stored name was "${name}"`);
});
Then("the expected adults is limited to {int}", async function (this: MmWorld, max: number) {
  assert.equal(expectOk(await viewOf(this, this.game, "host"), "host view").json.config.expected.adults, max);
});
