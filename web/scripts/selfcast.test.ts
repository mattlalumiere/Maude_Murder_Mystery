// Players keep their own names; traits; life stories; briefings. Run: npx tsx scripts/selfcast.test.ts
import assert from "node:assert/strict";
import { addBots, addPlayer, advance, beginGeneration, createRoom, finishGeneration, generationRoster, startGame } from "../src/lib/engine";
import { generateCase } from "../src/lib/gm-ai";
import { templateLife, writeLife, visualLeaks } from "../src/lib/backstory";
import { beginLives, fillMissingLives } from "../src/lib/life";
import { SAMPLE_CASE } from "../src/lib/sample-case";
import { resolveTokens } from "../src/lib/selfcast";
import { TRAITS_ADULT, TRAITS_KID } from "../src/lib/traits";
import { getStore, mutate } from "../src/lib/store";
import type { TextModel } from "../src/lib/ai/ports";
import type { CaseFile } from "../src/lib/types";

const load = async (code: string) => (await getStore().get(code))!;
const plan = { avatars: true, scenesPerAct: 0, videoClips: 0, quality: "standard" as const };
const NAMES: [string, "adult" | "kid" | "teen" | "little", "he" | "she" | "they"][] = [
  ["Hana", "adult", "she"], ["Ben", "adult", "he"], ["Cleo", "adult", "they"], ["Dmitri", "adult", "he"], ["Eve", "adult", "she"],
  ["Zed", "kid", "he"], ["Mia", "teen", "she"], ["Pip", "little", "they"],
];
async function newRoom(extra: { bots?: number } = {}) {
  const r = await createRoom("hostS", "secretcode", { name: "Self" }, 20, plan);
  await mutate(r.code, (room) => { for (const [n, g, pr] of NAMES) addPlayer(room, n, g, false, true, undefined, undefined, pr); if (extra.bots) addBots(room, extra.bots); });
  return r.code;
}
const fakeModel = (text: () => string): TextModel => ({ id: "fake", generate: async () => ({ text: text(), usage: { inputTokens: 1, outputTokens: 1 }, model: "fake", finishReason: "stop", latencyMs: 1 }) });

