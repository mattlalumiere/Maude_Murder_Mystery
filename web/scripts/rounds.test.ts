// Ready to move on, the two-thirds countdown, and the intermission. Run: npx tsx scripts/rounds.test.ts
process.env.READY_COUNTDOWN_MS = "300";
process.env.INTERMISSION_MS = "400";
process.env.GM_MESSAGE_MS = "150";
import assert from "node:assert/strict";
import { addBots, addPlayer, advance, createRoom, playerView, publicView, startGame } from "../src/lib/engine";
import { dueNow, hostNext, readyCounts, setReady, tick, voteSkip } from "../src/lib/rounds";
import { postChat } from "../src/lib/chat";
import { getStore, mutate } from "../src/lib/store";

const load = async (c: string) => (await getStore().get(c))!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids = (room: Awaited<ReturnType<typeof load>>) => room.players.filter((p) => !p.isBot && p.hasDevice).map((p) => p.id);

async function newGame() {
  const r = await createRoom("h", "secretcode", { name: "Rounds" }, 5, { avatars: false, scenesPerAct: 1, videoClips: 0, quality: "standard" });
  await mutate(r.code, (rm) => { ["A", "B", "C", "D", "E", "F"].forEach((n) => addPlayer(rm, n, "adult", false, true)); addPlayer(rm, "Toddler", "little", false, false); addBots(rm, 1); });
  await mutate(r.code, (rm) => startGame(rm));
  return r.code;
}
const ready = (code: string, who: number, on = true) => mutate(code, (rm) => setReady(rm, rm.players.find((p) => p.id === ids(rm)[who])!, on));

