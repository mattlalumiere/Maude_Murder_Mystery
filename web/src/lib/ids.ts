import { randomBytes, randomInt } from "node:crypto";

// ---------- ports: Clock, Random, Ids ----------
export interface Clock { now(): number }
export interface Random {
  /** Uniform in [0, 1). */
  float(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  bytes(n: number): Uint8Array;
}
export interface Ids { gameId(): string }

export const systemClock: Clock = { now: () => Date.now() };

export const systemRandom: Random = {
  float: () => randomInt(0, 2 ** 48) / 2 ** 48,
  int: (n) => randomInt(0, Math.max(1, Math.floor(n))),
  bytes: (n) => new Uint8Array(randomBytes(n)),
};

/** Deterministic generator (mulberry32) for tests and simulations. Not for secrets. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int: (n) => Math.floor(next() * Math.max(1, Math.floor(n))),
    bytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(next() * 256)),
  };
}

// ---------- ULID (26 chars, Crockford base32, time sortable) ----------
const ULID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const isUlid = (s: unknown): s is string => typeof s === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(s);

export function makeUlid(timeMs: number, random: Random): string {
  let t = Math.max(0, Math.floor(timeMs));
  let time = "";
  for (let i = 0; i < 10; i++) { time = ULID_CHARS[t % 32] + time; t = Math.floor(t / 32); }
  let rnd = "";
  for (let i = 0; i < 16; i++) rnd += ULID_CHARS[random.int(32)];
  return time + rnd;
}

export const makeIds = (clock: Clock, random: Random): Ids => ({ gameId: () => makeUlid(clock.now(), random) });

// ---------- short join codes ----------
/** No I, L, O, U, 0 or 1: nothing that is misread when read aloud or typed on a phone. */
export const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const randomJoinCode = (random: Random, length: number) =>
  Array.from({ length }, () => JOIN_ALPHABET[random.int(JOIN_ALPHABET.length)]).join("");

/**
 * Picks a code the directory does not know yet. Tries 4 characters, then 5, then 6, so a crowded
 * directory degrades gracefully instead of failing.
 */
export async function allocateJoinCode(
  random: Random, codeExists: (code: string) => Promise<boolean>, opts: { attemptsPerLength?: number; lengths?: number[] } = {},
): Promise<string> {
  const attempts = opts.attemptsPerLength ?? 20;
  for (const length of opts.lengths ?? [4, 5, 6]) {
    for (let i = 0; i < attempts; i++) {
      const code = randomJoinCode(random, length);
      if (!(await codeExists(code))) return code;
    }
  }
  throw new Error("Could not allocate a join code");
}

// ---------- engine runtime (injectable for tests) ----------
export interface EngineRuntime { clock: Clock; random: Random; ids: Ids }

const defaults = (): EngineRuntime => ({ clock: systemClock, random: systemRandom, ids: makeIds(systemClock, systemRandom) });
let runtime: EngineRuntime = defaults();

export const getRuntime = (): EngineRuntime => runtime;

/**
 * Replaces parts of the runtime. If `clock` or `random` change and `ids` is not given, ids are rebuilt
 * on top of them. Returns a function that restores the previous runtime.
 */
export function setRuntime(patch: Partial<EngineRuntime>): () => void {
  const prev = runtime;
  const clock = patch.clock ?? prev.clock;
  const random = patch.random ?? prev.random;
  runtime = { clock, random, ids: patch.ids ?? (patch.clock || patch.random ? makeIds(clock, random) : prev.ids) };
  return () => { runtime = prev; };
}
