import { describe, expect, it } from "vitest";
import { allocateJoinCode, isUlid, JOIN_ALPHABET, makeIds, makeUlid, seededRandom, systemClock, systemRandom } from "../../../src/lib/ids";
import { ManualClock } from "./helpers/runtime";

describe("ulid", () => {
  it("is 26 chars of Crockford base32 and passes isUlid", () => {
    const id = makeUlid(Date.UTC(2026, 0, 1), seededRandom(7));
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
    expect(isUlid("not-a-ulid")).toBe(false);
    expect(isUlid(id.toLowerCase())).toBe(false);
  });
  it("is deterministic with an injected clock and random", () => {
    const a = makeIds(new ManualClock(5000), seededRandom(3)).gameId();
    const b = makeIds(new ManualClock(5000), seededRandom(3)).gameId();
    expect(a).toBe(b);
  });
  it("sorts by time", () => {
    const r = seededRandom(1);
    expect(makeUlid(1000, r) < makeUlid(2_000_000, r)).toBe(true);
  });
  it("is unique over many ids with the system generators", () => {
    const ids = makeIds(systemClock, systemRandom);
    const s = new Set(Array.from({ length: 2000 }, () => ids.gameId()));
    expect(s.size).toBe(2000);
  });
});

describe("join codes", () => {
  it("uses an unambiguous alphabet", () => {
    for (const bad of "ILOU01") expect(JOIN_ALPHABET).not.toContain(bad);
    expect(new Set(JOIN_ALPHABET).size).toBe(JOIN_ALPHABET.length);
  });
  it("is 4 chars by default and only uses the alphabet", async () => {
    const code = await allocateJoinCode(seededRandom(2), async () => false);
    expect(code).toMatch(new RegExp(`^[${JOIN_ALPHABET}]{4}$`));
  });
  it("avoids codes the directory already has", async () => {
    const r = seededRandom(9);
    const first = await allocateJoinCode(seededRandom(9), async () => false);
    const code = await allocateJoinCode(r, async (c) => c === first);
    expect(code).not.toBe(first);
  });
  it("grows to 5 then 6 chars when the short space is exhausted", async () => {
    const c5 = await allocateJoinCode(seededRandom(1), async (c) => c.length < 5);
    expect(c5).toHaveLength(5);
    const c6 = await allocateJoinCode(seededRandom(1), async (c) => c.length < 6);
    expect(c6).toHaveLength(6);
  });
  it("throws when everything collides", async () => {
    await expect(allocateJoinCode(seededRandom(1), async () => true)).rejects.toThrow(/allocate/i);
  });
});

describe("seededRandom", () => {
  it("repeats for equal seeds and stays in range", () => {
    const a = seededRandom(5), b = seededRandom(5);
    for (let i = 0; i < 50; i++) { const x = a.float(); expect(x).toBe(b.float()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    expect(seededRandom(5).bytes(8)).toHaveLength(8);
    for (let i = 0; i < 100; i++) expect(a.int(7)).toBeLessThan(7);
  });
});
