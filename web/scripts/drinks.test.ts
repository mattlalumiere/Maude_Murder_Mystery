// Heavy drinking night. Run: npx tsx scripts/drinks.test.ts
import assert from "node:assert/strict";
import { addBots, addPlayer, advance, createRoom, drinkAnswer, drinkControl, drinkDone, drinkLog, drinkWater, hostView, playerView, publicView, startGame, submitBallot } from "../src/lib/engine";
import { getStore, mutate } from "../src/lib/store";
import { DRINK } from "../src/lib/drinks";

const load = async (code: string) => (await getStore().get(code))!;
const heavyCfg = { name: "Heavy Night", drinking: "heavy" as const, drinkingAttested: true };
const plan = { avatars: false, scenesPerAct: 0, videoClips: 0, quality: "standard" as const };

async function heavyRoom() {
  const r = await createRoom("hostD", "secretcode", heavyCfg, 1, plan);
  await mutate(r.code, (room) => {
    addPlayer(room, "Ann", "adult", false, true, { drink: { mode: "in", limit: 3 } });
    addPlayer(room, "Bob", "adult", false, true, { drink: { mode: "in", limit: 2 } });
    addPlayer(room, "Cat", "adult", false, true, { drink: { mode: "out", limit: 4 } });
    addPlayer(room, "Dan", "adult", false, true); // never chose: not part of the drinking game
    addPlayer(room, "Kit", "kid", false, true, { drink: { mode: "in", limit: 6 } }); // a child cannot opt in
    addPlayer(room, "Nia", "adult", false, false, { drink: { mode: "in", limit: 6 } }); // no device: cannot opt in
    addBots(room, 1);
  });
  await mutate(r.code, (room) => startGame(room));
  return r.code;
}
const by = (room: Awaited<ReturnType<typeof load>>, n: string) => room.players.find((p) => p.name === n)!;
const goto = async (code: string, n: number) => { for (let i = 0; i < n; i++) await mutate(code, (room) => advance(room)); };

