// Self-cast: every player plays themselves. The story is written with name tokens like {{P3}}; when the cast is set
// each token becomes that player's own name. Nobody's name, age or pronouns are changed by the story.
import { getRuntime } from "./ids";
import { TRAITS_TABOO } from "./adults";
import { assignTraits, TRAIT_MASCOT, TRAIT_MURDERED, TRAIT_MURDERER, TRAITS_ADULT, TRAITS_KID } from "./traits";
import type { CaseFile, Character, Player, Room } from "./types";

const TOKEN = /\{\{([A-Za-z0-9]{1,8})\}\}/g;

/** Replaces every {{slot}} in every string. One pass, so a name that looks like a token is never expanded again. */
export function resolveTokens<T>(value: T, names: Record<string, string>, fallback = "a guest"): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(TOKEN, (_m, slot: string) => names[slot] ?? fallback);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

const NPC_NAMES = ["Uncle Bartholomew", "Aunt Philippa", "Cousin Wilhelmina", "Mr. Higginbotham", "Mrs. Pemberton-Smythe", "Old Mr. Finch", "Lady Marmalade", "Sir Reginald Crumb", "Madame Zora", "Nanny Prudence"];
/** A stand-in name for a story character nobody is playing tonight. */
export const npcName = (slot: string) => NPC_NAMES[(parseInt(slot.replace(/\D/g, ""), 10) || 0) % NPC_NAMES.length];

/** The in-story name of a player: their own name (AI guests lose the "(AI)" tag). */
export const storyName = (p: Player) => p.name.replace(/\s*\(AI\)\s*$/i, "").trim() || p.name;

const slotOf = (c: Character) => c.slot ?? c.id;

/**
 * Called right after characters are assigned to players. Keeps the token version (saved stories use it),
 * resolves names, and gives every character a private trait. Idempotent.
 */
export function applySelfCast(room: Room) {
  const template = room.case!;
  room.caseTemplate = structuredClone(template);
  const names: Record<string, string> = {};
  for (const c of template.characters) {
    const p = room.players.find((x) => x.characterId === c.id);
    names[slotOf(c)] = p ? storyName(p) : npcName(slotOf(c));
  }
  const resolved = resolveTokens(template, names);
  // Traits: from the cast plan when the AI was told them, otherwise drawn now.
  const plan = room.castPlan;
  if (plan) {
    for (const c of resolved.characters) {
      const p = room.players.find((x) => x.characterId === c.id);
      const handle = p ? `P${room.players.indexOf(p) + 1}` : "";
      c.trait = plan.traits[handle] ?? c.trait;
    }
  }
  assignMissing(resolved.characters, resolved.killerId, resolved.victimId, room.config.adultsOnly === true);
  room.case = resolved;
}

function assignMissing(chars: Character[], killerId: string, victimId: string, adultsOnly: boolean) {
  const missing = chars.filter((c) => !c.trait);
  if (!missing.length) return;
  assignTraits(missing, killerId, victimId, adultsOnly);
}

// ---------- the plan handed to the AI before it writes ----------
export interface CastEntry {
  handle: string; name: string; pronouns: "he" | "she" | "they"; ageGroup: Player["ageGroup"];
  role: "killer" | "victim" | "mascot" | "other"; trait: string; isBot: boolean;
}

const rnd = (n: number) => getRuntime().random.int(n);
const pick = <T,>(a: T[]) => a[rnd(a.length)];

/** Chooses who is the killer and who is the victim, and a trait for everybody, before the story is written. */
export function planCast(room: Room, existing?: { killer: string; victim: string; traits: Record<string, string> }): { killer: string; victim: string; traits: Record<string, string>; entries: CastEntry[] } {
  const hs = room.players.map((p, i) => ({ p, handle: `P${i + 1}` }));
  if (existing) {
    return { ...existing, entries: hs.map(({ p, handle }) => ({
      handle, name: storyName(p), pronouns: p.pronouns ?? "they", ageGroup: p.ageGroup, isBot: !!p.isBot, trait: existing.traits[handle] ?? "",
      role: handle === existing.killer ? "killer" : handle === existing.victim ? "victim" : p.ageGroup === "little" ? "mascot" : "other",
    })) };
  }
  const young = hs.filter(({ p }) => (p.ageGroup === "kid" || p.ageGroup === "teen") && !p.isBot);
  const victim =
    young.find(({ p }) => p.wantsVictim) ?? young.find(({ p }) => p.ageGroup === "kid") ?? young[0] ??
    hs.find(({ p }) => p.wantsVictim && p.ageGroup === "adult" && !p.isBot) ?? pick(hs.filter(({ p }) => p.ageGroup === "adult" && !p.isBot));
  const killer = pick(hs.filter(({ p, handle }) => p.ageGroup === "adult" && handle !== victim.handle));
  const adultBank = room.config.adultsOnly ? [...TRAITS_TABOO, ...TRAITS_ADULT] : [...TRAITS_ADULT], kidBank = [...TRAITS_KID];
  const take = (bank: typeof adultBank) => (bank.length ? bank.splice(rnd(bank.length), 1)[0] : pick(TRAITS_ADULT));
  const traits: Record<string, string> = {};
  const entries: CastEntry[] = hs.map(({ p, handle }) => {
    const role: CastEntry["role"] = handle === killer.handle ? "killer" : handle === victim.handle ? "victim" : p.ageGroup === "little" ? "mascot" : "other";
    const trait = role === "killer" ? TRAIT_MURDERER.name : role === "victim" ? TRAIT_MURDERED.name : role === "mascot" ? TRAIT_MASCOT.name : (p.ageGroup === "adult" ? take(adultBank) : take(kidBank)).name;
    traits[handle] = trait;
    return { handle, name: storyName(p), pronouns: p.pronouns ?? "they", ageGroup: p.ageGroup, role, trait, isBot: !!p.isBot };
  });
  return { killer: killer.handle, victim: victim.handle, traits, entries };
}

export type { CaseFile };
