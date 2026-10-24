import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { containsKey, otherCards, ownCardStrings, strings, truthLeaks, type Truth } from "../support/asserts";
import { advanceTo, allViews, cardText, correctBallot, createGame, expectOk, hostCall, player, playerCall, startedGame, viewOf } from "../support/fixtures";
import { sampleCaseJson } from "../support/ai";
import type { Phase } from "../../../src/lib/types";
import type { MmWorld } from "../support/world";

type View = { who: string; json: any; text: string };

When(/^the "(public|host|player)" is read in the "(\w+)" phase$/, async function (this: MmWorld, kind: string, phase: Phase) {
  await advanceTo(this, this.game, phase);
  const views: View[] = [];
  if (kind === "public") { const r = expectOk(await viewOf(this, this.game, "public"), "public"); views.push({ who: "public", json: r.json, text: r.text }); }
  if (kind === "host") { const r = expectOk(await viewOf(this, this.game, "host"), "host"); views.push({ who: "host", json: r.json, text: r.text }); }
  if (kind === "player") for (const p of this.game.players) { const r = expectOk(await viewOf(this, this.game, p), `player ${p.name}`); views.push({ who: `player:${p.name}`, json: r.json, text: r.text }); }
  this.s.read = views;
});

async function noLeak(w: MmWorld, which: Truth[]) {
  const room = await w.room();
  const bad: string[] = [];
  for (const v of w.s.read as View[]) for (const l of truthLeaks(v.json, room, which, { ownBallotOk: true })) bad.push(`${v.who}: ${l}`);
  assert.deepEqual(bad, [], `leaks: ${bad.join("; ")}`);
}
Then("the view does not contain the killer", async function (this: MmWorld) { await noLeak(this, ["killer"]); });
Then("the view does not contain the method truth", async function (this: MmWorld) { await noLeak(this, ["method"]); });
Then("the view does not contain the motive truth", async function (this: MmWorld) { await noLeak(this, ["motive"]); });
Then("the view does not contain the true story", async function (this: MmWorld) { await noLeak(this, ["story"]); });
Then("the view does not contain any nudge or advanced hint", async function (this: MmWorld) { await noLeak(this, ["hints"]); });
Then("the view does not contain the override hash or salt", async function (this: MmWorld) { await noLeak(this, ["override"]); });

When("player {string} reads their player view", async function (this: MmWorld, alias: string) {
  const p = player(this.game, alias);
  const r = expectOk(await viewOf(this, this.game, p), "player view");
  this.s.read = [{ who: `player:${p.name}`, json: r.json, text: r.text }];
  this.s.reader = p;
});
Then("the view contains the card of the character played by {string}", async function (this: MmWorld, alias: string) {
  const room = await this.room();
  const p = player(this.game, alias);
  const char = room.case!.characters.find((c) => c.id === room.players.find((x) => x.id === p.id)!.characterId)!;
  const card = (this.s.read as View[])[0].json.me.character.card;
  assert.deepEqual(card, char.card);
});
Then("the view contains no other character's card", async function (this: MmWorld) {
  const room = await this.room();
  const p = this.s.reader;
  const mine = room.players.find((x) => x.id === p.id)!.characterId;
  const own = ownCardStrings(room, mine);
  const text = (this.s.read as View[])[0].text;
  const hits = otherCards(room, mine).filter((s) => !own.has(s) && text.includes(s));
  assert.deepEqual(hits, []);
  assert.equal(containsKey(JSON.parse(text), ["characters"]).length, 0);
});
When("the big screen reads the public view in the {string} phase", async function (this: MmWorld, phase: Phase) {
  await advanceTo(this, this.game, phase);
  const r = expectOk(await viewOf(this, this.game, "public"), "public");
  this.s.read = [{ who: "public", json: r.json, text: r.text }];
});
Then("the view contains no card text for any character", async function (this: MmWorld) {
  const room = await this.room();
  const text = (this.s.read as View[])[0].text;
  const hits = otherCards(room).filter((s) => text.includes(s));
  assert.deepEqual(hits, []);
  assert.equal(containsKey(JSON.parse(text), ["card", "secret", "alibi", "knows"]).length, 0);
});

