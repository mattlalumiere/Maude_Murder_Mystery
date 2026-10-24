import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { createGame, expectOk, fillLobby, hostCall, joinPlayer, startGame, viewOf } from "../support/fixtures";
import { strings } from "../support/asserts";
import type { AgeGroup } from "../../../src/lib/types";
import type { MmWorld } from "../support/world";

Given("a game in the lobby", async function (this: MmWorld) {
  this.session ??= "dev:Hana";
  await createGame(this, {});
});

async function doJoin(w: MmWorld, code: string, name: string, ageGroup: string, extra: Record<string, unknown> = {}) {
  const res = await w.call("POST", `/api/rooms/${code}/join`, { host: null, body: { name, ageGroup, ...extra } });
  if (res.status === 200) w.game.players.push({ name: String(name).trim().slice(0, 24), id: res.json.playerId, token: res.json.token, ageGroup: ageGroup as AgeGroup });
  return res;
}

When("a guest named {string} with age group {string} joins using the code", async function (this: MmWorld, name: string, age: string) { await doJoin(this, this.game.code, name, age); });
When("a guest named {string} joins using the code", async function (this: MmWorld, name: string) { await doJoin(this, this.game.code, name, "adult"); });
When("a guest named {string} joins using the code in lower case", async function (this: MmWorld, name: string) { await doJoin(this, this.game.code.toLowerCase(), name, "adult"); });
When("a guest named {string} joins using the code {string}", async function (this: MmWorld, name: string, code: string) { await doJoin(this, code, name, "adult"); });
When("a guest named {string} joins with the backstory {string}", async function (this: MmWorld, name: string, text: string) {
  this.s.backstory = text;
  await doJoin(this, this.game.code, name, "adult", { profile: { backstoryMode: "own", backstory: text } });
});
Given("a guest named {string} has joined", async function (this: MmWorld, name: string) { expectOk(await doJoin(this, this.game.code, name, "adult"), "join"); });
Given("the game already has {int} players", async function (this: MmWorld, n: number) {
  for (let i = 0; i < n; i++) expectOk(await doJoin(this, this.game.code, `Guest${i + 1}`, i % 2 ? "kid" : "adult"), `join ${i}`);
});
Given(/^the game has (\d+) players including (\d+) adults$/, async function (this: MmWorld, n: string, a: string) {
  await fillLobby(this, this.game, { adults: Number(a), kids: Number(n) - Number(a) });
});
Given("the host has started the game", async function (this: MmWorld) { await startGame(this, this.game); });

Then("the join succeeds", function (this: MmWorld) { assert.equal(this.last.status, 200, this.last.text); });
Then("the guest receives a player id and a private token", function (this: MmWorld) {
  assert.ok(this.last.json.playerId, "no playerId");
  assert.ok(typeof this.last.json.token === "string" && this.last.json.token.length >= 16, "token missing or too short");
});
Then("the lobby lists {string}", async function (this: MmWorld, name: string) {
  const v = expectOk(await viewOf(this, this.game, "public"), "public view").json;
  assert.ok(v.lobbyNames.includes(name), `lobby is ${JSON.stringify(v.lobbyNames)}`);
});
Then("the guest name is {int} characters long", async function (this: MmWorld, n: number) {
  const names = (await this.room()).players.map((p) => p.name);
  assert.equal(names[names.length - 1].length, n);
});
Then("no view contains the token of {string}", function (this: MmWorld, name: string) {
  const p = this.game.players.find((x) => x.name === name)!;
  const views = this.s.views as { who: string; text: string }[];
  assert.ok(views.length > 0);
  for (const v of views) {
    assert.ok(!v.text.includes(p.token), `the ${v.who} view contains the token`);
    assert.ok(!/"token"/.test(v.text), `the ${v.who} view has a token field`);
  }
});
Then("the backstory is stored as the same plain text", async function (this: MmWorld) {
  const room = await this.room();
  assert.equal(room.players[room.players.length - 1].profile.backstory, this.s.backstory);
});
Then("the backstory is limited to {int} characters", async function (this: MmWorld, max: number) {
  const res = await doJoin(this, this.game.code, "LongTale", "adult", { profile: { backstoryMode: "own", backstory: "x".repeat(max + 400) } });
  expectOk(res, "join with a long backstory");
  const room = await this.room();
  assert.ok(room.players.find((p) => p.name === "LongTale")!.profile.backstory.length <= max);
  for (const p of room.players) assert.ok(p.profile.backstory.length <= max);
});
When("the host adds a guest named {string} with age group {string}", async function (this: MmWorld, name: string, age: string) {
  const res = await hostCall(this, this.game, { type: "addPlayer", name, ageGroup: age });
  expectOk(res, "addPlayer");
});
Then("{string} is marked as having no device", async function (this: MmWorld, name: string) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host view").json;
  const p = v.players.find((x: any) => x.name === name);
  assert.ok(p, "player missing from host view");
  assert.equal(p.hasDevice, false);
  assert.ok(strings(v).length > 0);
});
