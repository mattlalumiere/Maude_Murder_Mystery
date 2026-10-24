import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { strings } from "../support/asserts";
import { advanceTo, allViews, createGame, expectOk, fillLobby, hostCall, playerCall, startGame, viewOf } from "../support/fixtures";
import { MINUTE } from "../support/clock";
import type { Phase } from "../../../src/lib/types";
import type { MmWorld } from "../support/world";

Given(/^a started game in the "(\w+)" phase with override code "([^"]*)"$/, async function (this: MmWorld, phase: Phase, code: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { overrideCode: code });
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
  await startGame(this, ctx);
  await advanceTo(this, ctx, phase);
});

async function send(w: MmWorld, cmd: string, code: string, confirm?: boolean) {
  const res = await hostCall(w, w.game, { type: "override", code, cmd, ...(confirm === undefined ? {} : { confirm }) });
  w.last = res;
  (w.s.sent ??= []).push(res);
  return res;
}
When("the host sends the override command {string} with code {string}", async function (this: MmWorld, cmd: string, code: string) { await send(this, cmd, code); });
When("the host sends the override command {string} with code {string} {int} times", async function (this: MmWorld, cmd: string, code: string, n: number) {
  for (let i = 0; i < n; i++) await send(this, cmd, code);
});
When("the host sends the override command {string} with code {string} without confirming", async function (this: MmWorld, cmd: string, code: string) { await send(this, cmd, code, false); });
When("the host sends the override command {string} with code {string} and confirms", async function (this: MmWorld, cmd: string, code: string) { await send(this, cmd, code, true); });
When("a player sends the override command {string} with code {string}", async function (this: MmWorld, cmd: string, code: string) {
  this.last = await playerCall(this, this.game, this.game.players[0], { type: "override", code, cmd });
});

Then("the host receives a nudge message", async function (this: MmWorld) {
  assert.equal(this.last.status, 200, this.last.text);
  const room = await this.room();
  assert.equal(this.last.json.message, room.case!.nudges[room.phase]);
});
Then("the game records that an override was used", async function (this: MmWorld) {
  assert.equal((await this.room()).overrideUsed, true);
  assert.equal(expectOk(await viewOf(this, this.game, "host"), "host view").json.overrideUsed, true);
});
Then("the game still shows no override used", async function (this: MmWorld) { assert.equal((await this.room()).overrideUsed, false); });
Then("the third attempt is refused as too many requests", function (this: MmWorld) {
  const sent = this.s.sent as { status: number }[];
  assert.deepEqual(sent.slice(0, 2).map((r) => r.status), [403, 403]);
  assert.equal(sent[2].status, 429);
  this.last = sent[2];
});
Then("the host view shows overrides locked for 10 minutes", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host view").json;
  assert.equal(v.lockedUntil - this.clock.now(), 10 * MINUTE);
});
Given("overrides are locked", async function (this: MmWorld) {
  if (this.stepType === "Outcome") { assert.ok((await this.room()).lockedUntil > this.clock.now(), "overrides are not locked"); return; }
  for (let i = 0; i < 3; i++) await send(this, "NUDGE", "wrong");
  assert.ok((await this.room()).lockedUntil > this.clock.now(), "fixture: three wrong codes did not lock");
});
Then("overrides are not locked", async function (this: MmWorld) { assert.ok((await this.room()).lockedUntil <= this.clock.now()); });
Given("the host sent {int} wrong codes", async function (this: MmWorld, n: number) { for (let i = 0; i < n; i++) await send(this, "NUDGE", "wrong"); });
When("the game state is read again from storage", async function (this: MmWorld) { this.s.stored = await this.room(); });
Then("overrides are still locked", function (this: MmWorld) {
  assert.ok(this.s.stored.lockedUntil > this.clock.now(), `lockedUntil=${this.s.stored.lockedUntil}, failed=${this.s.stored.failedOverrides}`);
});
When("{int} wrong codes are sent at the same moment", async function (this: MmWorld, n: number) {
  this.s.sent = await Promise.all(Array.from({ length: n }, () => hostCall(this, this.game, { type: "override", code: "wrong", cmd: "NUDGE" })));
});
Then("the host is asked to confirm", function (this: MmWorld) { assert.equal(this.last.status, 200); assert.equal(this.last.json.needsConfirm, true); });
Then("the host does not receive the killer", async function (this: MmWorld) {
  const k = (await this.room()).case!;
  assert.ok(!this.last.text.includes(k.characters.find((c) => c.id === k.killerId)!.name));
  assert.ok(!this.last.text.includes(k.truth.story.slice(0, 30)));
});
Then("the host receives the killer, method, motive and story", async function (this: MmWorld) {
  const k = (await this.room()).case!;
  const msg: string = this.last.json.message;
  assert.ok(msg.includes(k.characters.find((c) => c.id === k.killerId)!.name), msg);
  assert.ok(msg.includes(k.methods.find((m) => m.id === k.truth.methodId)!.text));
  assert.ok(msg.includes(k.motives.find((m) => m.id === k.truth.motiveId)!.text));
  assert.ok(msg.includes(k.truth.story));
});
Then("the message says the host forfeits the Detective of the Night award", function (this: MmWorld) {
  assert.equal(this.last.status, 200, this.last.text);
  assert.match(this.last.json.message, /Detective of the Night/);
  assert.match(this.last.json.message, /(forfeit|no .*award|revoked)/i);
});
Then("no view, response, log line or model prompt contains {string}", async function (this: MmWorld, secret: string) {
  const views = await allViews(this, this.game);
  for (const v of views) assert.ok(!v.text.includes(secret), `the ${v.who} view contains the code`);
  for (const l of this.log) { if (l.method === "POST" && l.path.endsWith("/action")) assert.ok(!l.res.text.includes(secret), "a response echoes the code"); }
  for (const line of this.consoleLines) assert.ok(!line.includes(secret), `a log line contains the code: ${line.slice(0, 100)}`);
  for (const r of this.fake?.requests ?? []) assert.ok(!JSON.stringify(r.body).includes(secret), "a model prompt contains the code");
  assert.ok(strings(views.map((v) => v.json)).every((s) => !s.includes(secret)));
});
Then("the stored game does not contain {string} in plain text", async function (this: MmWorld, secret: string) {
  assert.ok(!JSON.stringify(await this.room()).includes(secret));
});
