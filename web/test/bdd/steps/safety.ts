import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { cardText, createGame, expectOk, fillLobby, joinPlayer, startedGame, startGame, viewOf, advanceTo } from "../support/fixtures";
import { strings } from "../support/asserts";
import type { MmWorld } from "../support/world";

const ALCOHOL = /\b(alcohol\w*|drinking|drunk|sips?|shots?|beer|wine|liquor|booze|cocktails?|tipsy)\b/i;
const SCARY = /\b(blood\w*|gore|gory|stab\w*|gun|knife|corpse|scream\w*|terrif\w*|horrif\w*|romance|romantic|kiss\w*|affair|sweetheart)\b/i;
const PRESSURE = /\b(you must (answer|reply)|must answer|has to answer|have to answer|force someone|force a|demand that|no choice)\b/i;

type PV = { name: string; age: string; json: any; cards: string[] };
async function playerViews(w: MmWorld): Promise<PV[]> {
  const out: PV[] = [];
  for (const p of w.game.players) {
    const r = expectOk(await viewOf(w, w.game, p), `player ${p.name}`);
    const card = r.json.me.character?.card ?? {};
    out.push({ name: p.name, age: p.ageGroup, json: r.json, cards: cardText({ card }) });
  }
  return out;
}
async function everyText(w: MmWorld, o: { skipExtra?: boolean } = {}): Promise<string[]> {
  const room = await w.room();
  const k = room.case!;
  const t = [...k.clues.map((c) => c.text), k.twist, ...Object.values(k.narration).filter((x): x is string => !!x), k.setting, k.title];
  for (const c of k.characters) t.push(c.tease, ...cardText(c as any, o.skipExtra));
  return t;
}
const isKidGroup = (a: string) => a === "kid" || a === "little";

Then("every player card includes the rule that anyone can say {string}", async function (this: MmWorld, word: string) {
  const bad = (await playerViews(this)).filter((p) => !p.cards.some((s) => s.includes(word)));
  assert.deepEqual(bad.map((p) => p.name), [], `cards without the "${word}" rule`);
});
Then("no prompt on any card or screen requires an answer", async function (this: MmWorld) {
  const hits = (await everyText(this)).filter((s) => PRESSURE.test(s));
  assert.deepEqual(hits, [], "heuristic: prompts that force an answer");
});
Then("every player card and the big screen show the rule that {string} stops the activity at once", async function (this: MmWorld, word: string) {
  const bad = (await playerViews(this)).filter((p) => !p.cards.some((s) => s.includes(word)));
  assert.deepEqual(bad.map((p) => p.name), [], `cards without the ${word} rule`);
  const pub = expectOk(await viewOf(this, this.game, "public"), "public");
  assert.ok(pub.text.includes(word), `the big screen (public view) never mentions ${word}`);
});
Then("the host cannot turn this rule off", async function (this: MmWorld) {
  const ctx = await createGame(this, { config: { pass: false, safe: false, safeRule: false, passRule: false, safetyRules: false, disableSafety: true } });
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
  await startGame(this, ctx);
  const bad = (await playerViews(this)).filter((p) => !p.cards.some((s) => s.includes("SAFE")));
  assert.deepEqual(bad.map((p) => p.name), [], "SAFE rule missing when the host tries to disable it");
  const cfg = expectOk(await viewOf(this, ctx, "host"), "host").json.config;
  assert.ok(!Object.keys(cfg).some((key) => /safe|pass/i.test(key)), "config exposes a switch for the rule");
});