// ---- clues ----
Then("the public view contains no clues", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "public"), "public").json;
  assert.deepEqual(v.clues, []);
});
Then("the public view contains only round 1 clues", async function (this: MmWorld) {
  const room = await this.room();
  const v = expectOk(await viewOf(this, this.game, "public"), "public").json;
  const r1 = room.case!.clues.filter((c) => c.round === 1).map((c) => c.id).sort();
  assert.deepEqual(v.clues.map((c: any) => c.id).sort(), r1);
  assert.ok(v.clues.every((c: any) => c.round === 1));
});
Then("the twist is not visible", async function (this: MmWorld) {
  const room = await this.room();
  const r = expectOk(await viewOf(this, this.game, "public"), "public");
  assert.ok(!r.text.includes(room.case!.twist.slice(0, 30)));
  assert.ok(!r.json.clues.some((c: any) => c.id === "twist"));
});
Then("the public view contains the round 2 clues and the twist", async function (this: MmWorld) {
  const room = await this.room();
  const v = expectOk(await viewOf(this, this.game, "public"), "public").json;
  const want = [...room.case!.clues.map((c) => c.id), "twist"].sort();
  assert.deepEqual(v.clues.map((c: any) => c.id).sort(), want);
  assert.ok(v.clues.find((c: any) => c.id === "twist").text === room.case!.twist);
});

