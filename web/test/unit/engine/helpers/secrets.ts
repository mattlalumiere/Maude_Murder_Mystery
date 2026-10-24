import type { Player, Room } from "../../../../src/lib/types";

/** Everything a view must never contain, derived from the room itself rather than hand-listed strings. */
export interface Forbidden {
  keys: Set<string>;
  exact: Set<string>;
  fragments: { label: string; text: string }[];
}

const ALWAYS_KEYS = ["killerId", "truth", "nudges", "advanced", "overrideHash", "overrideSalt", "overrideCode", "token", "photoKey", "case", "characters", "forHandle", "failedOverrides", "result"];

function cardStrings(c: { card: object }): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); };
  Object.values(c.card as Record<string, unknown>).forEach(walk);
  return out;
}

export function forbiddenFor(room: Room, viewer: "public" | "host" | Player, overrideCode = "swordfish"): Forbidden {
  const k = room.case;
  const revealed = room.phase === "reveal";
  const keys = new Set(ALWAYS_KEYS);
  const exact = new Set<string>();
  const fragments: { label: string; text: string }[] = [];
  const add = (label: string, text: string | undefined, min = 6) => { if (text && text.length >= min) fragments.push({ label, text }); };

  add("override code", overrideCode, 4);
  add("override hash", room.overrideHash, 8);
  add("override salt", room.overrideSalt, 4);
  for (const p of room.players) {
    add(`token of ${p.name}`, p.token, 8);
    add(`photo key of ${p.name}`, p.profile.photoKey, 4);
  }
  if (!k) return { keys, exact, fragments };

  const own = typeof viewer === "object" ? k.characters.find((c) => c.id === viewer.characterId) : undefined;
  const ownText = new Set(own ? cardStrings(own) : []);
  if (!revealed) add("truth story", k.truth.story, 12);
  Object.values(k.nudges).forEach((t) => add("nudge", t, 12));
  Object.values(k.advanced).forEach((t) => add("advanced", t, 12));
  for (const c of k.characters) {
    if (own && c.id === own.id) continue;
    for (const s of cardStrings(c)) if (s.length >= 12 && ![...ownText].some((o) => o.includes(s))) add(`card of ${c.id}`, s, 12);
  }
  const viewerIsKiller = typeof viewer === "object" && viewer.characterId === k.killerId;
  // While ballots are open the killer id is one of the legitimate suspect options.
  if (!viewerIsKiller && !room.ballotsOpen) exact.add(k.killerId);
  return { keys, exact, fragments };
}

/** Scans a JSON-serialisable view recursively. Returns human readable leaks (empty = clean). */
export function findLeaks(view: unknown, f: Forbidden): string[] {
  const wire = JSON.parse(JSON.stringify(view)) as unknown; // what a client actually receives
  const leaks: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (f.exact.has(v) && !path.startsWith("$.me.ballot")) leaks.push(`${path}: exact secret value ${JSON.stringify(v)}`);
      for (const fr of f.fragments) if (v.includes(fr.text)) leaks.push(`${path}: contains ${fr.label}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [key, val] of Object.entries(v)) {
        if (f.keys.has(key) && !(key === "killerId" && path.endsWith(".me.ballot"))) leaks.push(`${path}.${key}: forbidden field`);
        walk(val, `${path}.${key}`);
      }
    }
  };
  walk(wire, "$");
  return leaks;
}
