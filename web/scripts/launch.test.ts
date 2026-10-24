// Launch progress shown to guests and the host. Run: npx tsx scripts/launch.test.ts
import assert from "node:assert/strict";
import { addPlayer, advance, beginGeneration, createRoom, finishGeneration, generationRoster, publicView, startGame } from "../src/lib/engine";
import { generateCase } from "../src/lib/gm-ai";
import { runNext } from "../src/lib/media-runner";
import { LAUNCH_QUIPS } from "../src/lib/quips";
import { launchView } from "../src/lib/launch";
import { getStore, mutate } from "../src/lib/store";

const load = async (code: string) => (await getStore().get(code))!;
const withPlayers = async (plan: { avatars: boolean }) => {
  const r = await createRoom("hostL", "secretcode", { name: "Launch" }, 20, { avatars: plan.avatars, scenesPerAct: 0, videoClips: 0, quality: "standard" });
  await mutate(r.code, (rm) => { ["A", "B", "C"].forEach((n) => addPlayer(rm, n, "adult", false, true)); addPlayer(rm, "K", "kid", false, true); });
  return r.code;
};

async function main() {
  const code = await withPlayers({ avatars: true });
  assert.equal(launchView(await load(code)), null, "nothing is launching while guests gather");

  // writing the mystery (the slow, unknown-length step)
  await mutate(code, (rm) => beginGeneration(rm));
  let v = launchView(await load(code))!;
  assert.equal(v.steps.find((s) => s.id === "story")!.state, "active");
  assert.equal(v.steps.find((s) => s.id === "cast")!.state, "pending");
  assert.ok(v.percent >= 5 && v.percent <= 40, `percent ${v.percent}`);
  assert.ok(v.elapsedMs !== null && !v.done);
  assert.equal(publicView(await load(code)).launch?.steps[1].label, "Writing the mystery", "guests and the TV see it too");

  // cast, then portraits one by one
  const room0 = await load(code);
  const gen = await generateCase(generationRoster(room0), room0.config, { model: null });
  await mutate(code, (rm) => finishGeneration(rm, gen));
  v = launchView(await load(code))!;
  assert.equal(v.steps.find((s) => s.id === "story")!.state, "done");
  const portraits = v.steps.find((s) => s.id === "portraits")!;
  assert.equal(portraits.state, "active"); assert.equal(portraits.detail, "0 of 4");
  assert.equal(v.percent, 50);
  await runNext(code); await runNext(code);
  v = launchView(await load(code))!;
  assert.equal(v.steps.find((s) => s.id === "portraits")!.detail, "2 of 4");
  assert.equal(v.percent, Math.round(50 + 45 * 0.5));
  for (let i = 0; i < 6; i++) await runNext(code);
  v = launchView(await load(code))!;
  assert.equal(v.percent, 100); assert.ok(v.done);
  assert.equal(v.steps.at(-1)!.state, "done");
  await mutate(code, (rm) => advance(rm)); // act1
  assert.equal(launchView(await load(code)), null, "the bar goes away once the story is under way");

  // paused media is explained, not a silent stall
  const c2 = await withPlayers({ avatars: true });
  await mutate(c2, (rm) => startGame(rm));
  await mutate(c2, (rm) => { rm.budget.plan.paused = true; });
  v = launchView(await load(c2))!;
  assert.equal(v.steps.find((s) => s.id === "portraits")!.detail, "paused by the host");
  assert.equal(v.paused, true);

  // no portraits planned: ready as soon as the cast is set
  const c3 = await withPlayers({ avatars: false });
  await mutate(c3, (rm) => startGame(rm));
  v = launchView(await load(c3))!;
  assert.ok(v.done && v.percent === 100);

  // the jokes: plenty, unique, and safe for a room with children
  assert.ok(LAUNCH_QUIPS.length >= 15 && new Set(LAUNCH_QUIPS).size === LAUNCH_QUIPS.length);
  for (const q of LAUNCH_QUIPS) assert.ok(!/fuck|shit|dump|epstein|trump|sex|nude|rape/i.test(q), `unsafe quip: ${q}`);
  assert.ok(LAUNCH_QUIPS.some((q) => /top up your glass/i.test(q)) && LAUNCH_QUIPS.some((q) => /shower/i.test(q)));

  console.log("OK: launch progress (writing, casting, portraits, ready, paused, quips)");
}
main().catch((e) => { console.error(e); process.exit(1); });
