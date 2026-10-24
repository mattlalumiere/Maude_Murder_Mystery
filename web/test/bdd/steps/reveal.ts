import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { advanceTo, allViews, correctBallot, expectOk, jpeg, playerCall, uploadPhoto, viewOf } from "../support/fixtures";
import { listObjects } from "../support/stores";
import type { MmWorld } from "../support/world";

Then("the public view shows the killer's character name", async function (this: MmWorld) {
  const room = await this.room();
  const r = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal;
  assert.equal(r.killer, room.case!.characters.find((c) => c.id === room.case!.killerId)!.name);
});
Then("the public view shows the method, the motive and the true story", async function (this: MmWorld) {
  const k = (await this.room()).case!;
  const r = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal;
  assert.equal(r.method, k.methods.find((m) => m.id === k.truth.methodId)!.text);
  assert.equal(r.motive, k.motives.find((m) => m.id === k.truth.motiveId)!.text);
  assert.equal(r.story, k.truth.story);
});
Then("the public view shows the scores and the awards", async function (this: MmWorld) {
  const r = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal;
  assert.ok(r.scores.length === 6 && r.awards.length >= 3);
});
Then("the player view and the host view show the same reveal", async function (this: MmWorld) {
  const pub = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal;
  const host = expectOk(await viewOf(this, this.game, "host"), "host").json.reveal;
  const pv = expectOk(await viewOf(this, this.game, this.game.players[0]), "player").json.reveal;
  assert.deepEqual(host, pub);
  assert.deepEqual(pv, pub);
});
Then("no view contains the reveal block", async function (this: MmWorld) {
  for (const v of await allViews(this, this.game)) assert.equal(v.json.reveal, undefined, `${v.who} has a reveal block`);
});
Then("a late ballot is refused", async function (this: MmWorld) {
  const res = await playerCall(this, this.game, this.game.alias.P1, { type: "ballot", ballot: correctBallot(await this.room()) });
  this.last = res;
  assert.equal(res.status, 409, res.text);
});
Then("the awards include {string}, {string} and {string}", async function (this: MmWorld, a: string, b: string, c: string) {
  const awards = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal.awards.map((x: any) => x.award);
  for (const n of [a, b, c]) assert.ok(awards.includes(n), `${n} missing from ${awards}`);
});
Then("every award names a player who is in the game", async function (this: MmWorld) {
  const names = (await this.room()).players.map((p) => p.name);
  for (const a of expectOk(await viewOf(this, this.game, "public"), "public").json.reveal.awards) assert.ok(names.includes(a.to), `${a.award} -> ${a.to}`);
});
Given("a host override code {string}", async function (this: MmWorld, code: string) {
  assert.equal(this.game.overrideCode, code, "fixture: the background game was created with a different override code");
});
Given("every player uploaded a consented photo before the game started", async function (this: MmWorld) {
  for (const p of this.game.players) expectOk(await uploadPhoto(this, this.game, p, p.ageGroup === "adult" ? "self" : "guardian"), `photo ${p.name}`);
  assert.ok(listObjects(this.mediaDir).filter((k) => k.includes("/photos/")).length >= this.game.players.length, "fixture: photos not stored");
});
Then("no raw photo remains in storage", function (this: MmWorld) {
  const left = listObjects(this.mediaDir).filter((k) => k.includes("/photos/"));
  assert.deepEqual(left, []);
});
When("the game reaches the {string} phase", async function (this: MmWorld, phase: any) { await advanceTo(this, this.game, phase); });
void jpeg;