// ---- credentials ----
When("player {string} reads the state with a wrong token", async function (this: MmWorld, alias: string) {
  const p = player(this.game, alias);
  await this.call("GET", `/api/rooms/${this.game.code}/state`, { host: null, player: { id: p.id, token: "not-the-token" }, query: { role: "player" } });
});
When("the host reads the host view in the {string} phase", async function (this: MmWorld, phase: Phase) {
  await advanceTo(this, this.game, phase);
  if (phase === "act4") {
    // Make the ballot check meaningful: every player has a ballot on file.
    const room = await this.room();
    for (const p of this.game.players) expectOk(await playerCall(this, this.game, p, { type: "ballot", ballot: correctBallot(room) }), `ballot ${p.name}`);
  }
  const r = expectOk(await viewOf(this, this.game, "host"), "host");
  this.s.hostView = r.json;
  this.s.read = [{ who: "host", json: r.json, text: r.text }];
});
Then("the host view does not contain the killer", async function (this: MmWorld) { await noLeak(this, ["killer", "method", "motive", "story", "hints", "override"]); });
Then("the host view does not contain any player's card text", async function (this: MmWorld) {
  const room = await this.room();
  const text = (this.s.read as View[])[0].text;
  const all: string[] = [];
  for (const c of room.case!.characters) for (const s of cardText(c as any)) if (s.length >= 14) all.push(s);
  assert.deepEqual(all.filter((s) => text.includes(s)), []);
});
Then("the host view does not show the content of any ballot", async function (this: MmWorld) {
  const room = await this.room();
  assert.ok(room.players.every((p) => p.ballot), "fixture: every player should have voted");
  const hv = this.s.hostView;
  for (const p of hv.players) assert.equal(typeof p.ballot, "boolean", `ballot of ${p.name} is not just a flag`);
  assert.equal(containsKey(hv, ["methodId", "motiveId", "killerId"]).length, 0);
});
When("the host tries every host action except override in the {string} phase", async function (this: MmWorld, phase: Phase) {
  await advanceTo(this, this.game, phase);
  const ctx = this.game;
  const out: string[] = [];
  const push = (r: { text: string }) => out.push(r.text);
  push(await hostCall(this, ctx, { type: "start" }));
  push(await hostCall(this, ctx, { type: "pause" }));
  push(await hostCall(this, ctx, { type: "advance" }));
  push(await hostCall(this, ctx, { type: "resume" }));
  push(await hostCall(this, ctx, { type: "addPlayer", name: "Late", ageGroup: "adult" }));
  push(await hostCall(this, ctx, { type: "setPlan", plan: { avatars: false, scenesPerAct: 0, videoClips: 0 } }));
  push(await hostCall(this, ctx, { type: "purgePhotos" }));
  push(await hostCall(this, ctx, { type: "kick", playerId: ctx.players[ctx.players.length - 1].id }));
  push(await this.call("POST", `/api/rooms/${ctx.code}/media/run`, { host: ctx.hostId }));
  push(await this.call("GET", `/api/rooms/${ctx.code}/export`, { host: ctx.hostId }));
  push(await hostCall(this, ctx, { type: "advance" }));
  this.s.actionTexts = out;
});
Then("no action response contains the killer, method or motive", async function (this: MmWorld) {
  const room = await this.room();
  const k = room.case!;
  const forbidden = [k.killerId, k.truth.methodId, k.truth.motiveId, k.truth.story.slice(0, 40),
    k.methods.find((m) => m.id === k.truth.methodId)!.text, k.motives.find((m) => m.id === k.truth.motiveId)!.text,
    k.characters.find((c) => c.id === k.killerId)!.name];
  for (const t of this.s.actionTexts as string[]) for (const f of forbidden) assert.ok(!t.includes(f), `an action response contains "${f}": ${t.slice(0, 150)}`);
});
Given("a second signed-in host who does not own the game", function (this: MmWorld) { this.s.otherHost = "dev:Intruder"; });
When("the second host reads the host view", async function (this: MmWorld) {
  await this.call("GET", `/api/rooms/${this.game.code}/state`, { host: this.s.otherHost, query: { role: "host" } });
});
When("a request fails for any reason", async function (this: MmWorld) {
  const ctx = this.game; const p1 = player(ctx, "P1"); const p2 = player(ctx, "P2");
  const rs = [
    await this.call("GET", `/api/rooms/${ctx.code}/state`, { host: null, player: { id: p1.id, token: "wrong" }, query: { role: "player" } }),
    await this.call("GET", `/api/rooms/NOPE/state`, { host: null }),
    await this.call("GET", `/api/rooms/..%2F..%2Fetc/state`, { host: null }),
    await this.call("POST", `/api/rooms/${ctx.code}/join`, { host: null, body: { name: p1.name, ageGroup: "adult" } }),
    await playerCall(this, ctx, p2, { type: "ballot", ballot: { killerId: "x", methodId: "y", motiveId: "z" } }),
    await hostCall(this, ctx, { type: "override", code: "wrong-code-123", cmd: "NUDGE" }),
    await hostCall(this, ctx, { type: "nope" }),
    await this.call("POST", `/api/rooms/${ctx.code}/action`, { host: ctx.hostId, raw: "{not json" }),
    await this.call("GET", `/api/rooms/${ctx.code}/photo`, { host: null, player: p1 }),
    await this.call("POST", `/api/rooms`, { host: null, body: { overrideCode: "hunter2" } }),
  ];
  this.s.failures = rs;
  assert.ok(rs.every((r) => r.status >= 400), `fixture: all requests should fail, got ${rs.map((r) => r.status)}`);
});
Then("the error message contains no token, no override code, no solution text and no storage key", async function (this: MmWorld) {
  const room = await this.room();
  const k = room.case!;
  const bad: string[] = [...room.players.map((p) => p.token), this.game.overrideCode, "wrong-code-123", k.killerId, k.truth.story.slice(0, 30), room.gameId, room.overrideHash, room.overrideSalt, `${this.cell}/games`, "room.json", "/Users/", "node_modules"];
  for (const r of this.s.failures as { text: string; headers: Headers }[]) for (const b of bad) assert.ok(!r.text.includes(b), `an error response contains "${b}": ${r.text.slice(0, 160)}`);
  assert.ok(strings(this.consoleLines).every((l) => !room.players.some((p) => l.includes(p.token))), "a log line contains a token");
});
When("a caller without credentials polls the player view with a matching version number", async function (this: MmWorld) {
  const v = (await this.room()).version;
  await this.call("GET", `/api/rooms/${this.game.code}/state`, { host: null, query: { role: "player", v } });
});
Then("the response does not reveal the version number", function (this: MmWorld) {
  assert.ok(!/"version"|"unchanged"/.test(this.last.text), this.last.text);
});
Then("the public view contains a reveal block with the killer, method, motive and story", async function (this: MmWorld) {
  const room = await this.room();
  const k = room.case!;
  const v = expectOk(await viewOf(this, this.game, "public"), "public").json.reveal;
  assert.ok(v, "no reveal block");
  assert.equal(v.killer, k.characters.find((c) => c.id === k.killerId)!.name);
  assert.equal(v.method, k.methods.find((m) => m.id === k.truth.methodId)!.text);
  assert.equal(v.motive, k.motives.find((m) => m.id === k.truth.motiveId)!.text);
  assert.equal(v.story, k.truth.story);
});
Then("no view contains any player's secret card text other than that player's own card", async function (this: MmWorld) {
  const room = await this.room();
  const views = await allViews(this, this.game);
  const bad: string[] = [];
  for (const v of views) {
    const mine = v.who.startsWith("player:") ? room.players.find((p) => p.name === v.who.slice(7))!.characterId : undefined;
    const own = ownCardStrings(room, mine);
    for (const s of otherCards(room, mine)) if (!own.has(s) && v.text.includes(s)) bad.push(`${v.who}: ${s.slice(0, 40)}`);
  }
  assert.deepEqual(bad, []);
});
Given("fixture helpers are loaded", async function (this: MmWorld) { void createGame; void startedGame; void sampleCaseJson; });
