import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { createGame, fillLobby } from "../support/fixtures";
import type { MmWorld } from "../support/world";

When("I request the liveness endpoint", async function (this: MmWorld) { await this.call("GET", "/api/healthz", { host: null }); });
When("I request the readiness endpoint", async function (this: MmWorld) { await this.call("GET", "/api/readyz", { host: null }); });
Then("the response says the status is {string}", function (this: MmWorld, status: string) { assert.equal(this.last.json?.status, status, this.last.text); });
Given("the state store is unreachable", function (this: MmWorld) { this.store.down = new Error("connect ECONNREFUSED 10.0.0.9:5432"); });
Then("the response is {string}", function (this: MmWorld, what: string) {
  assert.equal(what, "service unavailable");
  assert.equal(this.last.status, 503, this.last.text);
});
When("I request the liveness and readiness endpoints", async function (this: MmWorld) {
  // Make sure there is a real game with a real join code, player name and game id to look for.
  this.session = "dev:Hana";
  const ctx = await createGame(this, { cap: 5 });
  await fillLobby(this, ctx, { adults: 1 });
  const room = await this.room(ctx);
  this.s.secrets = [room.code, room.gameId, ...room.players.map((p) => p.name)];
  this.all = [];
  await this.call("GET", "/api/healthz", { host: null });
  await this.call("GET", "/api/readyz", { host: null });
});
Then("neither response contains a join code, a player name or a game identifier", function (this: MmWorld) {
  assert.equal(this.all.length, 2);
  for (const r of this.all) for (const s of this.s.secrets as string[]) assert.ok(!r.text.includes(s), `${r.text} contains ${s}`);
});
