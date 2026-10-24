// Notebook, table chat, and selfie booth. Run: npx tsx scripts/play.test.ts
import assert from "node:assert/strict";
import { addBots, addPlayer, advance, createRoom, playerView, publicView, saveNotes, startGame } from "../src/lib/engine";
import { runNext } from "../src/lib/media-runner";
import { getMediaStore } from "../src/lib/media-store";
import { POST as chatPost } from "../src/app/api/rooms/[code]/chat/route";
import { POST as selfiePost } from "../src/app/api/rooms/[code]/selfie/route";
import { SELFIE_STYLES } from "../src/lib/selfie-styles";
import { getStore, mutate } from "../src/lib/store";

const SMALL = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDsaKKK8I+lCirFpZz3e/7PHv24zyBjP1qx/Y99/wA8P/H1/wAadiXJLdmfRWh/Y99/zw/8fX/Gq93Zz2m37RHs3ZxyDnH0osCknsyvRRRSKCiiigDoPCn/AC9f8A/rW/WB4U/5ev8AgH9a360WxyVPiYVgeK/+XX/gf9K36wPFf/Lr/wAD/pQ9gp/Ejn6KKKzOsKKKKAOg8Kf8vX/AP61v1geFP+Xr/gH9a360WxyVPiYVgeK/+XX/AIH/AErfrA8V/wDLr/wP+lD2Cn8SOfooorM6wooooAsWl5Pab/s8mzdjPAOcfWrH9sX3/Pf/AMcX/Cs+inclxT3Rof2xff8APf8A8cX/AAqvd3k93t+0Sb9uccAYz9Kr0UXBRS2QUUUUij//2Q==", "base64");
// Pad with a comment segment (stripped by the server) so the upload clears the minimum size.
const pad = Buffer.alloc(1500, 0x20);
const FACE = Buffer.concat([SMALL.subarray(0, 2), Buffer.from([0xff, 0xfe, (pad.length + 2) >> 8, (pad.length + 2) & 0xff]), pad, SMALL.subarray(2)]);
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
  assert.equal(await getMediaStore().get(rawKey), null, "the raw photo is deleted once the picture is made");
  assert.equal(publicView(room).selfies.length, 1, "the picture is on the wall");
  assert.ok(!publicView(room).media.some((m) => m.kind === "selfie"), "selfies are not scenes");
  assert.equal(playerView(room, room.players.find((p) => p.id === hana.id)!).me.selfies![0].status, "done");
  // limits: three each, paused, and budget
  assert.equal((await selfie(hana)).status, 200); assert.equal((await selfie(hana)).status, 200);
  assert.equal((await selfie(hana)).status, 409, "three selfies each");
  await mutate(code, (rm) => { rm.budget.plan.paused = true; });
  assert.equal((await selfie(ben)).status, 409, "paused host stops selfies");
  await mutate(code, (rm) => { rm.budget.plan.paused = false; rm.budget.capUsd = rm.budget.spentUsd; });
  assert.equal((await selfie(ben)).status, 409, "the hard budget cap stops selfies");
  // purge removes any waiting raw selfies
  await mutate(code, (rm) => { rm.budget.capUsd = 5; });
  assert.equal((await selfie(ben)).status, 200);
  const waiting = (await load(code)).media.filter((m) => m.kind === "selfie" && m.status === "queued" && m.refKey).map((m) => m.refKey!);
  assert.ok(waiting.length > 0);
  const { purgePhotos } = await import("../src/lib/engine");
  await mutate(code, async (rm) => { await purgePhotos(rm); });
  for (const k of waiting) assert.equal(await getMediaStore().get(k), null, "purge deletes raw selfies");

  console.log("OK: play features (notebook, table chat with AI guests, selfie booth)");
}
main().catch((e) => { console.error(e); process.exit(1); });
