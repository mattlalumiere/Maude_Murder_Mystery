// Adults-only unfiltered mode. Run: npx tsx scripts/adults.test.ts
import assert from "node:assert/strict";
import { addPlayer, advance, createRoom, startGame, publicView } from "../src/lib/engine";
import { buildCasePrompt } from "../src/lib/gm-ai";
import { buildBotPrompt, cleanLine } from "../src/lib/bots";
import { writeLife } from "../src/lib/backstory";
import { postChat } from "../src/lib/chat";
import { saveStory } from "../src/lib/stories";
import { TRAITS_TABOO } from "../src/lib/adults";
import { TRAITS_ADULT, TRAITS_KID } from "../src/lib/traits";
import { getStore, mutate } from "../src/lib/store";
import type { TextModel } from "../src/lib/ai/ports";

const plan = { avatars: false, scenesPerAct: 0, videoClips: 0, quality: "standard" as const };
const load = async (c: string) => (await getStore().get(c))!;
const names = ["Hana", "Ben", "Cleo", "Dmitri", "Eve", "Finn"];

async function main() {
  // the host must confirm everyone is 18+
  await assert.rejects(() => createRoom("h", "secretcode", { adultsOnly: true }, 1, plan), /18 or older/);
  const r = await createRoom("h", "secretcode", { name: "Dirty", adultsOnly: true, adultsAttested: true, expected: { adults: 6, kids: 5, toddlers: 2 }, drinking: "heavy", drinkingAttested: true }, 1, plan);
  assert.equal(r.config.expected.kids + r.config.expected.toddlers, 0, "no children are expected");
  assert.equal(r.config.spice, "spicy");
  await mutate(r.code, (rm) => { for (const n of names) addPlayer(rm, n, "adult", false, true, { drink: { mode: "in", limit: 4 } } as never); });
  await mutate(r.code, (rm) => { assert.throws(() => addPlayer(rm, "Zed", "kid", false, true), /adults-only/); assert.throws(() => addPlayer(rm, "Pip", "little", false, true), /adults-only/); assert.throws(() => addPlayer(rm, "Mia", "teen", false, true), /adults-only/); });
  assert.equal(publicView(await load(r.code)).adultsOnly, true);

  // taboo traits are drawn, and the hard limits hold in every bank
  await mutate(r.code, (rm) => startGame(rm));
  let room = await load(r.code);
  const t = room.case!.characters.filter((c) => room.players.some((p) => p.characterId === c.id)).map((c) => c.trait!);
  const taboo = new Set(TRAITS_TABOO.map((x) => x.name));
  assert.ok(t.filter((x) => taboo.has(x)).length >= 3, `taboo traits are used (${t.join(", ")})`);
  for (const x of [...TRAITS_TABOO, ...TRAITS_ADULT, ...TRAITS_KID]) assert.ok(!/molest|rape|rapist|pedo|abuse|assault|incest|underage|child/i.test(x.name + " " + x.angle), `hard limit: ${x.name}`);
  assert.ok(TRAITS_TABOO.some((x) => /escort/i.test(x.name)), "sex work is available in adults-only");
  assert.ok(room.players.every((p) => room.case!.characters.find((c) => c.id === p.characterId)!.card.life!.earlyLife.length > 20));
  const lifeText = JSON.stringify(room.case!.characters.map((c) => c.card.life));
  assert.ok(!/\b(casserole|hamster)\b/.test("") && lifeText.length > 100);

  // tone reaches every model prompt
  assert.match(buildCasePrompt({ adults: 6, kids: 0, littles: 0, players: [] } as never, room.config).system, /ADULTS-ONLY/);
  assert.match(buildCasePrompt({ adults: 6, kids: 0, littles: 0, players: [] } as never, room.config).user, /Cards Against Humanity/);
  const bot = room.players[0];
  assert.match(buildBotPrompt(room, bot, { kind: "reply", asker: "Ben", message: "hi" }).system, /Cards Against Humanity/);
  let seen = "";
  const spy: TextModel = { id: "spy", generate: async (o) => { seen = o.system; return { text: "x", usage: { inputTokens: 1, outputTokens: 1 }, model: "spy", finishReason: "stop", latencyMs: 1 }; } };
  const p0 = room.players[0]; await writeLife(room, p0, room.case!.characters.find((c) => c.id === p0.characterId)!, spy);
  assert.match(seen, /ADULTS ONLY/);

  // chat: profanity is fine here, slurs and sexual violence never are
  await mutate(r.code, (rm) => { postChat(rm, rm.players[0], "This party is a goddamn shitshow, Ben"); });
  assert.throws(() => postChat(room, room.players[1], "something with rape in it"), /friendly/);
  assert.equal(cleanLine("you absolute fucker", 100, true), "you absolute fucker");
  assert.equal(cleanLine("you absolute fucker", 100, false), null, "family rooms stay clean");
  assert.equal(cleanLine("a nigger said", 100, true), null);
  assert.equal(cleanLine("molester at the door", 100, true), null);

  // heavy night text is not tied to the old sample names
  await mutate(r.code, (rm) => advance(rm));
  await mutate(r.code, (rm) => advance(rm));
  room = await load(r.code);
  const all = JSON.stringify(room.drinks?.prompts ?? []);
  assert.ok(!/Gus|\{victim\}|\{who\}/.test(all), "drink prompts use real names");

  // saved adults-only stories stay link-only and need an adults-only room
  await mutate(r.code, (rm) => { rm.phase = "act4"; });
  room = await load(r.code);
  const saved = await saveStory(room, "h", { title: "Naughty", blurb: "", visibility: "public", kind: "story" } as never);
  assert.equal(saved.meta.visibility, "link", "never in the public gallery");
  assert.equal(saved.meta.adultsOnly, true);

  // a family room is unchanged
  const f = await createRoom("h2", "secretcode", { name: "Fam" }, 1, plan);
  assert.notEqual(f.config.adultsOnly, true);
  assert.doesNotMatch(buildCasePrompt({ adults: 3, kids: 3, littles: 0, players: [] } as never, f.config).system, /ADULTS-ONLY/);
  console.log("OK: adults-only mode (attestation, no minors, taboo traits, tone, chat filter, hard limits, stories)");
}
main().catch((e) => { console.error(e); process.exit(1); });