async function main() {
  const code = await newGame();
  let room = await load(code);
  assert.equal(room.phase, "cards");
  assert.deepEqual(readyCounts(room), { ready: 0, total: 6, needed: 4 }, "bots and players without a phone never block the table");

  // ready, take it back once, never twice
  await ready(code, 0);
  assert.equal(readyCounts(await load(code)).ready, 1);
  const me = (await load(code)).players.find((p) => p.id === ids(room)[0])!;
  assert.equal(playerView(await load(code), me).me.canUndoReady, true);
  await ready(code, 0, false);
  assert.equal(readyCounts(await load(code)).ready, 0);
  await ready(code, 0);
  await assert.rejects(() => ready(code, 0, false), /already took your ready back/);
  assert.equal(playerView(await load(code), (await load(code)).players.find((p) => p.id === ids(room)[0])!).me.canUndoReady, false);

  // two thirds start a countdown; dropping below cancels it
  for (const i of [1, 2]) await ready(code, i);
  assert.equal((await load(code)).readyDeadline, undefined, "3 of 6 is not enough");
  await ready(code, 3);
  room = await load(code);
  assert.ok(room.readyDeadline && room.readyDeadline > Date.now(), "4 of 6 starts the countdown");
  assert.ok(publicView(room).round.countdownMs! > 0);
  await ready(code, 1, false);
  assert.equal((await load(code)).readyDeadline, undefined, "an un-ready below two thirds stops the countdown");
  await ready(code, 1);
  assert.ok((await load(code)).readyDeadline, "ready again restarts it");
  assert.equal(publicView(await load(code)).roster.filter((r) => r.ready).length >= 4, true, "check marks next to names");

  // the countdown runs out: the stragglers are moved on, through an intermission
  assert.equal(dueNow(await load(code)), false);
  await sleep(350);
  assert.equal(dueNow(await load(code)), true);
  await mutate(code, (rm) => { tick(rm); });
  room = await load(code);
  assert.equal(room.phase, "cards", "the intermission comes first");
  assert.ok(room.transition && room.transition.to === "act1");
  assert.equal(publicView(room).round.intermission?.toTitle.length! > 0, true);
  assert.equal(room.transition.stage, "gm", "the Game Master speaks first, on a lone screen");
  assert.ok(publicView(room).round.intermission!.gm!.text.length > 20, "the GM message moves the story along");
  await assert.rejects(() => mutate(code, (rm) => voteSkip(rm, rm.players.find((p) => p.id === ids(rm)[0])!, true)), /Game Master is speaking/);
  assert.ok(room.media.some((m) => m.phase === "act1" && m.kind === "scene"), "the next round's art starts rendering during the break");
  await assert.rejects(() => ready(code, 4), /Intermission/);

  // the break lasts its full time (art or not) and recaps the table talk
  await mutate(code, (rm) => { postChat(rm, rm.players.find((p) => p.name === "A")!, "Where was the butler?"); });
  assert.ok(publicView(await load(code)).recap.some((l) => l.text.includes("butler")), "the break replays the conversation");
  assert.ok(publicView(await load(code)).round.intermission!.remainingMs > 0);
  await sleep(60);
  await mutate(code, (rm) => { tick(rm); });
  assert.equal((await load(code)).transition!.stage, "gm", "still the GM message");
  await sleep(120);
  await mutate(code, (rm) => { tick(rm); });
  assert.equal((await load(code)).transition!.stage, "break", "then the break begins");
  assert.equal(publicView(await load(code)).round.intermission!.gm, null);
  await sleep(100);
  await mutate(code, (rm) => { tick(rm); });
  assert.equal((await load(code)).phase, "cards", "the break is not over yet");
  await sleep(330);
  await mutate(code, (rm) => { tick(rm); });
  room = await load(code);
  assert.equal(room.phase, "act1", "after the full break the story moves on");
  assert.equal(room.transition, undefined);
  assert.ok(room.players.filter((p) => !p.isBot).every((p) => !p.ready), "ready resets every round");
  assert.equal(room.readyUndo, undefined, "the one-time un-ready resets too");
  assert.equal(room.media.filter((m) => m.phase === "act1" && m.kind === "scene").length, 1, "art is not queued twice");
  assert.deepEqual(publicView(room).recap, [], "no recap outside the break");

  // everyone ready: intermission at once; it ends early only if EVERY player votes to skip
  for (let i = 0; i < 6; i++) await ready(code, i);
  room = await load(code);
  assert.ok(room.transition, "all ready starts the intermission at once");
  await sleep(170);
  await mutate(code, (rm) => { tick(rm); });
  assert.equal((await load(code)).transition!.stage, "break");
  const skip = (i: number, on = true) => mutate(code, (rm) => voteSkip(rm, rm.players.find((p) => p.id === ids(rm)[i])!, on));
  for (let i = 0; i < 5; i++) await skip(i);
  assert.equal(publicView(await load(code)).round.intermission!.skipVotes, 5);
  assert.equal((await load(code)).phase, "act1", "five of six is not everyone");
  await skip(4, false);
  await skip(5); await skip(4);
  assert.equal((await load(code)).phase, "death", "every player voted to skip, so it ends early");
  assert.equal((await load(code)).transition, undefined);

  // host Next: intermission first, then skip; paused games never auto-advance; bare advance is unchanged
  await mutate(code, (rm) => hostNext(rm));
  assert.ok((await load(code)).transition);
  assert.equal((await load(code)).transition!.stage, "gm");
  await mutate(code, (rm) => hostNext(rm));
  assert.equal((await load(code)).transition!.stage, "break", "Next skips the GM message");
  await mutate(code, (rm) => hostNext(rm));
  assert.equal((await load(code)).phase, "act2", "Next again skips the break");
  await mutate(code, (rm) => { rm.paused = true; rm.readyDeadline = Date.now() - 1; });
  assert.equal(dueNow(await load(code)), false, "paused");
  await mutate(code, (rm) => { rm.paused = false; rm.readyDeadline = undefined; advance(rm); });
  assert.equal((await load(code)).phase, "intermission", "advance() still moves on immediately");

  // the reveal has nothing to get ready for
  await mutate(code, (rm) => { rm.phase = "reveal"; });
  await assert.rejects(() => ready(code, 0), /Nothing to get ready/);

  console.log("OK: rounds (ready, one undo, two-thirds countdown, intermission with recap, host skip)");
}
main().catch((e) => { console.error(e); process.exit(1); });
