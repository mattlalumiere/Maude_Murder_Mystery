import { describe, expect, it } from "vitest";
import { allocateJoinCode, JOIN_ALPHABET, seededRandom } from "../../src/lib/ids";
import { saveResult } from "./sim/stats";

// Join code collisions and guessability with the REAL allocateJoinCode.
// Live games: 10,000 (goal) and 20,000 (activeGamesTarget in limits.md).

async function fill(live: number, lengths: number[] | undefined, seed: number) {
  const random = seededRandom(seed);
  const dir = new Set<string>();
  let lookups = 0, firstDrawCollisions = 0, creates = 0;
  const lenCount: Record<number, number> = {};
  let maxLookups = 0;
  for (let i = 0; i < live; i++) {
    let mine = 0; let first = true;
    const code = await allocateJoinCode(random, async (c) => {
      lookups++; mine++;
      const hit = dir.has(c);
      if (first) { if (hit) firstDrawCollisions++; first = false; }
      return hit;
    }, lengths ? { lengths } : {});
    maxLookups = Math.max(maxLookups, mine);
    dir.add(code); creates++;
    lenCount[code.length] = (lenCount[code.length] ?? 0) + 1;
  }
  // Attack: a stranger guesses random codes of the length they see. Hit rate = share of live games reached per guess.
  const guesses = 200_000;
  let hits = 0;
  const g = seededRandom(seed + 1);
  const L = (lengths ?? [4])[0];
  for (let i = 0; i < guesses; i++) {
    let c = ""; for (let k = 0; k < L; k++) c += JOIN_ALPHABET[g.int(JOIN_ALPHABET.length)];
    if (dir.has(c)) hits++;
  }
  return { live, lengths: lengths ?? "default(4,5,6)", firstDrawCollisionRate: firstDrawCollisions / creates, lookupsPerCreate: lookups / creates, maxLookups, lenCount, guessHitRate: hits / guesses, unique: dir.size };
}

const out: unknown[] = [];

describe("join code allocation at 10,000 live games", () => {
  it("never hands out a duplicate code (default allocator)", async () => {
    const r = await fill(10_000, undefined, 1); out.push(r);
    expect(r.unique).toBe(10_000);
  });

  it("measures 4 versus 6 characters at 10,000 and 20,000 live games (informational)", async () => {
    for (const live of [10_000, 20_000]) for (const lengths of [[4], [6]]) out.push(await fill(live, lengths, 3));
    saveResult("codes", out);
    console.table((out as any[]).map((o) => ({ ...o, lenCount: JSON.stringify(o.lenCount) })));
  }, 120_000);

  // SCALE-DEFECT K1 (documented by W10: limits.md joinCodeLength=6, to-W4-from-W10 item 4): engine still allocates
  // 4 character codes first, so a stranger guessing one code hits a live game about 1.2% of the time at 10,000 games.
  it.fails("allocates 6 character codes (limits.md joinCodeLength)", async () => {
    const random = seededRandom(9);
    const code = await allocateJoinCode(random, async () => false);
    expect(code.length).toBe(LIMITS_JOIN_CODE_LENGTH);
  });

  it.fails("a random single guess reaches a live game with probability below 0.1% at 10,000 live games", async () => {
    const r = await fill(10_000, undefined, 5);
    expect(r.guessHitRate).toBeLessThan(0.001);
  });

  it("6 character codes keep the guess hit rate below 0.01% and collisions below 0.1% at 20,000 live games", async () => {
    const r = await fill(20_000, [6], 5);
    expect(r.guessHitRate).toBeLessThan(0.0001);
    expect(r.firstDrawCollisionRate).toBeLessThan(0.001);
  });
});
import { LIMITS as SEC } from "../../src/lib/security/limits";
const LIMITS_JOIN_CODE_LENGTH = (SEC as unknown as { joinCodeLength: number }).joinCodeLength;
