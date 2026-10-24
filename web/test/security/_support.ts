// Shared helpers for the security suite (T3). Not a test file. No new dependencies.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------- seeded generator (mulberry32) ----------
export class Gen {
  private a: number;
  constructor(public readonly seed: number) { this.a = seed >>> 0; }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) { return Math.floor(this.next() * n); }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  str(alphabet: string, len: number) { let s = ""; for (let i = 0; i < len; i++) s += alphabet[this.int(alphabet.length)]; return s; }
  bool(p = 0.5) { return this.next() < p; }
}

export const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
export const alnumId = (g: Gen, n: number) => g.str(ALNUM, n);

/** Hostile fragments an attacker may splice into an id, name or key. */
export const EVIL_FRAGMENTS = [
  "..", "../", "..\\", "/..", "%2e%2e", "%2e%2e%2f", "%252e%252e%252f", "%2F", "%5c", "%00", "\0", "\u0000",
  ".", "./", "/", "//", "\\", "\n", "\r\n", " ", "\t", "?", "#", "*", ";", ":", "$", "`", "'", "\"",
  "‥", "․", "．．", "／", "İ", "K", "é", "é", "‮", "﻿", "​",
  "ǅ", "ß", "ﬃ", "٣", "Ａ", "ａ", "😀", "-", "_", "~", "con", "nul", "aux", "CON.", "a.", ".mime", ".tmp-1",
  "__proto__", "constructor", "null", "undefined", "%", "%%", "games", "local-0", "state", "photos", "gen",
];

export function evilString(g: Gen, base = "", maxParts = 4): string {
  const parts = 1 + g.int(maxParts);
  let s = base;
  for (let i = 0; i < parts; i++) {
    const r = g.int(5);
    if (r === 0) s += g.pick(EVIL_FRAGMENTS);
    else if (r === 1) s = g.pick(EVIL_FRAGMENTS) + s;
    else if (r === 2) s += g.str(ALNUM, 1 + g.int(6));
    else if (r === 3) s = s.toLowerCase() + g.pick(EVIL_FRAGMENTS);
    else s = s.slice(0, g.int(s.length + 1)) + g.pick(EVIL_FRAGMENTS) + s.slice(g.int(s.length + 1));
  }
  return s;
}

export async function tmpDir(prefix = "t3-") { return mkdtemp(join(tmpdir(), prefix)); }
export const rmDir = (d: string) => rm(d, { recursive: true, force: true });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wraps a thunk, returning "ok" with the value or "err" with the error. Never throws. */
export async function attempt<T>(fn: () => Promise<T> | T): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; }
}

import { expect, it } from "vitest";

/**
 * A test asserting the SECURE behaviour of a defect that still exists: it must FAIL today (vitest `it.fails`).
 * With T3_REVEAL=1 it runs as a plain `it`, so the real failure message of every known defect can be inspected
 * (this is how the suite proves each `.fails` fails for the right reason, see the report).
 */
export const knownDefect: typeof it.fails = (process.env.T3_REVEAL ? it : it.fails) as typeof it.fails;
/**
 * Like `it.fails` but the condition is evaluated when the test RUNS (for example "file adapter on a case insensitive
 * filesystem"). When the condition holds the body must fail; if it starts passing the test fails and the marker must go.
 */
export function itFailsWhen(cond: () => boolean, name: string, fn: () => Promise<void>, timeout?: number) {
  it(name, async () => {
    if (!cond() || process.env.T3_REVEAL) return fn();
    let failed = false;
    try { await fn(); } catch { failed = true; }
    expect(failed, "KNOWN-DEFECT no longer reproduces: remove the itFailsWhen marker").toBe(true);
  }, timeout);
}