Given("a started game with 4 adults and 2 kids where adults may drink", async function (this: MmWorld) { await startedGame(this, { config: { drinking: "adults" } }); });
Given(/^a started game with 4 adults and 2 kids where drinking is set to "none"$/, async function (this: MmWorld) { await startedGame(this, { config: { drinking: "none" } }); });
Then("no kid or little player card mentions alcohol, drinking, sips or shots", async function (this: MmWorld) {
  const bad: string[] = [];
  for (const p of (await playerViews(this)).filter((x) => isKidGroup(x.age))) for (const s of p.cards) if (ALCOHOL.test(s)) bad.push(`${p.name}: ${s.slice(0, 80)}`);
  assert.deepEqual(bad, []);
});
Then("no clue shown to kids mentions alcohol or drinking", async function (this: MmWorld) {
  const room = await this.room();
  const bad = [...room.case!.clues.map((c) => c.text), room.case!.twist].filter((s) => ALCOHOL.test(s));
  assert.deepEqual(bad, []);
});
Then("no card, clue, narration or prompt mentions alcohol or drinking games", async function (this: MmWorld) {
  const bad = (await everyText(this)).filter((s) => ALCOHOL.test(s));
  assert.deepEqual(bad.map((s) => s.slice(0, 90)), [], "content that mentions alcohol although drinking is set to none");
});
Then("every drinking prompt offers a non-alcoholic substitute", async function (this: MmWorld) {
  const prompts = (await everyText(this)).filter((s) => /\b(sips?|drink(ing)?|toast(ing)?\b.*\bsip)\b/i.test(s) && ALCOHOL.test(s));
  const bad = prompts.filter((s) => !/\b(water|juice|soda|non-?alcoholic|mocktail|substitute|instead|lemonade)\b/i.test(s));
  assert.deepEqual(bad.map((s) => s.slice(0, 90)), [], "drinking prompts without a substitute");
});
Then("no drinking prompt asks for shots", async function (this: MmWorld) {
  assert.deepEqual((await everyText(this)).filter((s) => /\bshots?\b/i.test(s)), []);
});
Then("every card given to a kid contains no violence beyond a mild mystery, no romance and no fear-inducing detail", async function (this: MmWorld) {
  const bad: string[] = [];
  for (const p of (await playerViews(this)).filter((x) => x.age !== "adult")) for (const s of p.cards) if (SCARY.test(s)) bad.push(`${p.name}: ${s.slice(0, 80)}`);
  assert.deepEqual(bad, []);
});
Then("the victim role is shown to the victim's player as a funny ghost role", async function (this: MmWorld) {
  const room = await this.room();
  const victim = room.players.find((p) => p.characterId === room.case!.victimId)!;
  const text = cardText(room.case!.characters.find((c) => c.id === room.case!.victimId) as any).join(" ");
  assert.match(text, /ghost/i);
  assert.match(text, /(funny|banana|dramatic|silly|haunt|glorious)/i);
  const mine = (await playerViews(this)).find((p) => p.name === victim.name)!;
  assert.match(mine.cards.join(" "), /ghost/i);
});
Then("the little player is not the victim", async function (this: MmWorld) {
  const room = await this.room();
  const little = room.players.find((p) => p.ageGroup === "little")!;
  assert.notEqual(little.characterId, room.case!.victimId);
});
Then("the little player's character is not on the ballot", async function (this: MmWorld) {
  await advanceTo(this, this.game, "act4");
  const room = await this.room();
  const little = room.players.find((p) => p.ageGroup === "little")!;
  const o = expectOk(await viewOf(this, this.game, "public"), "public").json.ballotOptions;
  assert.ok(!o.suspects.some((s: any) => s.id === little.characterId));
});
Then("the killer character is played by an adult", async function (this: MmWorld) {
  const room = await this.room();
  assert.equal(room.players.find((p) => p.characterId === room.case!.killerId)!.ageGroup, "adult");
});
Then("no card names a real person, other than the names the players chose for themselves in their own backstory", function (this: MmWorld) {
  return "pending";
});

// ---- untrusted text ----
Given("a game where a player wrote the backstory {string}", async function (this: MmWorld, text: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, {});
  await fillLobby(this, ctx, { adults: 4, kids: 1 });
  await joinPlayer(this, ctx, "Writer", "kid", { profile: { backstoryMode: "hint", backstory: text } });
  this.s.backstory = text;
});
Given("a game whose host wrote the avoid field {string} and the must include field {string}", async function (this: MmWorld, avoid: string, must: string) {
  this.session ??= "dev:Hana";
  const ctx = await createGame(this, { config: { avoid, mustInclude: must } });
  await fillLobby(this, ctx, { adults: 4, kids: 2 });
});
Then("the backstory appears on that player's card only as written text", async function (this: MmWorld) {
  const room = await this.room();
  const w = room.players.find((p) => p.name === "Writer")!;
  const card = room.case!.characters.find((c) => c.id === w.characterId)!.card;
  assert.equal(card.extra, `Your idea for the GM: ${this.s.backstory}`);
  const others = room.case!.characters.filter((c) => c.id !== w.characterId);
  for (const c of others) assert.ok(!JSON.stringify(c.card).includes(this.s.backstory), `${c.id} card contains the backstory`);
  assert.ok(!JSON.stringify({ ...card, extra: undefined }).includes(this.s.backstory));
});
Then("the safety rules are unchanged", async function (this: MmWorld) {
  const views = await playerViews(this);
  for (const p of views) {
    assert.ok(p.cards.some((s) => s.includes("SAFE")), `${p.name}: SAFE rule missing`);
    assert.ok(p.cards.some((s) => /\bPass\b/.test(s)), `${p.name}: Pass rule missing`);
  }
});
Then("no kid card mentions alcohol", async function (this: MmWorld) {
  const room = await this.room();
  const bad: string[] = [];
  for (const p of room.players.filter((x) => x.ageGroup !== "adult")) {
    const c = room.case!.characters.find((x) => x.id === p.characterId)!;
    // The player's own words (card.extra) are excluded: the rule is about what the game itself adds.
    for (const s of cardText(c as any, true)) if (ALCOHOL.test(s)) bad.push(`${p.name}: ${s.slice(0, 80)}`);
  }
  assert.deepEqual(bad, []);
});
Then("the {string} and {string} rules are still shown", async function (this: MmWorld, a: string, b: string) {
  for (const p of await playerViews(this)) for (const w of [a, b]) assert.ok(p.cards.some((s) => s.includes(w)), `${p.name}: ${w} rule missing`);
});
void When;
