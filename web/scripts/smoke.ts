// Engine smoke test: run with `npm run test:smoke`
import assert from "node:assert/strict";
import { addPlayer, advance, createRoom, hostView, override, playerView, publicView, startGame, submitBallot } from "../src/lib/engine";
import { getStore, mutate } from "../src/lib/store";
import type { AgeGroup } from "../src/lib/types";

async function main() {
  const room0 = await createRoom("host1", "swordfish");
  const code = room0.code;
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
  console.log("OK: casting, secrecy, phases, override, ballots, reveal");
  console.log("Killer:", pv.reveal?.killer, "| top score:", pv.reveal?.scores[0]);
}
main().catch((e) => { console.error(e); process.exit(1); });