async function main() {
  // ---- names with braces cannot become story tokens
  const probe = await createRoom("h0", "secretcode", {}, 1, plan);
  await mutate(probe.code, (rm) => { addPlayer(rm, "{{P2}}", "adult", false, true); });
  assert.equal((await load(probe.code)).players[0].name, "P2", "braces are stripped");

  // ---- sample story: every player keeps their own name; the story adds a trait, never a new name
  const code = await newRoom({ bots: 1 });
  await mutate(code, (rm) => startGame(rm));
  const room = await load(code);
  const text = JSON.stringify(room.case);
  assert.ok(!/\{\{/.test(text), "no unresolved name tokens");
  for (const p of room.players) {
    const ch = room.case!.characters.find((c) => c.id === p.characterId)!;
    assert.equal(ch.name, p.name.replace(/\s*\(AI\)\s*$/, ""), `${p.name} keeps their own name`);
    assert.ok(ch.title, "public occupation");
    assert.ok(ch.trait, "private trait");
    assert.equal(ch.kid, p.ageGroup !== "adult" || ch.kid, "kids get kid characters");
  }
  assert.ok(!/Carol|Gus|Rosie|Frank Fairway/.test(text), "no pre-written names remain in the story");
  const killerP = room.players.find((p) => p.characterId === room.case!.killerId)!;
  const victimP = room.players.find((p) => p.characterId === room.case!.victimId)!;
  assert.equal(room.case!.characters.find((c) => c.id === killerP.characterId)!.trait, "Murderer");
  assert.equal(room.case!.characters.find((c) => c.id === victimP.characterId)!.trait, "Murdered");
  assert.equal(killerP.ageGroup === "adult", true, "the killer is a grown-up");
  const traits = room.case!.characters.filter((c) => room.players.some((p) => p.characterId === c.id)).map((c) => c.trait!);
  assert.equal(new Set(traits.filter((t) => t !== "Royal mascot")).size, traits.filter((t) => t !== "Royal mascot").length, "traits are not repeated");
  // the token version is kept for saving, and holds no real names
  const tpl = JSON.stringify(room.caseTemplate);
  assert.ok(/\{\{P2\}\}/.test(tpl));
  for (const [n] of NAMES) assert.ok(!new RegExp(`\\b${n}\\b`).test(tpl), `template leaks ${n}`);
  // the bank is free of sexual-abuse and sex-work roles, because children play
  for (const t of [...TRAITS_ADULT, ...TRAITS_KID]) assert.ok(!/molest|prostitut|rape|abuse|escort|pedo/i.test(t.name + " " + t.angle), `unsafe trait ${t.name}`);

  // ---- lives and briefings (no AI: filled at once, portraits queued)
  for (const p of room.players) {
    const c = room.case!.characters.find((x) => x.id === p.characterId)!;
    assert.ok(c.card.life && c.card.visual && c.card.opening, `${p.name} has life, look and briefing`);
    assert.ok(c.card.life!.earlyLife.includes(p.name.replace(/\s*\(AI\)\s*$/, "")), "the life story is about this player");
    assert.ok(c.card.opening!.objective.length > 20 && c.card.opening!.startHere.length >= 2 && c.card.opening!.notes.length >= 2);
    if (c.kid) assert.ok(!/engaged|masquerade|casserole|restraining|ring/i.test(JSON.stringify(c.card.life)), "children's stories are G-rated");
    assert.ok(!visualLeaks(c.card.visual!, c), "the portrait look gives nothing away");
  }
  const kp = room.case!.characters.find((c) => c.id === room.case!.killerId)!;
  assert.match(kp.card.opening!.objective, /get caught|You did it/i, "the killer's objective is to get away with it");
  assert.equal(room.media.filter((m) => m.kind === "avatar").length, room.players.length);
  assert.ok(!room.media.some((m) => m.kind === "avatar" && room.players.some((p) => m.prompt.includes(p.name.replace(/\s*\(AI\)\s*$/, "")))), "no names are sent to image models");

  // ---- pronouns: the life story uses them correctly and never changes sex
  const sample = await load(code);
  const hana = sample.players.find((p) => p.name === "Hana")!, ben = sample.players.find((p) => p.name === "Ben")!, cleo = sample.players.find((p) => p.name === "Cleo")!;
  const lifeOf = (p: typeof hana) => JSON.stringify(templateLife(sample, p, sample.case!.characters.find((c) => c.id === p.characterId)!).life);
  for (let i = 0; i < 20; i++) {
    assert.ok(!/\b(he|his|him)\b/i.test(lifeOf(hana).replace(/Hana/g, "")), "she/her player never gets he/him");
    assert.ok(!/\b(she|hers?)\b/i.test(lifeOf(ben).replace(/Ben/g, "")), "he/him player never gets she/her");
    assert.ok(!/\b(he|she|his|hers?|him)\b/i.test(lifeOf(cleo).replace(/Cleo/g, "")), "they/them player gets neutral words");
  }

  // ---- stories written by AI for this cast: strict mapping, tokens resolved, plan honoured
  const c2 = await newRoom();
  await mutate(c2, (rm) => beginGeneration(rm));
  const before = await load(c2);
  const cast = generationRoster(before).cast!;
  const aiCase = (leakName?: string): string => {
    const base: CaseFile = structuredClone(SAMPLE_CASE);
    const kids = base.characters.filter((c) => c.kid), grown = base.characters.filter((c) => !c.kid);
    const chars = cast.map((e, i) => {
      const src = e.ageGroup === "adult" ? grown[i % grown.length] : kids[i % kids.length];
      return { ...structuredClone(src), id: `c${i + 1}`, forHandle: e.handle, slot: e.handle, name: `{{${e.handle}}}`, kid: e.ageGroup !== "adult", trait: e.trait, role: e.role === "victim" ? "victim" : e.role === "mascot" ? "mascot" : src.role };
    });
    const k = cast.find((e) => e.role === "killer")!, v = cast.find((e) => e.role === "victim")!;
    const out: CaseFile = { ...base, characters: chars as CaseFile["characters"], killerId: `c${cast.indexOf(k) + 1}`, victimId: `c${cast.indexOf(v) + 1}`, twist: leakName ? `${leakName} confessed!` : "TWIST! {{P1}} remembers something." };
    return JSON.stringify(resolveTokens(out, {}, "{{P1}}") && out);
  };
  const good = await generateCase(generationRoster(before), before.config, { model: fakeModel(() => aiCase()) });
  assert.equal(good.degraded, false, good.degradedReason);
  await mutate(c2, (rm) => finishGeneration(rm, good));
  const r2 = await load(c2);
  const byHandle = (h: string) => r2.players[parseInt(h.slice(1), 10) - 1];
  const plan2 = r2.castPlan;
  assert.equal(r2.phase, "cards");
  assert.equal(r2.caseSource, "bedrock");
  assert.equal(r2.case!.characters.find((c) => c.id === r2.case!.killerId)!.name, byHandle(cast.find((e) => e.role === "killer")!.handle).name, "the planned killer is the killer");
  for (const e of cast) assert.equal(r2.case!.characters.find((c) => c.forHandle === e.handle)!.trait, e.trait, "traits follow the plan");
  assert.ok(plan2 === undefined || plan2.killer === cast.find((e) => e.role === "killer")!.handle);
  // a story that uses a real name is rejected and repaired
  let calls = 0;
  const leaky = await generateCase(generationRoster(before), before.config, { model: fakeModel(() => (calls++ === 0 ? aiCase("Hana") : aiCase())) });
  assert.ok(calls === 2 && leaky.degraded === false, `leaky first reply was repaired (calls ${calls}, ${leaky.degradedReason})`);
  // a story whose killer is the wrong person is rejected
  const wrong = JSON.parse(aiCase()); const other = wrong.characters.find((c: any) => c.id !== wrong.killerId && !c.kid); wrong.killerId = other.id;
  const rejected = await generateCase(generationRoster(before), before.config, { model: fakeModel(() => JSON.stringify(wrong)) });
  assert.equal(rejected.degraded, true, "wrong killer is not accepted");

  // ---- the AI life writer: good output is used, junk and leaky looks fall back
  const lr = await load(code);
  const p0 = lr.players.find((p) => p.name === "Eve")!; const c0 = lr.case!.characters.find((c) => c.id === p0.characterId)!;
  const goodLife = JSON.stringify({ earlyLife: "Eve grew up on a lighthouse that never had a light.", loveLife: "Eve once wooed a sea captain with a kazoo.", hobbies: "Collects spoons.", ambition: "To own a very small hotel.", visual: "a sparkling sailor-style jacket, brass buttons, a kazoo on a string, merry grin", opening: { objective: "Find the culprit and guard your secret. You may hide embarrassing things.", startHere: ["Ask Ben about the goblets.", "Compare alibis with Cleo."], notes: ["Timeline", "Odd smells", "Hunches"] } });
  const w1 = await writeLife(lr, p0, c0, fakeModel(() => goodLife));
  assert.equal(w1.source, "model"); assert.equal(w1.result.life.hobbies, "Collects spoons."); assert.ok(w1.result.opening.startHere.length === 2);
  const w2 = await writeLife(lr, p0, c0, fakeModel(() => "not json"));
  assert.equal(w2.source, "template");
  const leakyVisual = JSON.stringify({ ...JSON.parse(goodLife), visual: "holding a vial of poison with a guilty grin" });
  const w3 = await writeLife(lr, p0, c0, fakeModel(() => leakyVisual));
  assert.ok(!/poison|guilty/.test(w3.result.visual), "a leaky look is replaced");
  const w4 = await writeLife(lr, p0, c0, fakeModel(() => goodLife.replace("Eve grew up", "What the fuck, Eve grew up")));
  assert.equal(w4.source, "template", "unsafe text falls back to the template");

  // ---- advancing past the briefing fills anyone still waiting
  const c3 = await newRoom();
  await mutate(c3, (rm) => startGame(rm));
  await mutate(c3, (rm) => { for (const c of rm.case!.characters) { delete c.card.life; delete c.card.opening; delete c.card.visual; } });
  await mutate(c3, (rm) => advance(rm));
  const r3 = await load(c3);
  assert.ok(r3.players.every((p) => r3.case!.characters.find((c) => c.id === p.characterId)!.card.opening), "missing briefings are filled when the story begins");
  void beginLives; void fillMissingLives;

  console.log("OK: self-cast (own names, traits, tokens, life stories, briefings, pronouns, AI cast contract)");
}
main().catch((e) => { console.error(e); process.exit(1); });
