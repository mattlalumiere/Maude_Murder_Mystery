// Covers the 2026-10-23 council fixes. Run: npx tsx scripts/council-fixes.test.ts
import assert from "node:assert/strict";
import { addPlayer, advance, beginGeneration, createRoom, finishGeneration, generationRoster, kickPlayer, photosCanBePurged, purgePhotos } from "../src/lib/engine";
import { generateCase } from "../src/lib/gm-ai";
import { runNext } from "../src/lib/media-runner";
import { getMediaStore } from "../src/lib/media-store";
import { getStore, mutate } from "../src/lib/store";

async function main() {
  const room0 = await createRoom("hostX", "secretcode", { name: "T" }, 5, { avatars: true, scenesPerAct: 1, videoClips: 0, quality: "standard" });
  const code = room0.code;
  await mutate(code, (r) => {
    ["Ann", "Bob", "Cy"].forEach((n) => addPlayer(r, n, "adult", false, true));
    addPlayer(r, "Di", "kid", false, true);
  });
  const media = getMediaStore();
  let room = (await getStore().get(code))!;
  const ann = room.players[0], di = room.players[3];
  await media.put(`${code}/photos/${ann.id}.jpg`, Buffer.alloc(1500, 7), "image/jpeg");
  await media.put(`${code}/photos/${di.id}.jpg`, Buffer.alloc(1500, 8), "image/jpeg");
  await mutate(code, (r) => { for (const p of r.players.filter((x) => x === r.players[0] || x === r.players[3])) { p.profile.photoKey = `${code}/photos/${p.id}.jpg`; p.profile.consent = "self"; } });

  // ---- async generation: claim, lobby lock, apply once
  await mutate(code, (r) => beginGeneration(r));
  room = (await getStore().get(code))!;
  assert.ok(room.generating, "generation claimed");
  await assert.rejects(mutate(code, (r) => { addPlayer(r, "Late", "adult", false, true); }), /starting the game/, "lobby locked while writing");
  await assert.rejects(mutate(code, (r) => beginGeneration(r)), /already being written/, "no double start");
  const gen = await generateCase(generationRoster(room), room.config, { model: null });
  const applied = await mutate(code, (r) => finishGeneration(r, gen));
  assert.equal(applied.result, true);
  const again = await mutate(code, (r) => finishGeneration(r, gen));
  assert.equal(again.result, false, "second finish is ignored");
  room = (await getStore().get(code))!;
  assert.equal(room.phase, "cards");
  assert.equal(room.generating, undefined);
  assert.ok(room.players.every((p) => p.characterId), "everyone cast");

  // stale claim can be retaken (request died)
  const r2 = await createRoom("hostY", "secretcode");
  await mutate(r2.code, (r) => { ["A", "B", "C", "D"].forEach((n) => addPlayer(r, n, "adult", false, true)); r.generating = 1; });
  await mutate(r2.code, (r) => beginGeneration(r));
  assert.ok(((await getStore().get(r2.code))!).generating! > 1, "stale claim replaced");

  // ---- kick deletes the photo
  const r3 = await createRoom("hostZ", "secretcode");
  await mutate(r3.code, (r) => { ["A", "B", "C", "D"].forEach((n) => addPlayer(r, n, "adult", false, true)); });
  const kicked = (await getStore().get(r3.code))!.players[0];
  await media.put(`${r3.code}/photos/${kicked.id}.jpg`, Buffer.alloc(1500, 9), "image/jpeg");
  await mutate(r3.code, (r) => { r.players[0].profile.photoKey = `${r3.code}/photos/${kicked.id}.jpg`; });
  assert.ok(await media.get(`${r3.code}/photos/${kicked.id}.jpg`), "photo stored");
  await mutate(r3.code, (r) => kickPlayer(r, kicked.id));
  assert.equal(await media.get(`${r3.code}/photos/${kicked.id}.jpg`), null, "kick deletes the photo");
  assert.equal(((await getStore().get(r3.code))!).players.length, 3);

  // ---- photos are purged after reveal, but only once art jobs are done
  for (let i = 0; i < 40; i++) { if (!(await runNext(code)).ran) break; }
  for (let i = 0; i < 7; i++) await mutate(code, (r) => advance(r));
  room = (await getStore().get(code))!;
  assert.equal(room.phase, "reveal");
  const queued = room.media.some((m) => ["queued", "running", "polling"].includes(m.status));
  assert.equal(photosCanBePurged(room), !queued ? true : false, "purge waits for pending art");
  for (let i = 0; i < 40; i++) { if (!(await runNext(code)).ran) break; }
  room = (await getStore().get(code))!;
  assert.equal(room.players.some((p) => p.profile.photoKey), false, "photos purged after the last art job");
  assert.equal(await media.get(`${code}/photos/${ann.id}.jpg`), null, "photo bytes gone from storage");
  await mutate(code, (r) => purgePhotos(r)); // idempotent

  console.log("OK: async generation, kick deletes photo, purge after reveal");
}
main().catch((e) => { console.error(e); process.exit(1); });
