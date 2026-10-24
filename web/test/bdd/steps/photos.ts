import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { createGame, expectOk, joinPlayer, jpeg, uploadPhoto, viewOf, hostCall, startGame, fillLobby } from "../support/fixtures";
import { faults } from "../support/seams";
import { listObjects } from "../support/stores";
import { allViews } from "../support/fixtures";
import type { MmWorld, PlayerRef } from "../support/world";

const who = (w: MmWorld, name: string): PlayerRef => w.game.players.find((p) => p.name === name)!;
const photoObjects = (w: MmWorld) => listObjects(w.mediaDir).filter((k) => k.includes("/photos/"));

Given("a game in the lobby with an adult player {string} and a kid player {string}", async function (this: MmWorld, adult: string, kid: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, {});
  await joinPlayer(this, ctx, adult, "adult");
  await joinPlayer(this, ctx, kid, "kid");
});
When("{string} uploads a valid JPEG with consent {string}", async function (this: MmWorld, name: string, consent: string) { await uploadPhoto(this, this.game, who(this, name), consent).then((r) => { this.last = r; this.all.push(r); }); });
When("{string} uploads a valid JPEG without a consent statement", async function (this: MmWorld, name: string) { this.last = await uploadPhoto(this, this.game, who(this, name), null); });
When("{string} uploads a PNG with consent {string}", async function (this: MmWorld, name: string, consent: string) {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 1)]);
  this.last = await uploadPhoto(this, this.game, who(this, name), consent, png);
});
When("{string} uploads a JPEG larger than 2 megabytes with consent {string}", async function (this: MmWorld, name: string, consent: string) {
  this.last = await uploadPhoto(this, this.game, who(this, name), consent, jpeg(2 * 1024 * 1024 + 10));
});
Given("{string} has uploaded a valid JPEG with consent {string}", async function (this: MmWorld, name: string, consent: string) {
  expectOk(await uploadPhoto(this, this.game, who(this, name), consent), `photo ${name}`);
});
Given("{string} and {string} have uploaded photos", async function (this: MmWorld, a: string, b: string) {
  expectOk(await uploadPhoto(this, this.game, who(this, a), "self"), "photo a");
  expectOk(await uploadPhoto(this, this.game, who(this, b), "guardian"), "photo b");
});
Then("the upload is accepted", function (this: MmWorld) { assert.equal(this.last.status, 200, this.last.text); });
Then("{string} can view their own photo", async function (this: MmWorld, name: string) {
  const r = await this.call("GET", `/api/rooms/${this.game.code}/photo`, { host: null, player: who(this, name) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.match(r.headers.get("cache-control") ?? "", /private|no-store/);
});
Then("the host view shows that {string} has a photo", async function (this: MmWorld, name: string) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host").json;
  assert.equal(v.players.find((p: any) => p.name === name).hasPhoto, true);
});
Then("no photo is stored", async function (this: MmWorld) {
  assert.deepEqual(photoObjects(this), []);
  assert.ok((await this.room()).players.every((p) => !p.profile.photoKey));
});
Then("no view contains a photo key, a photo URL or photo bytes", async function (this: MmWorld) {
  const room = await this.room();
  const keys = room.players.map((p) => p.profile.photoKey).filter(Boolean) as string[];
  assert.ok(keys.length > 0, "fixture: a photo key should exist");
  for (const v of await allViews(this, this.game)) {
    for (const k of keys) assert.ok(!v.text.includes(k), `${v.who} contains a photo key`);
    assert.ok(!/photoKey|photos\/|\.jpg|data:image|\/photo\b/.test(v.text), `${v.who} mentions a photo path`);
  }
});
When("{string} requests the photo of {string}", async function (this: MmWorld, a: string, b: string) {
  const ada = who(this, b), kit = who(this, a);
  const attempts = [
    await this.call("GET", `/api/rooms/${this.game.code}/photo`, { host: null, player: kit }),
    await this.call("GET", `/api/rooms/${this.game.code}/photo`, { host: null, player: { id: ada.id, token: kit.token } }),
  ];
  this.s.attempts = attempts;
  this.last = attempts[1];
  for (const r of attempts) assert.ok(r.status >= 400, `a photo was served: HTTP ${r.status}`);
});
When("the big screen requests any photo", async function (this: MmWorld) {
  this.last = await this.call("GET", `/api/rooms/${this.game.code}/photo`, { host: null });
});
When("anyone requests the media route with a photo's storage key", async function (this: MmWorld) {
  const room = await this.room();
  const key = room.players.find((p) => p.profile.photoKey)!.profile.photoKey!;
  const tries = [key, encodeURIComponent(key), room.players.find((p) => p.profile.photoKey)!.id];
  for (const id of tries) {
    const r = await this.call("GET", `/api/rooms/${this.game.code}/media/${id}`, { host: null });
    assert.equal(r.status, 404, `media route answered ${r.status} for ${id}`);
  }
});
Given("the photo safety check will reject the next photo", function (this: MmWorld) { faults.rejectNextPhoto = "Photo flagged. Please choose a different one."; });
When("{string} removes their photo", async function (this: MmWorld, name: string) {
  this.last = await this.call("POST", `/api/rooms/${this.game.code}/action`, { host: null, player: who(this, name), body: { type: "removePhoto" } });
  expectOk(this.last, "removePhoto");
});
Then("no photo remains for {string}", async function (this: MmWorld, name: string) {
  const room = await this.room();
  assert.equal(room.players.find((p) => p.name === name)!.profile.photoKey, undefined);
  assert.ok(!photoObjects(this).some((k) => k.includes(who(this, name).id)), "the blob is still stored");
});
Then("the consent of {string} is {string}", async function (this: MmWorld, name: string, consent: string) {
  assert.equal((await this.room()).players.find((p) => p.name === name)!.profile.consent, consent);
});
When("the host purges all photos", async function (this: MmWorld) { this.last = await hostCall(this, this.game, { type: "purgePhotos" }); expectOk(this.last, "purge"); });
Then("no photo remains in storage for the game", function (this: MmWorld) { assert.deepEqual(photoObjects(this), []); });
Then("no player has a photo", async function (this: MmWorld) {
  const v = expectOk(await viewOf(this, this.game, "host"), "host").json;
  assert.ok(v.players.every((p: any) => !p.hasPhoto));
});
Given("the game has started", async function (this: MmWorld) {
  const room = await this.room();
  const adults = room.players.filter((p) => p.ageGroup === "adult").length;
  await fillLobby(this, this.game, { adults: Math.max(0, 2 - adults), kids: Math.max(0, 4 - room.players.length - Math.max(0, 2 - adults)) });
  await startGame(this, this.game);
});
Then("no object remains in storage for the game", async function (this: MmWorld) {
  const code = this.game.code;
  const gameId = this.s.gameId ?? this.s.deletedGameId;
  const left = listObjects(this.mediaDir).filter((k) => k.includes(`/${code}/`) || (gameId && k.includes(`/${gameId}/`)));
  assert.deepEqual(left, []);
});
void hostCall;
