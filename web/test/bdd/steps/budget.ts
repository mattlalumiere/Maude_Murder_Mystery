import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { PRICES, TIERS } from "../../../src/lib/budget";
import { mutate } from "../../../src/lib/store";
import { generateCase } from "../../../src/lib/gm-ai";
import { useModel, gatewayOf } from "../support/ai";
import { createGame, expectOk, fillLobby, hostCall, playerCall, startedGame, startGame, viewOf } from "../support/fixtures";
import { faults } from "../support/seams";
import type { MmWorld } from "../support/world";

async function runWorker(w: MmWorld, max = 400) {
  let n = 0;
  const peaks = { max: 0 };
  for (; n < max; n++) {
    const r = expectOk(await w.call("POST", `/api/rooms/${w.game.code}/media/run`, { host: w.game.hostId }), "media/run");
    const b = (await w.room()).budget;
    peaks.max = Math.max(peaks.max, b.spentUsd + b.reservedUsd);
    if (!r.json.ran) break;
  }
  assert.ok(n < max, "the media worker never ran out of jobs");
  w.s.peak = peaks.max;
  w.s.ticks = n;
}
When("the media worker runs until no jobs are left", async function (this: MmWorld) { await runWorker(this); });
When("the media worker runs one job", async function (this: MmWorld) {
  this.last = expectOk(await this.call("POST", `/api/rooms/${this.game.code}/media/run`, { host: this.game.hostId }), "media/run");
});
When("the media worker runs one tick", async function (this: MmWorld) {
  this.last = expectOk(await this.call("POST", `/api/rooms/${this.game.code}/media/run`, { host: this.game.hostId }), "media/run");
});
When("the media worker runs", async function (this: MmWorld) {
  this.last = expectOk(await this.call("POST", `/api/rooms/${this.game.code}/media/run`, { host: this.game.hostId }), "media/run");
});

/** Lobby with an explicit plan and cap set through the host action (the creation path trims plans to fit). */
async function planned(w: MmWorld, cap: number, tierId: string, o: { adults?: number; kids?: number } = {}) {
  w.session ??= "dev:Hana";
  const ctx = await createGame(w, { cap: 50 });
  expectOk(await hostCall(w, ctx, { type: "setPlan", plan: TIERS.find((t) => t.id === tierId)!.plan, capUsd: cap }), "setPlan");
  await fillLobby(w, ctx, { adults: o.adults ?? 4, kids: o.kids ?? 2 });
  await startGame(w, ctx);
  return ctx;
}

