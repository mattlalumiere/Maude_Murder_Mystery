import assert from "node:assert/strict";
import type { Room } from "../../../src/lib/types";
import type { Res } from "./http";
import { cardText } from "./fixtures";

export const STATUS: Record<string, number[]> = {
  unauthorized: [401], "a bad request": [400], forbidden: [403], "not found": [404], "a conflict": [409], "too many requests": [429],
  "too large": [413], "an unsupported media type": [415], unprocessable: [422], unavailable: [503],
};

export function expectStatus(res: Res, label: string) {
  const ok = STATUS[label];
  assert.ok(ok, `unknown status label ${label}`);
  assert.ok(ok.includes(res.status), `expected ${label} (${ok.join("/")}) but got HTTP ${res.status}: ${res.text.slice(0, 200)}`);
}

export function errorCode(res: Res): string | undefined {
  const e = res.json?.error;
  return e && typeof e === "object" ? e.code : undefined;
}

export function expectErrorCode(res: Res, code: string) {
  const got = errorCode(res);
  assert.equal(got, code, `expected error code ${code} but the body was ${res.text.slice(0, 200)} (status ${res.status})`);
}

/** Walks any JSON value and yields [path, key, value] for every property and array item. */
export function walk(v: unknown, fn: (path: string, key: string, val: unknown) => void, path = "$") {
  if (Array.isArray(v)) v.forEach((x, i) => { fn(`${path}[${i}]`, String(i), x); walk(x, fn, `${path}[${i}]`); });
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { fn(`${path}.${k}`, k, x); walk(x, fn, `${path}.${k}`); }
}

export function containsKey(v: unknown, keys: string[], allow: (path: string) => boolean = () => false): string[] {
  const hits: string[] = [];
  walk(v, (path, key) => { if (keys.includes(key) && !allow(path)) hits.push(path); });
  return hits;
}

export function stringsAt(v: unknown): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  walk(v, (path, _k, val) => { if (typeof val === "string") out.push({ path, value: val }); });
  return out;
}

export function strings(v: unknown): string[] {
  const out: string[] = [];
  walk(v, (_p, _k, val) => { if (typeof val === "string") out.push(val); });
  if (typeof v === "string") out.push(v);
  return out;
}

export type Truth = "killer" | "method" | "motive" | "story" | "hints" | "override";

/**
 * Looks for the solution in a client view. Ids of options legitimately appear in the ballot options while
 * ballots are open, so identifying a value as "the truth" is done by field name (killerId, truth, result...)
 * and by the exact text of the long truth fields, never by an option id alone.
 */
export function truthLeaks(view: unknown, room: Room, which: Truth[], opts: { ownBallotOk?: boolean } = {}): string[] {
  const k = room.case!;
  const leaks: string[] = [];
  const allowKillerKey = (path: string) => !!opts.ownBallotOk && path.includes(".me.ballot");
  if (which.includes("killer")) {
    for (const p of containsKey(view, ["killerId", "killer"], allowKillerKey)) leaks.push(`${p}: killer field`);
    // A player's own character id is their own business (the killer's view names their own character).
    if (!room.ballotsOpen) for (const { path, value } of stringsAt(view)) if (value === k.killerId && !path.endsWith(".me.character.id")) leaks.push(`${path}: exact killer id "${value}"`);
  }
  if (which.includes("method")) {
    for (const p of containsKey(view, ["methodId", "truth", "result"], (path) => !!opts.ownBallotOk && path.includes(".me.ballot"))) leaks.push(`${p}: method truth field`);
    if (!room.ballotsOpen) for (const s of strings(view)) if (s === k.truth.methodId) leaks.push(`exact method id "${s}"`);
  }
  if (which.includes("motive")) {
    for (const p of containsKey(view, ["motiveId", "truth", "result"], (path) => !!opts.ownBallotOk && path.includes(".me.ballot"))) leaks.push(`${p}: motive truth field`);
    if (!room.ballotsOpen) for (const s of strings(view)) if (s === k.truth.motiveId) leaks.push(`exact motive id "${s}"`);
  }
  if (which.includes("story")) {
    const frag = k.truth.story.slice(0, 40);
    for (const s of strings(view)) if (s.includes(frag)) leaks.push(`true story text`);
  }
  if (which.includes("hints")) {
    for (const p of containsKey(view, ["nudges", "advanced"])) leaks.push(`${p}: hint field`);
    const hints = [...Object.values(k.nudges), ...Object.values(k.advanced)].filter((t): t is string => !!t);
    for (const s of strings(view)) for (const h of hints) if (s.includes(h)) leaks.push(`hint text "${h.slice(0, 30)}"`);
  }
  if (which.includes("override")) {
    for (const p of containsKey(view, ["overrideHash", "overrideSalt", "overrideCode"])) leaks.push(`${p}: override field`);
    for (const s of strings(view)) { if (room.overrideHash && s.includes(room.overrideHash)) leaks.push("override hash"); if (room.overrideSalt && s.includes(room.overrideSalt)) leaks.push("override salt"); }
  }
  return leaks;
}

/** Card strings of every character except the one given (or none), long enough to be distinctive. */
export function otherCards(room: Room, exceptCharacterId?: string): string[] {
  const out: string[] = [];
  for (const c of room.case!.characters) {
    if (c.id === exceptCharacterId) continue;
    for (const s of cardText(c as any)) if (s.length >= 14) out.push(s);
  }
  return out;
}

export function ownCardStrings(room: Room, characterId?: string): Set<string> {
  const c = room.case!.characters.find((x) => x.id === characterId);
  return new Set(c ? cardText(c as any) : []);
}

export const FORBIDDEN_STACK = /\bat .*\(.*:\d+:\d+\)|node_modules|ECONN|\.ts:\d+/;
