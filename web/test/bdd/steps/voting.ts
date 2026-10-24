import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { allViews, correctBallot, expectOk, player, playerCall, viewOf, wrongOption } from "../support/fixtures";
import { containsKey } from "../support/asserts";
import type { Room } from "../../../src/lib/types";
import type { MmWorld, PlayerRef } from "../support/world";

function ballotFor(room: Room, killer: string, method: string, motive: string) {
  const k = room.case!;
  const c = correctBallot(room);
  const suspects = k.characters.filter((x) => !x.kid && x.id !== k.victimId && room.players.some((p) => p.characterId === x.id));
  return {
    killerId: killer === "correct" ? c.killerId : wrongOption(suspects, c.killerId),
    methodId: method === "correct" ? c.methodId : wrongOption(k.methods, c.methodId),
    motiveId: motive === "correct" ? c.motiveId : wrongOption(k.motives, c.motiveId),
  };
}
const vote = (w: MmWorld, p: PlayerRef, ballot: unknown) => playerCall(w, w.game, p, { type: "ballot", ballot });

Then("the ballot options list suspects, methods and motives", async function (this: MmWorld) {
  const o = expectOk(await viewOf(this, this.game, "public"), "public").json.ballotOptions;
  assert.ok(o.suspects.length >= 2 && o.methods.length >= 2 && o.motives.length >= 2);
});
When("player {string} votes for the correct killer, method and motive", async function (this: MmWorld, a: string) {
  this.last = await vote(this, player(this.game, a), correctBallot(await this.room()));
});
Then("the ballot is accepted", function (this: MmWorld) { assert.equal(this.last.status, 200, this.last.text); });
Then("the public ballots-in count is {int}", async function (this: MmWorld, n: number) {
  assert.equal(expectOk(await viewOf(this, this.game, "public"), "public").json.ballotsIn, n);
});
Then("no view shows what player {string} voted for to anyone else", async function (this: MmWorld, a: string) {
  const me = player(this.game, a);
  const room = await this.room();
  const mine = room.players.find((p) => p.id === me.id)!.ballot!;
  const views = await allViews(this, this.game);
  for (const v of views) {
    if (v.who === `player:${me.name}`) continue;
    const objects = containsKey(v.json, ["ballot"]).filter((path) => {
      let val: any = v.json; for (const part of path.replace(/^\$\./, "").split(/\.|\[|\]/).filter(Boolean)) val = val?.[part];
      return val && typeof val === "object";
    });
    assert.deepEqual(objects, [], `${v.who} view carries a ballot object`);
    if (v.json.me) assert.equal(v.json.me.ballot, undefined, `${v.who} sees a ballot`);
    if (v.who === "host") for (const p of v.json.players) assert.equal(typeof p.ballot, "boolean");
  }
  assert.ok(mine);
});
Given("player {string} votes for any suspect", async function (this: MmWorld, a: string) {
  this.last = await vote(this, player(this.game, a), correctBallot(await this.room()));
});
When("player {string} votes with a killer id that does not exist", async function (this: MmWorld, a: string) {
  const b = { ...correctBallot(await this.room()), killerId: "no-such-character" };
  this.last = await vote(this, player(this.game, a), b);
});
Then("the ballot suspects contain no kid character", async function (this: MmWorld) {
  const room = await this.room();
  const o = expectOk(await viewOf(this, this.game, "public"), "public").json.ballotOptions;
  for (const s of o.suspects) assert.equal(room.case!.characters.find((c) => c.id === s.id)!.kid, false, `${s.name} is a kid`);
});
Then("the ballot suspects do not contain the victim", async function (this: MmWorld) {
  const room = await this.room();
  const o = expectOk(await viewOf(this, this.game, "public"), "public").json.ballotOptions;
  assert.ok(!o.suspects.some((s: any) => s.id === room.case!.victimId));
});
Given("player {string} has voted for a wrong killer", async function (this: MmWorld, a: string) {
  const room = await this.room();
  expectOk(await vote(this, player(this.game, a), ballotFor(room, "wrong", "correct", "correct")), "wrong ballot");
});
Then("player {string} has exactly one ballot", async function (this: MmWorld, a: string) {
  const room = await this.room();
  const p = room.players.find((x) => x.id === player(this.game, a).id)!;
  assert.ok(p.ballot && !Array.isArray(p.ballot), "no single ballot object");
  assert.equal(expectOk(await viewOf(this, this.game, "public"), "public").json.ballotsIn, room.players.filter((x) => x.ballot).length);
});
Then("that ballot names the correct killer", async function (this: MmWorld) {
  const room = await this.room();
  const p = room.players.find((x) => x.id === player(this.game, "P1").id)!;
  assert.equal(p.ballot!.killerId, room.case!.killerId);
});
When("someone votes as player {string} with the token of player {string}", async function (this: MmWorld, a: string, b: string) {
  const room = await this.room();
  this.last = await vote(this, { ...player(this.game, a), token: player(this.game, b).token }, correctBallot(room));
});
Given(/^player "(P\d)" votes with killer (correct|wrong), method (correct|wrong) and motive (correct|wrong)$/, async function (this: MmWorld, a: string, k: string, m: string, v: string) {
  expectOk(await vote(this, player(this.game, a), ballotFor(await this.room(), k, m, v)), "ballot");
});
async function scoreOf(w: MmWorld, name: string) {
  const room = await w.room();
  return room.result!.scores.find((s) => s.name === name)!;
}
Then("player {string} scores {int} points", async function (this: MmWorld, a: string, pts: number) {
  const pub = expectOk(await viewOf(this, this.game, "public"), "public").json;
  const me = player(this.game, a);
  assert.equal(pub.reveal.scores.find((s: any) => s.name === me.name).points, pts);
});
Then("every player without a ballot scores 0 points", async function (this: MmWorld) {
  const room = await this.room();
  for (const p of room.players.filter((x) => !x.ballot)) assert.equal((await scoreOf(this, p.name)).points, 0, p.name);
});
Then("their score detail says {string}", async function (this: MmWorld, text: string) {
  const room = await this.room();
  for (const p of room.players.filter((x) => !x.ballot)) assert.match((await scoreOf(this, p.name)).detail, new RegExp(text));
});
Given("fewer than half of the ballots name the killer", async function (this: MmWorld) {
  const room = await this.room();
  for (const a of ["P1", "P2", "P3"]) expectOk(await vote(this, player(this.game, a), ballotFor(room, "wrong", "wrong", "wrong")), "ballot");
});
Given("at least half of the ballots name the killer", async function (this: MmWorld) {
  const room = await this.room();
  for (const a of ["P1", "P2"]) expectOk(await vote(this, player(this.game, a), ballotFor(room, "correct", "wrong", "wrong")), "ballot");
  expectOk(await vote(this, player(this.game, "P3"), ballotFor(room, "wrong", "wrong", "wrong")), "ballot");
});
async function killerName(w: MmWorld) { const r = await w.room(); return r.players.find((p) => p.characterId === r.case!.killerId)!.name; }
Then("the player who played the killer scores {int} bonus points", async function (this: MmWorld, n: number) {
  const s = await scoreOf(this, await killerName(this));
  assert.equal(s.points, n, s.detail);
  assert.match(s.detail, /got away/);
});
Then("the player who played the killer scores no bonus points", async function (this: MmWorld) {
  const s = await scoreOf(this, await killerName(this));
  assert.equal(s.points, 0, s.detail);
  assert.doesNotMatch(s.detail, /got away/);
});
Given("several players have voted differently", async function (this: MmWorld) {
  const room = await this.room();
  const plans: [string, string, string, string][] = [["P1", "correct", "correct", "correct"], ["P2", "correct", "wrong", "wrong"], ["P3", "wrong", "wrong", "wrong"], ["P5", "wrong", "correct", "correct"]];
  for (const [a, k, m, v] of plans) expectOk(await vote(this, player(this.game, a), ballotFor(room, k, m, v)), "ballot");
});
Then("the scores are sorted from highest to lowest", async function (this: MmWorld) {
  const pts = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal.scores.map((s: any) => s.points) as number[];
  assert.ok(pts.length > 2);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.ok(new Set(pts).size > 2, "fixture should produce at least three different scores");
});