async function main() {
  // ---- attestation is required, and limits are clamped
  await assert.rejects(createRoom("h", "secretcode", { drinking: "heavy" }, 1), /legal drinking age/);
  const code = await heavyRoom();
  let room = await load(code);
  assert.equal(by(room, "Ann").profile.drink?.limit, 3);
  assert.equal(by(room, "Kit").profile.drink, undefined, "children cannot opt in");
  assert.equal(by(room, "Nia").profile.drink, undefined, "players without a device cannot opt in");
  assert.equal(by(room, "Dan").profile.drink, undefined, "no choice means no drinking prompts");
  const clamp = await createRoom("h2", "secretcode", heavyCfg, 1);
  await mutate(clamp.code, (rm) => { addPlayer(rm, "Hi", "adult", false, true, { drink: { mode: "in", limit: 99 } }); addPlayer(rm, "Lo", "adult", false, true, { drink: { mode: "in", limit: 1 } }); });
  const cr = await load(clamp.code);
  assert.equal(by(cr, "Hi").profile.drink?.limit, DRINK.limitMax, "limit capped at the maximum");
  assert.equal(by(cr, "Lo").profile.drink?.limit, DRINK.limitMin, "limit floored at the minimum");

  // ---- prompts target only adults who opted in; everyone in the game joins "all" rounds
  const ids = (n: string) => by(room, n).id;
  await goto(code, 2); // cards -> act1 -> death
  room = await load(code);
  const prompts = room.drinks!.prompts;
  assert.ok(prompts.length >= 2, "welcome toast and dead man's toast");
  for (const pr of prompts) {
    for (const forbidden of ["Kit", "Nia", "Dan"]) assert.ok(!pr.targetIds.includes(ids(forbidden)), `${forbidden} must never be targeted`);
    assert.ok(!pr.targetIds.includes(room.players.find((p) => p.isBot)!.id), "bots never drink");
    assert.ok(pr.targetIds.includes(ids("Cat")) || pr.scope === "targets", "mocktail players join all-rounds");
  }
  const toast = prompts[0];
  assert.equal(toast.scope, "all");

  // ---- answers: tap out is free; mocktail logs nothing; drinks count; limit and pace are enforced
  await mutate(code, (rm) => drinkAnswer(rm, by(rm, "Cat"), toast.id, "drank"));
  room = await load(code);
  assert.equal(room.drinks!.tally[ids("Cat")].units, 0, "a mocktail player logs no alcohol");
  await mutate(code, (rm) => drinkAnswer(rm, by(rm, "Ann"), toast.id, "tapped"));
  room = await load(code);
  assert.equal(room.drinks!.tally[ids("Ann")].units, 0, "tapping out costs nothing and is not a drink");
  await assert.rejects(mutate(code, (rm) => drinkAnswer(rm, by(rm, "Dan"), toast.id, "drank")), /not taking part/);
  await assert.rejects(mutate(code, (rm) => drinkAnswer(rm, by(rm, "Ann"), "nope", "drank")), /not for you/);
  const t2 = prompts[1];
  await mutate(code, (rm) => drinkAnswer(rm, by(rm, "Bob"), toast.id, "drank"));
  await mutate(code, (rm) => drinkAnswer(rm, by(rm, "Bob"), t2.id, "drank"));
  room = await load(code);
  assert.equal(room.drinks!.tally[ids("Bob")].units, 2);
  assert.ok(room.drinks!.tally[ids("Bob")].done, "reaching the limit ends the night's drinking");
  await assert.rejects(mutate(code, (rm) => drinkLog(rm, by(rm, "Bob"))), /reached your limit/);
  // pace guard: Ann has no drinks yet; two quick ones are fine, the third is held
  await mutate(code, (rm) => drinkLog(rm, by(rm, "Ann")));
  await mutate(code, (rm) => drinkLog(rm, by(rm, "Ann")));
  await assert.rejects(mutate(code, (rm) => drinkLog(rm, by(rm, "Ann"))), /Pace check|limit/);

  // ---- water and "done for the night"
  await mutate(code, (rm) => drinkWater(rm, by(rm, "Cat")));
  assert.equal((await load(code)).drinks!.tally[ids("Cat")].water, 1);
  await mutate(code, (rm) => drinkDone(rm, by(rm, "Cat")));

  // ---- later rounds never target people who are done or at their limit
  await goto(code, 1); // act2
  await goto(code, 1); // intermission
  await goto(code, 1); // act3
  room = await load(code);
  const later = room.drinks!.prompts.filter((p) => p.phase !== "act1" && p.phase !== "death" && p.units > 0 && p.scope === "targets");
  for (const pr of later) for (const id of pr.targetIds) {
    assert.ok(id !== ids("Bob"), "Bob is at his limit and is not targeted");
    assert.ok(by(room, "Dan").id !== id && by(room, "Kit").id !== id);
  }
  const water = room.drinks!.prompts.find((p) => p.phase === "intermission")!;
  assert.equal(water.units, 0, "the intermission is a water and snack round");
  assert.ok(water.targetIds.includes(ids("Bob")) && water.targetIds.includes(ids("Cat")), "everyone taking part gets the water round");

  // ---- views: the screen never shows a tally, a player sees only their own, the host sees all
  assert.ok(publicView(room).drink && !("players" in (publicView(room).drink as object)), "no per-player tallies on the shared screen");
  const mineAnn = playerView(room, by(room, "Ann")).me.drink!;
  assert.equal(mineAnn.units, 2); assert.equal(mineAnn.limit, 3);
  assert.equal(playerView(room, by(room, "Dan")).me.drink, undefined, "someone who did not opt in has no drink card");
  const hostD = hostView(room).drinks!;
  assert.equal(hostD.players.length, 3);
  assert.equal(hostD.players.find((p) => p.name === "Bob")!.done, true);

  // ---- host controls: water round, pause blocks answers and new rounds, stop is final
  await mutate(code, (rm) => drinkControl(rm, "water"));
  await mutate(code, (rm) => drinkControl(rm, "pause"));
  room = await load(code);
  const live = room.drinks!.prompts.find((p) => p.targetIds.includes(ids("Ann")) && !p.answers[ids("Ann")] && p.units > 0);
  if (live) await assert.rejects(mutate(code, (rm) => drinkAnswer(rm, by(rm, "Ann"), live.id, "drank")), /paused/);
  const before = room.drinks!.prompts.length;
  await goto(code, 1); // act4 while paused: no new prompts
  assert.equal((await load(code)).drinks!.prompts.length, before, "paused games get no new rounds");
  await mutate(code, (rm) => drinkControl(rm, "resume"));
  await mutate(code, (rm) => drinkControl(rm, "stop"));
  await mutate(code, (rm) => drinkControl(rm, "resume"));
  assert.equal((await load(code)).drinks!.paused, true, "stop cannot be undone by resume");
  await assert.rejects(mutate(code, (rm) => drinkControl(rm, "nope")), /Unknown control/);

  // ---- the reveal: judgment targets only wrong accusers who still have room
  const code2 = await heavyRoom();
  await goto(code2, 6); // cards -> act1 -> death -> act2 -> intermission -> act3 -> act4
  await mutate(code2, (rm) => {
    const k = rm.case!;
    const wrongSuspect = k.characters.find((c) => !c.kid && c.id !== k.killerId && c.id !== k.victimId)!.id;
    submitBallot(rm, by(rm, "Ann"), { killerId: wrongSuspect, methodId: k.truth.methodId, motiveId: k.truth.motiveId });
    submitBallot(rm, by(rm, "Cat"), { killerId: k.killerId, methodId: k.truth.methodId, motiveId: k.truth.motiveId });
  });
  await goto(code2, 1);
  const r2 = await load(code2);
  assert.equal(r2.phase, "reveal");
  const judgment = r2.drinks!.prompts.find((p) => p.title === "Judgment");
  if (judgment) assert.ok(judgment.targetIds.every((id) => id === by(r2, "Ann").id), "only the wrong accuser who opted in");
  assert.ok(r2.drinks!.prompts.some((p) => p.title === "The final toast"), "final toast");

  // ---- other modes are untouched
  const plain = await createRoom("hostP", "secretcode", { drinking: "adults" }, 1, plan);
  await mutate(plain.code, (rm) => { ["A", "B", "C"].forEach((n) => addPlayer(rm, n, "adult", false, true, { drink: { mode: "in", limit: 4 } })); addPlayer(rm, "K", "kid", false, true); });
  await mutate(plain.code, (rm) => startGame(rm)); await goto(plain.code, 3);
  const pr = await load(plain.code);
  assert.equal(pr.drinks, undefined, "sip mode creates no drink prompts");
  assert.ok(pr.players.every((p) => !p.profile.drink), "drink profiles are dropped outside heavy mode");
  assert.equal(publicView(pr).drink, undefined);

  console.log("OK: heavy drinking night (opt-in, limits, pace guard, tap-out, water, pause and stop, privacy, reveal rounds)");
}
main().catch((e) => { console.error(e); process.exit(1); });
