import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { SAMPLE_CASE } from "../../../src/lib/sample-case";
import { generateCase } from "../../../src/lib/gm-ai";
import { TIERS } from "../../../src/lib/budget";
import { gatewayOf, sampleCaseJson, useModel } from "../support/ai";
import { advanceTo, createGame, expectOk, fillLobby, hostCall, joinPlayer, startedGame, startGame, viewOf, assignAliases } from "../support/fixtures";
import { faults } from "../support/seams";
import type { MmWorld } from "../support/world";

Given("a lobby with {int} players including {int} adults", async function (this: MmWorld, n: number, a: number) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { cap: 5 });
  await fillLobby(this, ctx, { adults: a, kids: n - a });
});
Given("the text model takes longer than the time limit", async function (this: MmWorld) {
  this.s.limitMs = 300;
  await useModel(this, { timeoutMs: 300, caseTimeoutMs: 300, fallback: { kind: "hang" } });
});
Given("the text model returns text that is not a valid case", async function (this: MmWorld) {
  await useModel(this, { fallback: { kind: "ok", content: "Once upon a time there was a murder. The butler did it." } });
});
Given("the text model returns a case whose killer is a kid character", async function (this: MmWorld) {
  await useModel(this, { fallback: { kind: "ok", content: JSON.stringify({ ...SAMPLE_CASE, killerId: "ollie" }) } });
});
Given("the text model is working", async function (this: MmWorld) { await useModel(this, {}); });
Given("a player wrote the backstory {string}", async function (this: MmWorld, text: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { cap: 5 });
  await fillLobby(this, ctx, { adults: 3 });
  await joinPlayer(this, ctx, "Writer", "adult", { profile: { backstoryMode: "hint", backstory: text } });
  this.s.backstory = text;
});

// "When the host starts the game" is shared (common.ts). Timing is measured around it here.
Then("the game starts in the {string} phase", async function (this: MmWorld, phase: string) { assert.equal((await this.room()).phase, phase); });
Then("the case source is {string}", async function (this: MmWorld, source: string) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host").json;
  assert.equal(v.caseSource, source);
});
Then("every player has a character card", async function (this: MmWorld) {
  for (const p of this.game.players) {
    const v = expectOk(await viewOf(this, this.game, p), "player").json;
    assert.ok(v.me.character?.card?.story, `${p.name} has no card`);
  }
});
Then("the host view says the sample case is in use", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host").json;
  assert.equal(v.caseSource, "sample");
  assert.equal(v.aiDegraded, true, "the host view carries no explicit flag that the AI was wanted but unavailable (aiDegraded)");
});
Then("the public view does not mention any technical error", async function (this: MmWorld) {
  const t = expectOk(await viewOf(this, this.game, "public"), "public").text;
  assert.doesNotMatch(t, /ECONN|ETIMEDOUT|fetch failed|stack|Error:|circuit|timed out|unavailable|degrad|openai|127\.0\.0\.1/i);
});
Then("the game starts within the time limit plus 2 seconds", function (this: MmWorld) {
  assert.ok(this.s.startMs <= this.s.limitMs + 2000, `start took ${this.s.startMs} ms`);
  assert.equal(this.last.status, 200);
});
Then("the public view before the Reveal does not contain the killer", async function (this: MmWorld) {
  const room = await this.room();
  const sent = JSON.stringify(this.fake!.requests.map((r) => r.body));
  assert.ok(sent.includes(JSON.stringify(this.s.backstory).slice(1, -1)), "the backstory should reach the model as quoted data");
  assert.match(sent, /DATA|data/, "the prompt should say the notes are data");
  assert.ok(!sent.includes("hunter2"));
  const { truthLeaks } = await import("../support/asserts");
  for (const phase of ["cards", "act1", "death", "act2", "intermission", "act3", "act4"] as const) {
    await advanceTo(this, this.game, phase);
    const r = await this.room();
    const v = expectOk(await viewOf(this, this.game, "public"), "public").json;
    assert.deepEqual(truthLeaks(v, r, ["killer", "method", "motive", "story", "hints"]), [], `phase ${phase}`);
  }
  assert.equal(room.caseSource === "sample", false, "fixture: the model case should have been used");
});

