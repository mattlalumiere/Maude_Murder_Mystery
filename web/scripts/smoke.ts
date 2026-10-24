// Engine smoke test: run with `npm run test:smoke`
import assert from "node:assert/strict";
import { addPlayer, advance, createRoom, hostView, override, playerView, publicView, startGame, submitBallot } from "../src/lib/engine";
import { getStore, mutate } from "../src/lib/store";
import { estimate, fitPlan, recommend, TIERS } from "../src/lib/budget";
import { runNext } from "../src/lib/media-runner";
import { setPlan } from "../src/lib/engine";
import { getMediaStore } from "../src/lib/media-store";
import type { AgeGroup } from "../src/lib/types";

async function main() {
  const room0 = await createRoom("host1", "swordfish");
  const code = room0.code;
  assert.equal(room0.gameId.length, 26, "gameId is a 26 char ULID");
  assert.ok(room0.cellId && room0.regionId, "room records its cell and region");
  const roster: [string, AgeGroup][] = [
    ...Array.from({ length: 10 }, (_, i) => [`Adult${i}`, "adult"] as [string, AgeGroup]),
    ["Maya", "kid"], ["Ollie", "kid"], ["Zane", "teen"], ["Tilly", "teen"], ["Pip", "little"], ["Jo", "little"],
  ];
  await mutate(code, (r) => {
    roster.forEach(([n, g], i) => addPlayer(r, n, g, n === "Maya" && i > 0));
  });
  await mutate(code, (r) => startGame(r));

  let room = (await getStore().get(code))!;
  const k = room.case!;
  const killerP = room.players.find((p) => p.characterId === k.killerId)!;
  assert.equal(killerP.ageGroup, "adult", "killer must be an adult");
  const victimP = room.players.find((p) => p.characterId === k.victimId)!;
  assert.equal(victimP.name, "Maya", "volunteer kid is the victim");
  assert.equal(new Set(room.players.map((p) => p.characterId)).size, room.players.length, "unique characters");
  room.players.forEach((p) => assert.ok(p.characterId, `${p.name} has a character`));

  // Secrets must not leak into other views.
  const leaks = [k.truth.story, "YOU DID IT", k.characters.find((c) => c.id === k.killerId)!.card.secret];
  for (const [label, view] of [["public", publicView(room)], ["host", hostView(room)]] as const) {
    const s = JSON.stringify(view);
    leaks.forEach((l) => assert.ok(!s.includes(l), `${label} view leaks: ${l.slice(0, 30)}`));
  }
  for (const p of room.players) {
    const s = JSON.stringify(playerView(room, p));
    if (p.id !== killerP.id) assert.ok(!s.includes("YOU DID IT"), `${p.name} sees killer secret`);
    assert.ok(!s.includes(k.truth.story), "player view leaks truth");
  }

  // Phases and clue releases.
  assert.equal(publicView(room).clues.length, 0);
  const steps = async (n: number) => { for (let i = 0; i < n; i++) await mutate(code, (r) => advance(r)); room = (await getStore().get(code))!; };
  await steps(3); // cards->act1->death->act2
  assert.equal(room.phase, "act2");
  assert.equal(publicView(room).clues.length, 6);
  await steps(2); // intermission -> act3
  assert.equal(publicView(room).clues.length, 13); // 12 + twist
  await steps(1); // act4
  assert.ok(room.ballotsOpen);

  // Override: wrong code, lockout, right code.
  for (let i = 0; i < 2; i++) await mutate(code, (r) => { try { override(r, "nope", "NUDGE", false); } catch {} });
  room = (await getStore().get(code))!;
  assert.equal(room.failedOverrides, 2, "failed attempts are counted");
  const ok = await mutate(code, (r) => override(r, "SwordFish ", "NUDGE", false));
  assert.ok(ok.result.message.length > 0);
  const fin = await mutate(code, (r) => override(r, "swordfish", "FINAL", false));
  assert.ok(fin.result.needsConfirm);
  for (let i = 0; i < 3; i++) await mutate(code, (r) => { try { override(r, "bad", "NUDGE", false); } catch {} });
  room = (await getStore().get(code))!;
  assert.ok(room.lockedUntil > Date.now(), "3 failures lock overrides");
  assert.throws(() => override(room, "swordfish", "NUDGE", false), /Gerald/, "locked even with the right code");
  room.lockedUntil = 0; await getStore().put({ ...room, version: room.version + 1 }, room.version);

  // Ballots + reveal.
  await mutate(code, (r) => {
    r.players.forEach((p, i) => submitBallot(r, p, {
      killerId: i < 5 ? k.killerId : (r.case!.characters.find((c) => !c.kid && c.id !== k.killerId && c.id !== k.victimId)!.id),
      methodId: k.truth.methodId, motiveId: k.truth.motiveId,
    }));
  });
  await steps(1);
  assert.equal(room.phase, "reveal");
  const pv = publicView(room);
  assert.ok(pv.reveal?.killer, "reveal shows killer");
  // ----- budget planner -----
  assert.equal(recommend(0, 16).best, null, "$0 buys nothing");
  assert.equal(recommend(0.5, 16).best?.id, "text");
  assert.equal(recommend(2, 16).best?.id, "illustrated");
  const r15 = recommend(15, 16);
  assert.ok(r15.best && estimate(r15.best.plan, 16).total <= r15.usable, "recommendation fits the budget");
  assert.ok(recommend(500, 16).best?.id === "blockbuster");
  const fitted = fitPlan(TIERS[5].plan, 5, 16);
  assert.ok(estimate(fitted, 16).total <= 5 * 0.85 + 1e-9, "fitPlan trims to the cap");

  // ----- media jobs, photo refs, hard cap -----
  const mroom = await createRoom("host2", "mediacode", { name: "Test Party", themePrompt: "pirates" }, 1.5, { avatars: true, scenesPerAct: 1, videoClips: 1, quality: "standard" });
  assert.equal(mroom.config.themePrompt, "pirates");
  await mutate(mroom.code, (r) => {
    ["Ann", "Bob", "Cy", "Di"].forEach((n, i) => addPlayer(r, n, i === 3 ? "kid" : "adult", false, true, i === 0 ? { backstoryMode: "own", backstory: "I am a retired circus strongman." } : undefined));
  });
  await mutate(mroom.code, async (r) => {
    await getMediaStore().put(`${r.code}/photos/${r.players[0].id}.jpg`, Buffer.alloc(2000, 1), "image/jpeg");
    r.players[0].profile.photoKey = `${r.code}/photos/${r.players[0].id}.jpg`; r.players[0].profile.consent = "self";
  });
  await mutate(mroom.code, (r) => startGame(r));
  let m = (await getStore().get(mroom.code))!;
  assert.equal(m.media.filter((x) => x.kind === "avatar").length, 4, "one avatar per player");
  const own = m.case!.characters.find((c) => c.id === m.players[0].characterId)!;
  assert.ok(own.card.extra?.includes("circus strongman"), "own backstory lands on the card");
  for (let i = 0; i < 40; i++) { const r = await runNext(mroom.code); if (!r.ran) break; }
  m = (await getStore().get(mroom.code))!;
  assert.ok(m.budget.spentUsd <= m.budget.capUsd + 1e-9, "never exceeds the cap");
  assert.equal(m.budget.reservedUsd, 0, "no dangling reservations");
  assert.equal(m.media.filter((x) => x.kind === "avatar" && x.status === "done").length, 4);
  assert.ok(m.players.every((p) => p.profile.avatarId), "avatar ids recorded");
  const pubMedia = JSON.stringify(publicView(m));
  assert.ok(!pubMedia.includes("photos/"), "photo keys never in public view");
  // Tight cap: raise scenes, advance through the game, ensure overflow is skipped not spent.
  await mutate(mroom.code, (r) => setPlan(r, { scenesPerAct: 3, videoClips: 4 }));
  for (let i = 0; i < 7; i++) await mutate(mroom.code, (r) => advance(r));
  for (let i = 0; i < 80; i++) { const r = await runNext(mroom.code); if (!r.ran) break; }
  m = (await getStore().get(mroom.code))!;
  assert.ok(m.budget.spentUsd <= 1.5 + 1e-9, `spent ${m.budget.spentUsd} within cap`);
  assert.ok(m.media.some((x) => x.status === "skipped" && /budget/.test(x.note ?? "")), "over-budget jobs skipped");
  assert.throws(() => setPlan(m, undefined, 0.01), /cannot go below/);
  // Paused plan stops work.
  await mutate(mroom.code, (r) => { r.media.push({ id: "zz", kind: "scene", phase: "act1", playerIds: [], prompt: "x", caption: "x", status: "queued", estCostUsd: 0.01, createdAt: 0 }); setPlan(r, { paused: true }); });
  assert.equal((await runNext(mroom.code)).ran, false, "paused plan does nothing");

  console.log("OK: casting, secrecy, phases, override, ballots, reveal, budget planner, media jobs, spend cap");
  console.log("Killer:", pv.reveal?.killer, "| top score:", pv.reveal?.scores[0]);
}
main().catch((e) => { console.error(e); process.exit(1); });
