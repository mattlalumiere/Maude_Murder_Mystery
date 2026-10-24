// Saved stories, gallery, votes, and replay. Run: npx tsx scripts/stories.test.ts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.STORY_FILE_DIR = mkdtempSync(join(tmpdir(), "mm-stories-"));
process.env.AUTH_SECRET = "test-secret";

import { addBots, addPlayer, advance, createRoom, startGame } from "../src/lib/engine";
import { getStore, mutate } from "../src/lib/store";
import {
  deleteStory, engagementOf, getRecap, getStoryMeta, getStoryStore, listGallery, listLibrary, openJson, openStoryCase,
  recordPlay, reportStory, saveStory, sealJson, setVote,
} from "../src/lib/stories";

const load = async (code: string) => (await getStore().get(code))!;

async function playedRoom(host: string, opts: { story?: { id: string; mode: "random" | "choose" }; claims?: Record<string, string>; reveal?: boolean } = {}) {
  const r = await createRoom(host, "secretcode", { name: "Family Night" }, 2, { avatars: false, scenesPerAct: 0, videoClips: 0, quality: "standard" }, opts.story ? { story: opts.story } : {});
  await mutate(r.code, (room) => {
    addPlayer(room, "Hana", "adult", false, true, { backstoryMode: "own", backstory: "I am a retired lighthouse keeper with a secret recipe." }, opts.claims?.Hana);
    addPlayer(room, "Ben", "adult", false, true, undefined, opts.claims?.Ben);
    addPlayer(room, "Cleo", "adult", false, true, undefined, opts.claims?.Cleo);
    addPlayer(room, "Kit", "kid", false, true, undefined, opts.claims?.Kit);
    addPlayer(room, "Zed", "kid", false, true, undefined, opts.claims?.Zed);
  });
  await mutate(r.code, (room) => startGame(room));
  if (opts.reveal !== false) for (let i = 0; i < 7; i++) await mutate(r.code, (room) => advance(room));
  return r.code;
}