Given(/^a started game with a budget of (\d+) dollars? and every image costing ([\d.]+) dollars$/, async function (this: MmWorld, cap: string, price: string) {
  PRICES.imageStandard = Number(price); PRICES.imagePremium = Number(price);
  await planned(this, Number(cap), "illustrated");
});
Given(/^a started game with a budget of (\d+) dollars?$/, async function (this: MmWorld, cap: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { cap: Number(cap) });
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
  await startGame(this, ctx);
});
Then(/^the spent amount plus the reserved amount is never above (\d+) dollars?$/, function (this: MmWorld, cap: string) {
  assert.ok(this.s.peak <= Number(cap) + 1e-9, `peak ${this.s.peak}`);
  assert.ok(this.s.ticks > 0, "no job ever ran");
});
Then("the jobs that did not fit are marked {string}", async function (this: MmWorld, status: string) {
  const room = await this.room();
  const skipped = room.media.filter((m) => m.status === status);
  assert.ok(skipped.length > 0, `no job is ${status}; statuses: ${room.media.map((m) => m.status).join(",")}`);
  assert.ok(room.media.every((m) => m.status !== "queued" && m.status !== "running"));
});
Then("the spend check was asked before the generation started", async function (this: MmWorld) {
  const seen: { reserved: number; running: number }[] = [];
  faults.onImage = async () => {
    const room = (await this.store.peek(this.game.code))!;
    seen.push({ reserved: room.budget.reservedUsd, running: room.media.filter((m) => m.status === "running").length });
  };
  expectOk(await this.call("POST", `/api/rooms/${this.game.code}/media/run`, { host: this.game.hostId }), "media/run");
  assert.ok(seen.length >= 1, "no generation happened");
  for (const s of seen) { assert.ok(s.running >= 1 && s.reserved > 0, "the generation started before a reservation was made"); }
});
Given(/^a started game with a budget of (\d+) dollars and an image model that fails$/, async function (this: MmWorld, cap: string) {
  faults.onImage = () => { throw new Error("image model down"); };
  await planned(this, Number(cap), "illustrated");
});
Then("the reserved amount is {int}", async function (this: MmWorld, n: number) { assert.equal((await this.room()).budget.reservedUsd, n); });
Then("the spent amount is {int}", async function (this: MmWorld, n: number) { assert.equal((await this.room()).budget.spentUsd, n); });
When("the host pauses the media", async function (this: MmWorld) { expectOk(await hostCall(this, this.game, { type: "setPlan", plan: { paused: true } }), "pause media"); });
Then("no new job starts", async function (this: MmWorld) {
  assert.equal(this.last.json.ran, false);
  assert.equal(faults.imageCalls, 0);
});
Given(/^a started game where ([\d.]+) dollars is spent or reserved$/, async function (this: MmWorld, amount: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { cap: 5 });
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
  await startGame(this, ctx);
  await mutate(ctx.code, (room) => { room.budget.spentUsd = Number(amount); });
});
When(/^the host sets the cap to (\d+) dollars?$/, async function (this: MmWorld, cap: string) {
  this.s.capBefore = (await this.room()).budget.capUsd;
  this.last = await hostCall(this, this.game, { type: "setPlan", capUsd: Number(cap) });
});
Then("the cap is unchanged", async function (this: MmWorld) { assert.equal((await this.room()).budget.capUsd, this.s.capBefore); });
Then(/^the cap is (\d+) dollars$/, async function (this: MmWorld, cap: string) {
  assert.equal(this.last.status, 200, this.last.text);
  assert.equal((await this.room()).budget.capUsd, Number(cap));
  assert.equal(expectOk(await viewOf(this, this.game, "host"), "host").json.budget.capUsd, Number(cap));
});
Given("a started game where the text and image models are local", async function (this: MmWorld) {
  await useModel(this, {});
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { cap: 5 });
  expectOk(await hostCall(this, ctx, { type: "setPlan", plan: TIERS.find((t) => t.id === "illustrated")!.plan }), "setPlan");
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
  await startGame(this, ctx);
  assert.ok(this.fake!.requests.length >= 1, "fixture: the local model was not used to make the case");
});
Then(/^the spent amount is 0 dollars$/, async function (this: MmWorld) {
  const room = await this.room();
  assert.equal(room.budget.spentUsd, 0);
  assert.ok(room.media.some((m) => m.status === "done"), "fixture: no generation completed");
});
Then("the usage record shows the number of generations and tokens used", async function (this: MmWorld) {
  const b = expectOk(await viewOf(this, this.game, "host"), "host").json.budget;
  const keys = Object.keys(b).join(",");
  assert.ok(/token/i.test(keys) && /(generation|request|usage)/i.test(keys), `host view budget has no usage record, only: ${keys}`);
  void gatewayOf;
});
When("a player tries to change the media plan", async function (this: MmWorld) {
  this.last = await playerCall(this, this.game, this.game.players[0], { type: "setPlan", plan: { avatars: true, scenesPerAct: 3, videoClips: 4 }, capUsd: 500 });
});
Given("a started game whose AI token limit is {int} tokens", async function (this: MmWorld, n: number) {
  this.s.tokenLimit = n;
  await useModel(this, { fallback: { kind: "ok", content: JSON.stringify((await import("../../../src/lib/sample-case")).SAMPLE_CASE), usage: { prompt_tokens: 400, completion_tokens: 800 } }, env: { AI_GAME_TOKEN_BUDGET: String(n) } });
  await startedGame(this, { label: "tok" });
});
When("the text model reports {int} tokens used", async function (this: MmWorld, n: number) {
  const room = await this.room();
  const used = gatewayOf(this).gameUsage(room.gameId).tokens;
  assert.ok(used >= n, `the gateway has accounted ${used} tokens for this game; the engine does not pass the game id to the model, so the per game token limit can never apply`);
});
Then("further AI text requests for that game use the sample content", async function (this: MmWorld) {
  const room = await this.room();
  const g = await generateCase({ adults: 4, kids: 2, littles: 0, players: [] }, room.config, { gameId: room.gameId });
  assert.equal(g.source, "sample");
  assert.equal(g.degraded, true);
});