// ---- breaker ----
Given("the text model has failed {int} times in a row", async function (this: MmWorld, n: number) {
  await useModel(this, { fallback: { kind: "status", status: 500 } });
  for (let i = 0; i < n; i++) {
    const g = await generateCase({ adults: 2, kids: 2, littles: 0, players: [] }, (await import("../../../src/lib/sanitize")).sanitizeConfig({}));
    assert.equal(g.source, "sample");
  }
  assert.equal(gatewayOf(this).status().breaker, "open", "fixture: breaker should be open");
  this.s.callsBefore = this.fake!.requests.length;
});
When("another host starts a game", async function (this: MmWorld) {
  this.session = "dev:Other";
  const ctx = await createGame(this, { host: "dev:Other" });
  await fillLobby(this, ctx, { adults: 2, kids: 2 });
  this.last = await hostCall(this, ctx, { type: "start" });
  expectOk(this.last, "start");
});
Then("the model is not called", function (this: MmWorld) { assert.equal(this.fake!.requests.length, this.s.callsBefore); });
Then("the sample case is used", async function (this: MmWorld) {
  assert.equal(expectOk(await viewOf(this, this.game, "host"), "host").json.caseSource, "sample");
});

// ---- images ----
Given("the image model is unreachable", function (this: MmWorld) { faults.onImage = () => { throw new Error("image model unreachable"); }; });
Given(/^a started game with the "(\w+)" plan$/, async function (this: MmWorld, tier: string) {
  await startedGame(this, { plan: TIERS.find((t) => t.id === tier)!.plan, cap: 20 });
});
Then("the jobs are marked {string}", async function (this: MmWorld, status: string) {
  const room = await this.room();
  assert.ok(room.media.length > 0, "no media jobs were queued");
  assert.ok(room.media.filter((m) => m.kind !== "video").every((m) => m.status === status), room.media.map((m) => m.status).join(","));
});
Then("the game can be played to the Reveal", async function (this: MmWorld) {
  await advanceTo(this, this.game, "reveal");
  assert.equal((await this.room()).phase, "reveal");
});

// ---- queueing ----
Given("{int} games start at the same moment and the local model handles {int} at a time", async function (this: MmWorld, games: number, _slots: number) {
  await useModel(this, { fallback: { kind: "ok", content: sampleCaseJson(), delayMs: 120 }, timeoutMs: 20_000, caseTimeoutMs: 20_000 });
  const lobbies = [];
  for (let i = 0; i < games; i++) {
    const ctx = await createGame(this, { host: `dev:H${i}`, cap: 5 });
    await fillLobby(this, ctx, { adults: 2, kids: 2 });
    lobbies.push(ctx);
  }
  const t0 = performance.now();
  const res = await Promise.all(lobbies.map(async (c) => { const t = performance.now(); const r = await hostCall(this, c, { type: "start" }); return { r, ms: performance.now() - t }; }));
  this.s.starts = res; this.s.totalMs = performance.now() - t0; this.s.limitMs = 20_000;
});
Then("no game waits longer than the time limit before it gets a case", function (this: MmWorld) {
  for (const s of this.s.starts) { assert.equal(s.r.status, 200, s.r.text); assert.ok(s.ms <= this.s.limitMs); }
});
Given("a started game where scene art takes a very long time", async function (this: MmWorld) {
  faults.onImage = () => new Promise<void>(() => {});
  await startedGame(this, { plan: TIERS.find((t) => t.id === "illustrated")!.plan, cap: 20 });
});
When("the host advances to the next phase", async function (this: MmWorld) {
  const t = performance.now();
  this.last = await hostCall(this, this.game, { type: "advance" });
  this.s.advanceMs = performance.now() - t;
});
Then("the phase changes immediately", async function (this: MmWorld) {
  assert.equal(this.last.status, 200);
  assert.equal((await this.room()).phase, "act1");
  assert.ok(this.s.advanceMs < 1000, `advance took ${this.s.advanceMs} ms`);
});
void startGame; void assignAliases;
