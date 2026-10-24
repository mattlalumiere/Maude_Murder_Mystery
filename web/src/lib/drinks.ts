// Heavy drinking night: adults who opt in drink full drinks at game prompts. Drink-forward, but built on safeguards:
//   - adults only, and only players who chose "in" (everyone else joins every round with a mocktail or water),
//   - a personal limit per drinker (the game stops prompting them at it),
//   - "tap out" at any time with no penalty, "done for the night" at any time,
//   - a pace guard (no more than 2 drinks in 15 minutes), a forced water-and-food intermission, host pause and stop.
// Children, teenagers, toddlers and AI guests are never part of any drink prompt.
import { getRuntime } from "./ids";
import type { DrinkPrompt, DrinkState, DrinkTally, Phase, Player, Room } from "./types";

export const DRINK = {
  limitMin: 2,
  limitMax: 6, // standard drinks over the night. Deliberately capped: more than this in a couple of hours is dangerous.
  limitDefault: 4,
  paceWindowMs: 15 * 60 * 1000,
  paceMaxInWindow: 2,
  maxPrompts: 40,
} as const;

export const STANDARD_DRINK = "One standard drink is a 12 oz beer, a 5 oz glass of wine, or 1.5 oz of spirits.";

const now = () => getRuntime().clock.now();
const rnd = (n: number) => getRuntime().random.int(n);
const pickOne = <T,>(a: T[]) => a[rnd(a.length)];
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const rid = () => Array.from({ length: 8 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[rnd(32)]).join("");

export const isHeavy = (room: Pick<Room, "config">) => room.config.drinking === "heavy";

/** Adults taking part in the heavy night (drinkers and mocktail players). */
export const participants = (room: Room) => room.players.filter((p) => !p.isBot && p.ageGroup === "adult" && p.profile.drink);
export const drinkers = (room: Room) => participants(room).filter((p) => p.profile.drink!.mode === "in");

export function ensureState(room: Room): DrinkState {
  room.drinks ??= { prompts: [], tally: {}, paused: false, stopped: false };
  for (const p of participants(room)) room.drinks.tally[p.id] ??= { units: 0, water: 0, drinks: [], done: false };
  return room.drinks;
}

const recentDrinks = (t: DrinkTally) => t.drinks.filter((ts) => now() - ts < DRINK.paceWindowMs).length;
export const atLimit = (p: Player, t: DrinkTally) => t.done || t.units >= (p.profile.drink?.limit ?? 0);
export const paceHold = (t: DrinkTally) => recentDrinks(t) >= DRINK.paceMaxInWindow;

/** Drinkers who may be given a drink right now. */
function eligibleDrinkers(room: Room, units: number): Player[] {
  const st = ensureState(room);
  return drinkers(room).filter((p) => { const t = st.tally[p.id]; return !atLimit(p, t) && t.units + units <= p.profile.drink!.limit; });
}

// ---------- the rule bank ----------
type Slot = { title: string; text: string[]; units: number; scope: "all" | "targets"; count?: number };

/** Creative prompts per story beat. `{who}` is replaced on the screen by the chosen players. */
export const DRINK_BANK: Partial<Record<Phase, Slot[]>> = {
  act1: [
    { title: "The welcome toast", units: 1, scope: "all", text: ["Everyone raises a glass to the birthday man and drinks. Eyes up, glasses clinked.", "A toast to the host's questionable taste in guests. Everyone drinks."] },
  ],
  death: [
    { title: "The dead man's toast", units: 1, scope: "all", text: ["Gus is down! Everyone drinks to his memory, one dramatic gasp per sip.", "A moment of silence, then everyone drinks. He would have wanted it."] },
  ],
  act2: [
    { title: "Alibi roulette", units: 1, scope: "targets", count: 2, text: ["{who}: drink, then say your alibi in one breath with a straight face.", "{who}: the spotlight finds you. Drink, then swear your alibi on a snack."] },
    { title: "Suspicious silence", units: 1, scope: "targets", count: 1, text: ["{who}: you were too quiet. Drink and tell us one thing you noticed.", "{who}: drink, then accuse the person on your left of something silly."] },
  ],
  intermission: [
    { title: "Water and snacks", units: 0, scope: "all", text: ["Everyone drinks a full glass of water and eats something. This is not optional: the night is long."] },
  ],
  act3: [
    { title: "The twist toast", units: 1, scope: "all", text: ["A twist! Everyone drinks to the plot thickening.", "The room gasps. Everyone drinks to cover the gasp."] },
    { title: "Secrets will out", units: 1, scope: "targets", count: 2, text: ["{who}: drink, then point at your top suspect and say why in ten words.", "{who}: drink and name the guest you trust least."] },
  ],
  act4: [
    { title: "The accusation round", units: 1, scope: "targets", count: 3, text: ["{who}: drink, stand up, and make your case against one suspect.", "{who}: drink and accuse someone out loud. No take-backs."] },
  ],
};

/** Standing rules (honor system, shown on the screen) with a word that changes each act. */
export const TABOO_WORDS: Partial<Record<Phase, string>> = { act1: "cheers", act2: "alibi", act3: "twist", act4: "guilty" };
export function standingRules(phase: Phase): string[] {
  const rules = ["Break character or say a real name: drink 1 (tap Log a drink on your phone).", "Anyone points a finger at you and says \"suspect\": drink 1."];
  const w = TABOO_WORDS[phase];
  if (w) rules.unshift(`Poisoned chalice: whoever says "${w}" drinks 1.`);
  return rules;
}

const mk = (room: Room, phase: Phase, s: { title: string; text: string; units: number; scope: "all" | "targets"; targetIds: string[] }): DrinkPrompt => ({
  id: rid(), phase, title: s.title, text: s.text, units: s.units, scope: s.scope, targetIds: s.targetIds, answers: {}, ts: now(),
});

function push(room: Room, p: DrinkPrompt) {
  const st = ensureState(room);
  st.prompts.push(p);
  if (st.prompts.length > DRINK.maxPrompts) st.prompts = st.prompts.slice(-DRINK.maxPrompts);
}

/** Creates the prompts for a story beat. Called when the phase changes. Never targets anyone at their limit. */
export function queueDrinkRound(room: Room, phase: Phase) {
  if (!isHeavy(room) || !room.case) return;
  const st = ensureState(room);
  if (st.paused || st.stopped) return;
  const everyone = participants(room);
  if (!everyone.length) return;
  const nameOf = (ids: string[]) => ids.map((id) => room.players.find((p) => p.id === id)?.name ?? "A guest").join(" and ");

  for (const slot of DRINK_BANK[phase] ?? []) {
    if (slot.scope === "all") {
      // Drinkers with room left get the drink; everyone else (mocktail players, people at their limit) takes a water or a mocktail.
      const ids = slot.units === 0 ? everyone.map((p) => p.id) : everyone.filter((p) => p.profile.drink!.mode === "out" || !atLimit(p, st.tally[p.id])).map((p) => p.id);
      if (ids.length) push(room, mk(room, phase, { title: slot.title, text: pickOne(slot.text), units: slot.units, scope: "all", targetIds: ids }));
    } else {
      const pool = shuffle(eligibleDrinkers(room, slot.units));
      const ids = pool.slice(0, Math.min(slot.count ?? 1, pool.length)).map((p) => p.id);
      if (ids.length) push(room, mk(room, phase, { title: slot.title, text: pickOne(slot.text).replace("{who}", nameOf(ids)), units: slot.units, scope: "targets", targetIds: ids }));
    }
  }

  if (phase === "reveal" && room.result) {
    const killerId = room.result.killerId;
    const wrong = participants(room).filter((p) => p.ballot && p.ballot.killerId !== killerId).map((p) => p.id);
    const wrongDrinkers = shuffle(wrong.filter((id) => eligibleDrinkers(room, 1).some((p) => p.id === id)));
    if (wrongDrinkers.length) push(room, mk(room, phase, { title: "Judgment", text: `${nameOf(wrongDrinkers)}: you accused the wrong person. Drink to your shame.`, units: 1, scope: "targets", targetIds: wrongDrinkers }));
    const right = participants(room).filter((p) => p.ballot && p.ballot.killerId === killerId).map((p) => p.id);
    if (right.length) push(room, mk(room, phase, { title: "Detective's decree", text: `${nameOf(right)}: you cracked it! Each of you picks one other drinker, and that person drinks.`, units: 0, scope: "targets", targetIds: right }));
    push(room, mk(room, phase, { title: "The final toast", text: "Everyone raises a glass to the mystery, the cook, and the ghost. Drink, hug, hydrate.", units: 1, scope: "all", targetIds: everyone.filter((p) => p.profile.drink!.mode === "out" || !atLimit(p, st.tally[p.id])).map((p) => p.id) }));
  }
}

// ---------- answers ----------
export class DrinkError extends Error { constructor(public status: number, message: string) { super(message); } }

function myPlayerTally(room: Room, p: Player) {
  if (!isHeavy(room) || !p.profile.drink) throw new DrinkError(403, "You are not taking part in the drinking game");
  const st = ensureState(room);
  return { st, t: st.tally[p.id] };
}

/** "drank": log the drink for this prompt. "tapped": decline with no penalty. Mocktail players log with no alcohol. */
export function answerPrompt(room: Room, p: Player, promptId: string, answer: "drank" | "tapped") {
  const { st, t } = myPlayerTally(room, p);
  if (st.paused || st.stopped) throw new DrinkError(409, "Drinking is paused. Have some water.");
  const prompt = st.prompts.find((x) => x.id === promptId);
  if (!prompt || !prompt.targetIds.includes(p.id)) throw new DrinkError(404, "That round is not for you");
  if (prompt.answers[p.id]) return;
  if (answer === "tapped") { prompt.answers[p.id] = "tapped"; return; }
  if (p.profile.drink!.mode === "in" && prompt.units > 0) {
    if (atLimit(p, t)) throw new DrinkError(409, "You have reached your limit. Water from here. Tap out instead.");
    if (t.units + prompt.units > p.profile.drink!.limit) throw new DrinkError(409, "That would go past your limit. Tap out instead.");
    if (paceHold(t)) throw new DrinkError(429, "Pace check: you have had two drinks in 15 minutes. Have water and wait a few minutes, or tap out.");
    t.units += prompt.units; t.drinks = [...t.drinks, now()].slice(-12);
    if (t.units >= p.profile.drink!.limit) t.done = true;
  }
  prompt.answers[p.id] = "drank";
}

/** A drink taken outside a prompt (a standing rule, a toast). Same limit and pace rules. */
export function logDrink(room: Room, p: Player) {
  const { st, t } = myPlayerTally(room, p);
  if (st.paused || st.stopped) throw new DrinkError(409, "Drinking is paused. Have some water.");
  if (p.profile.drink!.mode !== "in") return;
  if (atLimit(p, t) || t.units + 1 > p.profile.drink!.limit) throw new DrinkError(409, "You have reached your limit. Water from here.");
  if (paceHold(t)) throw new DrinkError(429, "Pace check: have water and wait a few minutes.");
  t.units += 1; t.drinks = [...t.drinks, now()].slice(-12);
  if (t.units >= p.profile.drink!.limit) t.done = true;
}

export function logWater(room: Room, p: Player) { const { t } = myPlayerTally(room, p); t.water += 1; }

/** "I'm done for the night": no more prompts, ever, for this player. */
export function doneForNight(room: Room, p: Player) { const { t } = myPlayerTally(room, p); t.done = true; }

export function hostControl(room: Room, op: "pause" | "resume" | "water" | "stop") {
  if (!isHeavy(room)) throw new DrinkError(409, "This is not a heavy drinking game");
  const st = ensureState(room);
  if (op === "pause") st.paused = true;
  else if (op === "resume") { if (!st.stopped) st.paused = false; }
  else if (op === "stop") { st.stopped = true; st.paused = true; }
  else if (op === "water") push(room, mk(room, room.phase, { title: "Water round", text: "Everyone stops and drinks a full glass of water. Right now.", units: 0, scope: "all", targetIds: participants(room).map((p) => p.id) }));
}

// ---------- views ----------
const promptView = (room: Room, pr: DrinkPrompt) => ({
  id: pr.id, title: pr.title, text: pr.text, units: pr.units, scope: pr.scope,
  names: pr.targetIds.map((id) => room.players.find((p) => p.id === id)?.name).filter(Boolean) as string[],
  answered: Object.keys(pr.answers).length, total: pr.targetIds.length,
});

/** What the shared screen may show: the live round and the standing rules. Never anyone's tally. */
export function publicDrinkView(room: Room) {
  if (!isHeavy(room)) return undefined;
  const st = room.drinks;
  const live = st && !st.stopped ? [...st.prompts].reverse().find((p) => Object.keys(p.answers).length < p.targetIds.length) : undefined;
  return {
    paused: !!st?.paused, stopped: !!st?.stopped,
    round: live ? promptView(room, live) : null,
    rules: standingRules(room.phase),
    standardDrink: STANDARD_DRINK,
  };
}

/** One player's own drinking state (their own tally is visible only to them and the host). */
export function playerDrinkView(room: Room, p: Player) {
  if (!isHeavy(room) || !p.profile.drink) return undefined;
  const st = ensureState(room);
  const t = st.tally[p.id];
  const pending = [...st.prompts].reverse().find((x) => x.targetIds.includes(p.id) && !x.answers[p.id]);
  return {
    mode: p.profile.drink.mode, limit: p.profile.drink.limit, units: t.units, water: t.water,
    atLimit: atLimit(p, t), paceHold: paceHold(t),
    pending: pending ? { ...promptView(room, pending), units: p.profile.drink.mode === "in" ? pending.units : 0 } : null,
  };
}

export function hostDrinkView(room: Room) {
  if (!isHeavy(room)) return undefined;
  const st = ensureState(room);
  return {
    paused: st.paused, stopped: st.stopped,
    players: participants(room).map((p) => ({ id: p.id, name: p.name, mode: p.profile.drink!.mode, limit: p.profile.drink!.limit, units: st.tally[p.id].units, water: st.tally[p.id].water, done: atLimit(p, st.tally[p.id]) })),
  };
}
