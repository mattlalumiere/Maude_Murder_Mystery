// Steps shared by several features: sign in, HTTP status checks, started games, phases, clock.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { estimate } from "../../../src/lib/budget";
import { PHASES, type Phase } from "../../../src/lib/types";
import { expectErrorCode, expectStatus } from "../support/asserts";
import { advanceTo, allViews, expectOk, hostCall, startedGame, viewOf, HOST } from "../support/fixtures";
import { HOUR, MINUTE, SECOND } from "../support/clock";
import { useModel } from "../support/ai";
import type { MmWorld } from "../support/world";

// ---- identity ----
Given("I am a signed-in host", function (this: MmWorld) { this.session = `${HOST}:${this.clock.now() % 100000}`; });
Given("I am not signed in", function (this: MmWorld) { this.session = null; });

// ---- status checks ----
Then(/^the request is refused as (unauthorized|a bad request|forbidden|a conflict|not found|too many requests|too large|an unsupported media type|unprocessable|unavailable)$/, function (this: MmWorld, label: string) {
  expectStatus(this.last, label);
});
Then("the request is refused", function (this: MmWorld) {
  assert.ok(this.last.status >= 400 && this.last.status < 500, `expected a 4xx refusal, got HTTP ${this.last.status}: ${this.last.text.slice(0, 200)}`);
});
Then("the request is refused as unauthorized or not found", function (this: MmWorld) {
  assert.ok([401, 404].includes(this.last.status), `expected 401 or 404, got ${this.last.status}`);
});
Then("the response is not found", function (this: MmWorld) { assert.equal(this.last.status, 404, this.last.text.slice(0, 200)); });
Then("the response is successful", function (this: MmWorld) { assert.ok(this.last.status >= 200 && this.last.status < 300, `HTTP ${this.last.status}: ${this.last.text.slice(0, 200)}`); });
Then("the error code is {string}", function (this: MmWorld, code: string) { expectErrorCode(this.last, code); });

// ---- started games ----
Given(/^a started game with (\d+) adults? and (\d+) kids? using the sample case$/, async function (this: MmWorld, a: string, k: string) {
  await startedGame(this, { adults: Number(a), kids: Number(k) });
});
Given("a started game", async function (this: MmWorld) { await startedGame(this); });
Given(/^a started game with (\d+) adults, (\d+) kid and (\d+) little player$/, async function (this: MmWorld, a: string, k: string, l: string) {
  await startedGame(this, { adults: Number(a), kids: Number(k), littles: Number(l) });
});

// ---- phases ----
Given(/^the game is in the "(\w+)" phase$/, async function (this: MmWorld, phase: Phase) {
  assert.ok(PHASES.includes(phase), `unknown phase ${phase}`);
  if (this.stepType === "Outcome") {
    assert.equal((await this.room()).phase, phase);
    return;
  }
  await advanceTo(this, this.game, phase);
  assert.equal((await this.room()).phase, phase);
});
When(/^the host advances to the "(\w+)" phase$/, async function (this: MmWorld, phase: Phase) {
  await advanceTo(this, this.game, phase);
  assert.equal((await this.room()).phase, phase);
});
When("the host advances the game", async function (this: MmWorld) { await hostCall(this, this.game, { type: "advance" }).then((r) => { this.last = r; }); });
When("the host starts the game", async function (this: MmWorld) {
  const res = await hostCall(this, this.game, { type: "start" });
  this.last = res;
  expectOk(res, "start");
  const { assignAliases } = await import("../support/fixtures");
  await assignAliases(this, this.game);
});
Given("the game is paused", async function (this: MmWorld) { expectOk(await hostCall(this, this.game, { type: "pause" }), "pause"); });
Given(/^the game is paused in the "(\w+)" phase$/, async function (this: MmWorld, phase: Phase) {
  await advanceTo(this, this.game, phase);
  expectOk(await hostCall(this, this.game, { type: "pause" }), "pause");
});

Then("ballots are closed", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "public"), "public view").json;
  assert.equal(v.ballotsOpen, false);
  assert.equal(v.ballotOptions, undefined, "ballot options must not be listed while ballots are closed");
});
Then("ballots are open", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "public"), "public view").json;
  assert.equal(v.ballotsOpen, true);
});

// ---- the clock ----
When(/^(\d+) hours? and (\d+) minutes? pass$/, function (this: MmWorld, h: string, m: string) { this.clock.advance(Number(h) * HOUR + Number(m) * MINUTE); });
When(/^(\d+) hours? pass$/, function (this: MmWorld, h: string) { this.clock.advance(Number(h) * HOUR); });
When(/^(\d+) minutes? and (\d+) seconds? pass$/, function (this: MmWorld, m: string, s: string) { this.clock.advance(Number(m) * MINUTE + Number(s) * SECOND); });

// ---- views ----
When("anyone reads the public, player and host views", async function (this: MmWorld) { this.s.views = await allViews(this, this.game); });

// ---- budget shared ----
Then("the game media plan costs no more than 85 percent of the budget", async function (this: MmWorld) {
  const host = expectOk(await viewOf(this, this.game, "host"), "host view").json;
  const exp = host.config.expected;
  const players = exp.adults + exp.kids + exp.toddlers;
  const cost = estimate(host.budget.plan, players).total;
  assert.ok(cost <= host.budget.capUsd * 0.85 + 1e-9, `plan costs ${cost.toFixed(3)} but 85% of the cap ${host.budget.capUsd} is ${(host.budget.capUsd * 0.85).toFixed(3)}`);
});

// ---- the text model ----
Given("the text model is unreachable", async function (this: MmWorld) { await useModel(this, { server: "closed" }); });
Then("at most 3 model requests are in progress", function (this: MmWorld) {
  assert.ok(this.fake, "no fake model in this scenario");
  assert.ok(this.fake.maxInFlight <= 3, `saw ${this.fake.maxInFlight} model requests in flight at once`);
  assert.ok(this.fake.maxInFlight >= 1, "the model was never called");
});

