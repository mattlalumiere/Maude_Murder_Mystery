// Notebook, table chat, and selfie booth. Run: npx tsx scripts/play.test.ts
import assert from "node:assert/strict";
import { addBots, addPlayer, advance, createRoom, playerView, publicView, saveNotes, startGame } from "../src/lib/engine";
import { runNext } from "../src/lib/media-runner";
import { getMediaStore } from "../src/lib/media-store";
import { POST as chatPost } from "../src/app/api/rooms/[code]/chat/route";
import { POST as selfiePost } from "../src/app/api/rooms/[code]/selfie/route";
import { deleteSelfie, regenSelfie } from "../src/lib/selfie";
import { dropAvatar, regenAvatar } from "../src/lib/media-jobs";
import { postChat } from "../src/lib/chat";
import { answerCall, endCall, startCall } from "../src/lib/calls";
import { SELFIE_STYLES } from "../src/lib/selfie-styles";
import { getStore, mutate } from "../src/lib/store";

const SMALL = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDsaKKK8I+lCirFpZz3e/7PHv24zyBjP1qx/Y99/wA8P/H1/wAadiXJLdmfRWh/Y99/zw/8fX/Gq93Zz2m37RHs3ZxyDnH0osCknsyvRRRSKCiiigDoPCn/AC9f8A/rW/WB4U/5ev8AgH9a360WxyVPiYVgeK/+XX/gf9K36wPFf/Lr/wAD/pQ9gp/Ejn6KKKzOsKKKKAOg8Kf8vX/AP61v1geFP+Xr/gH9a360WxyVPiYVgeK/+XX/AIH/AErfrA8V/wDLr/wP+lD2Cn8SOfooorM6wooooAsWl5Pab/s8mzdjPAOcfWrH9sX3/Pf/AMcX/Cs+inclxT3Rof2xff8APf8A8cX/AAqvd3k93t+0Sb9uccAYz9Kr0UXBRS2QUUUUij//2Q==", "base64");
// Pad with a comment segment (stripped by the server) so the upload clears the minimum size.
const pad = Buffer.alloc(1500, 0x20);
const FACE = Buffer.concat([SMALL.subarray(0, 2), Buffer.from([0xff, 0xfe, (pad.length + 2) >> 8, (pad.length + 2) & 0xff]), pad, SMALL.subarray(2)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const load = async (code: string) => (await getStore().get(code))!;
const hdr = (p: { id: string; token: string }, extra: Record<string, string> = {}) => ({ "x-player-id": p.id, "x-player-token": p.token, ...extra });
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

async function main() {
  const r = await createRoom("hostP", "secretcode", { name: "Play" }, 5, { avatars: false, scenesPerAct: 0, videoClips: 0, quality: "standard" });
  const code = r.code;
  await mutate(code, (rm) => { ["Hana", "Ben", "Cleo", "Dmitri"].forEach((n) => addPlayer(rm, n, "adult", false, true)); addPlayer(rm, "Zed", "kid", false, true); addBots(rm, 1); });
  await mutate(code, (rm) => startGame(rm));
  await mutate(code, (rm) => advance(rm)); // act1
  let room = await load(code);
  const hana = room.players.find((p) => p.name === "Hana")!, ben = room.players.find((p) => p.name === "Ben")!, zed = room.players.find((p) => p.name === "Zed")!;
  const bot = room.players.find((p) => p.isBot)!;

  // ---- notebook: private, clamped, never in other views
  await mutate(code, (rm) => saveNotes(rm.players.find((p) => p.id === hana.id)!, "Ben was near the punch bowl.\u0000" + "x".repeat(5000)));
  room = await load(code);
  assert.equal(playerView(room, room.players.find((p) => p.id === hana.id)!).me.notes!.length, 4000, "notes are clamped");
  assert.ok(!playerView(room, room.players.find((p) => p.id === hana.id)!).me.notes!.includes("\u0000"));
  assert.equal(playerView(room, room.players.find((p) => p.id === ben.id)!).me.notes, "", "other players never see my notes");
  assert.ok(!JSON.stringify(publicView(room)).includes("punch bowl"), "the TV never sees notes");
  assert.throws(() => saveNotes(hana, 42 as never));

  // ---- chat: players talk, an addressed AI guest answers, bad words and floods are stopped
  const post = (p: typeof hana, text: string) => chatPost(new Request("http://x", { method: "POST", headers: hdr(p), body: JSON.stringify({ text }) }), ctx(code));
  assert.equal((await post(hana, "Hello everyone")).status, 200);
  assert.equal((await post(hana, "again too fast")).status, 429, "rate limited");
  assert.equal((await post(ben, "what the fuck")).status, 400, "unfriendly words are refused");
  assert.equal((await post(zed, "I saw the dog")).status, 200, "kids can chat");
  room = await load(code);
  const botChar = room.case!.characters.find((c) => c.id === bot.characterId)!;
  await new Promise((res) => setTimeout(res, 1600));
  const res = await post(hana, `${botChar.name.split(" ")[0]}, where were you?`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { reply?: { text: string } };
  assert.ok(body.reply?.text, "the addressed guest replied");
  room = await load(code);
  assert.ok(room.chat!.some((m) => m.bot && m.from === bot.id), "the reply is on the table");
  const view = playerView(room, room.players.find((p) => p.id === ben.id)!);
  assert.ok(view.chat.length >= 3 && view.chat.every((m) => !("token" in m)));
  assert.equal((await chatPost(new Request("http://x", { method: "POST", headers: { "x-player-id": "nope", "x-player-token": "nope" }, body: JSON.stringify({ text: "hi" }) }), ctx(code))).status, 401, "chat needs a seat");
  await mutate(code, (rm) => { rm.paused = true; });
  await new Promise((res) => setTimeout(res, 1600));
  assert.equal((await post(ben, "paused?")).status, 409, "no chat while paused");
  await mutate(code, (rm) => { rm.paused = false; });

  // ---- private messages and voice calls between players (and with AI guests)
  const cleo = room.players.find((p) => p.name === "Cleo")!;
  await sleep(1600);
  await mutate(code, (rm) => { postChat(rm, rm.players.find((p) => p.id === hana.id)!, "Psst Ben, I saw the butler", ben.id); });
  room = await load(code);
  const seen = (pid: string) => playerView(room, room.players.find((p) => p.id === pid)!).chat.map((m) => m.text);
  assert.ok(seen(ben.id).includes("Psst Ben, I saw the butler") && seen(hana.id).includes("Psst Ben, I saw the butler"), "sender and recipient see it");
  assert.ok(!seen(cleo.id).includes("Psst Ben, I saw the butler"), "nobody else sees a private message");
  assert.ok(!JSON.stringify(publicView(room)).includes("saw the butler"), "never on the TV or in the recap");
  await sleep(1600);
  assert.throws(() => postChat(room, hana, "to myself", hana.id), /someone else/);
  const dm = await chatPost(new Request("http://x", { method: "POST", headers: hdr(hana), body: JSON.stringify({ text: "Where were you really?", to: bot.id }) }), ctx(code));
  assert.equal(dm.status, 200);
  room = await load(code);
  const botReply = room.chat!.find((m) => m.bot && m.to === hana.id);
  assert.ok(botReply, "the AI guest answers a private message privately");
  assert.ok(playerView(room, room.players.find((p) => p.id === cleo.id)!).chat.every((m) => m.id !== botReply!.id && !m.private), "others never see it");
  assert.ok(room.botLog!.some((l) => l.toId === hana.id), "kept, but marked private");
  const privateLine = room.botLog!.find((l) => l.toId === hana.id)!;
  assert.ok(!publicView(room).botLog.some((l) => l.id === privateLine.id), "private AI replies are not on the TV ticker");
  assert.ok(!publicView(room).recap.some((l) => l.id === privateLine.id));

  const offer = JSON.stringify({ type: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n" });
  const answerSdp = JSON.stringify({ type: "answer", sdp: "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\n" });
  let callId = "";
  await mutate(code, (rm) => { callId = startCall(rm, rm.players.find((p) => p.id === hana.id)!, ben.id, offer).id; });
  room = await load(code);
  const callOf = (pid: string) => playerView(room, room.players.find((p) => p.id === pid)!).calls;
  assert.equal(callOf(ben.id)[0].offer, offer, "the callee gets the offer");
  assert.equal(callOf(ben.id)[0].role, "callee");
  assert.equal(callOf(hana.id)[0].offer, undefined, "the caller does not need it back");
  assert.deepEqual(callOf(cleo.id), [], "no one else sees a call or its details");
  assert.throws(() => startCall(room, room.players.find((p) => p.id === cleo.id)!, ben.id, offer), /already on a call/);
  assert.throws(() => startCall(room, room.players.find((p) => p.id === cleo.id)!, zed.id, offer), /cannot take voice calls/);
  assert.throws(() => startCall(room, zed, ben.id, offer), /grown-ups/, "children text but do not call");
  assert.throws(() => startCall(room, cleo, bot.id, offer), /cannot take voice calls/, "AI guests are called with the bot voice chat, not here");
  const dmitri = room.players.find((p) => p.name === "Dmitri")!;
  assert.throws(() => startCall(room, cleo, dmitri.id, "junk"), /Bad call/);
  assert.throws(() => answerCall(room, room.players.find((p) => p.id === cleo.id)!, callId, answerSdp), /not for you/);
  await mutate(code, (rm) => { answerCall(rm, rm.players.find((p) => p.id === ben.id)!, callId, answerSdp); });
  room = await load(code);
  assert.equal(callOf(hana.id)[0].answer, answerSdp, "the caller gets the answer");
  assert.equal(callOf(hana.id)[0].state, "active");
  await mutate(code, (rm) => { endCall(rm, rm.players.find((p) => p.id === ben.id)!, callId); });
  room = await load(code);
  assert.equal(callOf(hana.id)[0].state, "ended");
  await mutate(code, (rm) => { startCall(rm, rm.players.find((p) => p.id === cleo.id)!, hana.id, offer); }); // free again after the call ended
  await mutate(code, (rm) => { rm.calls = []; });

  // ---- selfie booth
  const selfie = (p: typeof hana, extra: Record<string, string> = {}, bytes: Buffer = FACE) =>
    selfiePost(new Request("http://x", { method: "POST", headers: hdr(p, { "x-consent": p.ageGroup === "adult" ? "self" : "guardian", "x-style": SELFIE_STYLES[0].id, "content-type": "image/jpeg", ...extra }), body: new Uint8Array(bytes) }), ctx(code));
  assert.equal((await selfie(hana, { "x-consent": "" })).status, 400, "consent is required");
  assert.equal((await selfie(hana, { "x-style": "nope" })).status, 400, "style must exist");
  assert.equal((await selfie(hana, {}, Buffer.from("not a jpeg".repeat(200)))).status, 415, "only real JPEGs");
  assert.equal((await selfie(zed)).status, 403, "no selfies of children by default");
  assert.equal(playerView(room, room.players.find((p) => p.id === zed.id)!).me.selfieOk, false);
  assert.equal((await selfie(hana)).status, 200);
  room = await load(code);
  const job = room.media.find((m) => m.kind === "selfie")!;
  assert.equal(job.status, "queued");
  assert.ok(!/Hana/.test(job.prompt), "no names go to the image model");
  assert.match(job.prompt, /^old west WANTED poster/, "the style subject comes first, before the shared cartoon words");
  assert.ok(job.refKey && (await getMediaStore().get(job.refKey)), "the raw photo waits for the job");
  assert.ok(!JSON.stringify(publicView(room)).includes(job.refKey!), "raw photo keys are never in a view");
  assert.equal(publicView(room).selfies.length, 0, "nothing on the wall until the picture exists");
  const rawKey = job.refKey!;
  for (let i = 0; i < 4; i++) if (!(await runNext(code)).ran) break;
  room = await load(code);
  assert.equal(room.media.find((m) => m.id === job.id)!.status, "done");
  assert.ok(await getMediaStore().get(rawKey), "the original is kept (never shown) so the picture can be redone");
  assert.equal(publicView(room).selfies.length, 1, "the picture is on the wall");
  assert.ok(!publicView(room).media.some((m) => m.kind === "selfie"), "selfies are not scenes");
  assert.equal(playerView(room, room.players.find((p) => p.id === hana.id)!).me.selfies![0].status, "done");
  // delete and redo
  const hanaP = () => load(code).then((r) => r.players.find((p) => p.id === hana.id)!);
  await mutate(code, async (rm) => { regenSelfie(rm, rm.players.find((p) => p.id === hana.id)!, job.id, "noir"); });
  room = await load(code);
  const redo = room.media.filter((m) => m.kind === "selfie" && m.playerIds[0] === hana.id).at(-1)!;
  assert.equal(redo.style, "noir"); assert.equal(redo.refKey, rawKey, "a redo reuses the original");
  assert.match(redo.prompt, /^film noir detective/);
  await assert.rejects(() => mutate(code, async (rm) => { regenSelfie(rm, rm.players.find((p) => p.id === ben.id)!, job.id); }), /not one of your/, "only the owner can redo");
  await assert.rejects(() => mutate(code, async (rm) => { await deleteSelfie(rm, rm.players.find((p) => p.id === ben.id)!, job.id); }), /not one of your/, "only the owner can delete");
  const doneKey = (await load(code)).media.find((m) => m.id === job.id)!.key!;
  await mutate(code, async (rm) => { await deleteSelfie(rm, rm.players.find((p) => p.id === hana.id)!, job.id); });
  room = await load(code);
  assert.ok(!room.media.some((m) => m.id === job.id), "the picture is gone");
  assert.equal(await getMediaStore().get(doneKey), null, "and its file");
  assert.ok(!publicView(room).selfies.some((s) => s.id === job.id), "and off the wall");
  assert.ok(await getMediaStore().get(rawKey), "the original stays while the redo needs it");
  await mutate(code, async (rm) => { await deleteSelfie(rm, rm.players.find((p) => p.id === hana.id)!, redo.id); });
  assert.equal(await getMediaStore().get(rawKey), null, "the original goes when the last picture from it is deleted");
  void hanaP;
  // limits: three at a time, six made in total, paused, and budget
  assert.equal((await selfie(hana)).status, 200); assert.equal((await selfie(hana)).status, 200); assert.equal((await selfie(hana)).status, 200);
  assert.equal((await selfie(hana)).status, 409, "three selfies at a time");
  for (const m of (await load(code)).media.filter((x) => x.kind === "selfie" && x.playerIds[0] === hana.id)) await mutate(code, async (rm) => { await deleteSelfie(rm, rm.players.find((p) => p.id === hana.id)!, m.id); });
  assert.equal((await selfie(hana)).status, 200, "the sixth make is allowed");
  for (const m of (await load(code)).media.filter((x) => x.kind === "selfie" && x.playerIds[0] === hana.id)) await mutate(code, async (rm) => { await deleteSelfie(rm, rm.players.find((p) => p.id === hana.id)!, m.id); });
  assert.equal((await selfie(hana)).status, 409, "deleting does not reset the six-per-player limit");
  await mutate(code, (rm) => { rm.budget.plan.paused = true; });
  assert.equal((await selfie(ben)).status, 409, "paused host stops selfies");
  await mutate(code, (rm) => { rm.budget.plan.paused = false; rm.budget.capUsd = rm.budget.spentUsd; });
  assert.equal((await selfie(ben)).status, 409, "the hard budget cap stops selfies");
  // portraits: redo up to three times, delete any time
  await mutate(code, (rm) => { rm.budget.plan.avatars = true; rm.budget.capUsd = 5; });
  await mutate(code, async (rm) => { await regenAvatar(rm, rm.players.find((p) => p.id === ben.id)!); });
  assert.equal((await load(code)).media.filter((m) => m.kind === "avatar" && m.playerIds[0] === ben.id).length, 1);
  await assert.rejects(() => mutate(code, async (rm) => { await regenAvatar(rm, rm.players.find((p) => p.id === ben.id)!); }), /still being painted/);
  for (let i = 0; i < 6; i++) if (!(await runNext(code)).ran) break;
  assert.ok((await load(code)).players.find((p) => p.id === ben.id)!.profile.avatarId, "the new portrait is set");
  await mutate(code, async (rm) => { await dropAvatar(rm, rm.players.find((p) => p.id === ben.id)!); });
  assert.equal((await load(code)).players.find((p) => p.id === ben.id)!.profile.avatarId, undefined, "the portrait is deleted");
  assert.equal(playerView(await load(code), (await load(code)).players.find((p) => p.id === ben.id)!).me.portraitRedos, 2);
  // purge removes the kept originals, but only at the reveal
  await mutate(code, (rm) => { rm.budget.capUsd = 5; });
  assert.equal((await selfie(ben)).status, 200);
  const waiting = (await load(code)).media.filter((m) => m.kind === "selfie" && m.status === "queued" && m.refKey).map((m) => m.refKey!);
  assert.ok(waiting.length > 0);
  const { purgePhotos } = await import("../src/lib/engine");
  await mutate(code, async (rm) => { await purgePhotos(rm); });
  assert.ok(await getMediaStore().get(waiting[0]), "originals are kept before the reveal");
  await mutate(code, async (rm) => { rm.phase = "reveal"; await purgePhotos(rm); });
  for (const k of waiting) assert.equal(await getMediaStore().get(k), null, "purge deletes raw selfies");

  console.log("OK: play features (notebook, table chat with AI guests, selfie booth)");
}
main().catch((e) => { console.error(e); process.exit(1); });
