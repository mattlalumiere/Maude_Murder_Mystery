import { describe, expect, it } from "vitest";
import { TokenBucketLimiter, limiterKey, type RateRule } from "@/lib/security/rate-limit";

const rules = { state: { capacity: 5, refillPerSec: 1 }, join: { capacity: 2, refillPerSec: 0.5 } } satisfies Record<string, RateRule>;

function make(maxKeys = 1000) {
  let now = 1_000_000;
  const limiter = new TokenBucketLimiter(rules, { now: () => now, maxKeys });
  return { limiter, advance: (ms: number) => { now += ms; } };
}

describe("TokenBucketLimiter", () => {
  it("allows a burst up to capacity then denies", () => {
    const { limiter } = make();
    const results = Array.from({ length: 7 }, () => limiter.consume("g1", "state").allowed);
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });

  it("reports retryAfterMs until one token is available", () => {
    const { limiter } = make();
    for (let i = 0; i < 5; i++) limiter.consume("g1", "state");
    const d = limiter.consume("g1", "state");
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(1000);
  });

  it("refills over time and never above capacity", () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 5; i++) limiter.consume("g1", "state");
    advance(2000);
    expect(limiter.consume("g1", "state").allowed).toBe(true);
    expect(limiter.consume("g1", "state").allowed).toBe(true);
    expect(limiter.consume("g1", "state").allowed).toBe(false);
    advance(3_600_000);
    const burst = Array.from({ length: 8 }, () => limiter.consume("g1", "state").allowed).filter(Boolean).length;
    expect(burst).toBe(5);
  });

  it("isolates keys and route classes", () => {
    const { limiter } = make();
    for (let i = 0; i < 5; i++) limiter.consume("g1", "state");
    expect(limiter.consume("g1", "state").allowed).toBe(false);
    expect(limiter.consume("g2", "state").allowed).toBe(true);
    expect(limiter.consume("g1", "join").allowed).toBe(true);
  });

  it("supports weighted cost and refuses cost above capacity", () => {
    const { limiter } = make();
    expect(limiter.consume("g1", "state", 4).allowed).toBe(true);
    expect(limiter.consume("g1", "state", 2).allowed).toBe(false);
    expect(limiter.consume("g1", "state", 99).allowed).toBe(false);
  });

  it("a denied request does not consume tokens", () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 5; i++) limiter.consume("g1", "state");
    for (let i = 0; i < 100; i++) limiter.consume("g1", "state");
    advance(1000);
    expect(limiter.consume("g1", "state").allowed).toBe(true);
  });

  it("bounds memory: evicts the least recently used key beyond maxKeys", () => {
    const { limiter } = make(3);
    for (const k of ["a", "b", "c", "d", "e"]) limiter.consume(k, "state");
    expect(limiter.size()).toBeLessThanOrEqual(3);
  });

  it("fails open for unknown route classes is NOT allowed: unknown class throws", () => {
    const { limiter } = make();
    expect(() => limiter.consume("g1", "nope" as never)).toThrow();
  });

  it("limiterKey separates scopes so an IP cannot collide with a game id", () => {
    expect(limiterKey("ip", "1.2.3.4")).not.toBe(limiterKey("game", "1.2.3.4"));
  });

  it("sustained rate matches refill over a long window", () => {
    const { limiter, advance } = make();
    let allowed = 0;
    for (let t = 0; t < 100_000; t += 100) {
      advance(100);
      if (limiter.consume("g1", "state").allowed) allowed++;
    }
    // 100 s at 1 token/s plus the initial burst of 5
    expect(allowed).toBeGreaterThanOrEqual(100);
    expect(allowed).toBeLessThanOrEqual(106);
  });
});