async function main() {
  // ---- sealing
  const blob = sealJson({ secret: "the butler did it" }, "ST0000000001");
  assert.ok(!blob.toString().includes("butler"), "ciphertext hides the content");
  assert.deepEqual(openJson(blob, "ST0000000001"), { secret: "the butler did it" });
  assert.throws(() => openJson(blob, "ST0000000002"), undefined, "wrong story id fails (aad binding)");
  const tampered = JSON.parse(blob.toString()); tampered.ct = Buffer.from("x".repeat(30)).toString("base64");
  assert.throws(() => openJson(Buffer.from(JSON.stringify(tampered)), "ST0000000001"), undefined, "tampering is detected");

  // ---- save a finished night as a choose-your-character story with a recap
  const code = await playedRoom("hostA");
  let room = await load(code);
  const k = room.case!;
  const killer = k.characters.find((c) => c.id === k.killerId)!;
  const saved = await saveStory(room, "hostA", { kind: "cast", visibility: "link", includeRecap: true, recapNames: false, recapPictures: false, title: "The Lighthouse Toast", blurb: "A toast goes wrong." });
  const meta = (await getStoryMeta(saved.id))!;
  assert.equal(meta.kind, "cast");
  assert.ok(meta.characters && meta.characters.length >= 10, "cast preview present for cast stories");
  const metaText = JSON.stringify(meta);
  for (const c of k.characters) assert.ok(!metaText.includes(c.card.secret), "no private secret in the public meta");
  assert.ok(!metaText.includes(k.truth.story) && !/killerId|victimId|methodId|truth/.test(metaText), "no solution fields in the public meta");

  const raw = (await getStoryStore().get(`${saved.id}/story/pack.sealed.json`))!.bytes.toString();
  assert.ok(!raw.includes(killer.card.secret) && !raw.includes(k.truth.story), "stored pack is sealed");
  const opened = await openStoryCase(saved.id);
  assert.equal(opened.killerId, k.killerId);
  assert.ok(opened.characters.every((c) => !c.id.startsWith("guest-") && !(c.card as { extra?: string }).extra && !("forHandle" in c)), "night-specific data is stripped");
  assert.ok(!JSON.stringify(opened).includes("lighthouse keeper"), "a player's own backstory never ends up in the pack");

  const recap = (await getRecap(saved.id))!;
  assert.ok(recap.reveal?.killer, "recap has the ending (shown behind a spoiler gate)");
  const recapText = JSON.stringify(recap);
  for (const n of ["Hana", "Ben", "Cleo", "Zed"]) assert.ok(!recapText.includes(n), `recap leaks the real name ${n}`);
  const named = await saveStory(room, "hostA", { kind: "story", visibility: "link", includeRecap: true, recapNames: true, recapPictures: false });
  assert.ok(JSON.stringify(await getRecap(named.id)).includes("Hana"), "names appear only when the host opts in");
  assert.equal((await getStoryMeta(named.id))!.characters, undefined, "storyline-only hides the cast list");

  // public stories never carry names or pictures, even if asked
  const pub = await saveStory(room, "hostA", { kind: "story", visibility: "public", includeRecap: true, recapNames: true, recapPictures: true, title: "Public Pumpkins" });
  const pm = (await getStoryMeta(pub.id))!;
  assert.equal(pm.recapNames, false); assert.equal(pm.recapPictures, false);
  assert.ok(!JSON.stringify(await getRecap(pub.id)).includes("Hana"));
  assert.ok((await listGallery()).some((g) => g.id === pub.id), "public story listed in the gallery");
  assert.ok(!(await listGallery()).some((g) => g.id === saved.id), "link-only stories are not listed");

  // validation
  await assert.rejects(saveStory(room, "hostA", { kind: "story", visibility: "link", includeRecap: false, recapNames: false, recapPictures: false, title: "what the fuck" }), /family friendly/);
  const early = await playedRoom("hostB", { reveal: false });
  assert.equal((await saveStory(await load(early), "hostB", { kind: "story", visibility: "link", includeRecap: true, recapNames: false, recapPictures: false })).meta.hasRecap, false, "no recap before the reveal");

  // ---- library and delete
  assert.ok((await listLibrary("hostA")).length >= 3);
  assert.equal((await listLibrary("someoneElse")).length, 0);
  await assert.rejects(deleteStory("someoneElse", named.id), /owner/);
  await deleteStory("hostA", named.id);
  assert.equal(await getStoryMeta(named.id), null);
  assert.ok(!(await listLibrary("hostA")).some((e) => e.id === named.id));

  // ---- votes: one per account, played votes separate, gallery ranking, reports hide
  await setVote(pub.id, { account: "u1" }, true);
  await setVote(pub.id, { account: "u1" }, true);
  let e = await engagementOf(pub.id);
  assert.equal(e.votes, 1, "one vote per account");
  await setVote(pub.id, { player: { room: code, player: "p1" } }, true);
  await setVote(pub.id, { player: { room: code, player: "p2" } }, true);
  e = await engagementOf(pub.id);
  assert.equal(e.votes, 3); assert.equal(e.playedVotes, 2);
  await setVote(pub.id, { account: "u1" }, false);
  assert.equal((await engagementOf(pub.id)).votes, 2, "votes can be withdrawn");
  const other = await saveStory(room, "hostA", { kind: "story", visibility: "public", includeRecap: false, recapNames: false, recapPictures: false, title: "Quiet Story" });
  assert.equal((await listGallery({ sort: "top" }))[0].id, pub.id, "most voted first");
  assert.equal((await listGallery({ sort: "new" }))[0].id, other.id, "newest first");
  assert.equal((await listGallery({ q: "pumpkins" })).length, 1, "search by title");
  for (const r of ["r1", "r2", "r3"]) await reportStory(other.id, r);
  assert.ok(!(await listGallery()).some((g) => g.id === other.id), "three reports hide a story from the gallery");
  await assert.rejects(setVote("ST00000000ff", { account: "x" }, true), /not found/);

  // ---- replay: choose-your-character
  const cast = (await getStoryMeta(saved.id))!.characters!;
  const adultChars = cast.filter((c) => !c.kid), kidChars = cast.filter((c) => c.kid);
  const killerId = k.killerId, victimId = k.victimId;
  const wantAdultA = adultChars.find((c) => c.id !== killerId && c.id !== victimId)!;
  const wantKid = kidChars.find((c) => c.id !== victimId)!;
  const replay = await playedRoom("hostC", {
    story: { id: saved.id, mode: "choose" }, reveal: false,
    claims: { Hana: wantAdultA.id, Ben: wantAdultA.id /* taken */, Cleo: wantKid.id /* wrong age */, Kit: wantKid.id, Zed: victimId },
  });
  const rr = await load(replay);
  assert.equal(rr.caseSource, "story");
  assert.equal(rr.case!.killerId, k.killerId, "same mystery");
  const by = (n: string) => rr.players.find((p) => p.name === n)!;
  assert.equal(by("Hana").characterId, wantAdultA.id, "Hana gets her choice");
  assert.notEqual(by("Ben").characterId, wantAdultA.id, "a taken character goes to the first asker only");
  assert.equal(kidChars.some((c) => c.id === by("Cleo").characterId), false, "an adult cannot take a young character");
  assert.equal(by("Kit").characterId, wantKid.id, "a young player gets a young character");
  assert.equal(by("Zed").characterId, victimId, "a young player can ask to be the victim");
  assert.equal(new Set(rr.players.map((p) => p.characterId)).size, rr.players.length, "everyone has a unique character");
  assert.ok(rr.players.some((p) => p.characterId === killerId && p.ageGroup === "adult"), "the killer is a grown-up");
  for (let i = 0; i < 30 && (await engagementOf(saved.id)).plays < 1; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal((await engagementOf(saved.id)).plays, 1, "a play is counted");
  // no claim honoured outside choose mode
  const randomRoom = await playedRoom("hostD", { story: { id: saved.id, mode: "random" }, claims: { Hana: wantAdultA.id }, reveal: false });
  assert.equal((await load(randomRoom)).players.find((p) => p.name === "Hana")!.wantsCharacter, undefined, "requests are ignored in random mode");

  // ---- with AI guests and a story
  const botRoom = await createRoom("hostE", "secretcode", {}, 1, undefined, { story: { id: pub.id, mode: "random" } });
  await mutate(botRoom.code, (rm) => { addPlayer(rm, "Solo", "adult", false, true); addPlayer(rm, "Kid", "kid", false, true); addBots(rm, 2); });
  await mutate(botRoom.code, (rm) => startGame(rm));
  assert.equal((await load(botRoom.code)).phase, "cards");
  void recordPlay;
  console.log("OK: stories (sealed packs, recap privacy, gallery, votes, reports, replay, choose-your-character)");
}
main().catch((e) => { console.error(e); process.exit(1); });
