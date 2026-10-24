import { describe, expect, it } from "vitest";
import { AiBadOutputError, AiRateLimitedError, AiTimeoutError, AiUnavailableError, type TextModel, type TextRequest, type TextResult } from "@/lib/ai/ports";
import { createGateway, type GatewayOptions } from "@/lib/ai/gateway";

const ok = (text = "ok", i = 10, o = 20): TextResult => ({ text, usage: { inputTokens: i, outputTokens: o }, model: "stub", finishReason: "stop", latencyMs: 1 });

/** A stub model whose calls are resolved by the test. */
function controlled() {
  const pending: { req: TextRequest; resolve: (r: TextResult) => void; reject: (e: unknown) => void }[] = [];
  let inFlight = 0, max = 0, calls = 0;
  const model: TextModel = {
    id: "stub",
    generate: (req) => new Promise((resolve, reject) => {
      calls++; inFlight++; max = Math.max(max, inFlight);
      pending.push({
        req,
        resolve: (r) => { inFlight--; resolve(r); },
        reject: (e) => { inFlight--; reject(e); },
      });
    }),
  };
  return { model, pending, get max() { return max; }, get calls() { return calls; } };
}

const scripted = (steps: (() => TextResult | never)[]) => {
  let i = 0;
  const calls = { n: 0 };
  const model: TextModel = { id: "scripted", generate: async () => { calls.n++; return steps[Math.min(i++, steps.length - 1)](); } };
  return { model, calls };
};
const boom = (e: Error) => () => { throw e; };

const fast = (over: Partial<GatewayOptions> = {}): GatewayOptions => ({
  maxConcurrent: 2, maxQueue: 3, maxRetries: 0, backoffBaseMs: 1, backoffMaxMs: 2, timeoutMs: 1000,
  breakerFailures: 3, breakerCooldownMs: 1000, sleep: async () => {}, random: () => 0.5,
  ...over,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("gateway concurrency and backpressure", () => {
  it("never runs more than maxConcurrent calls at once and drains the queue in order", async () => {
    const c = controlled();
    const gw = createGateway(c.model, fast());
    const ps = [1, 2, 3, 4, 5].map((n) => gw.generate({ user: String(n) }));
    await tick();
    expect(c.pending.length).toBe(2);
    expect(gw.status().queued).toBe(3);
    while (c.pending.length) { c.pending.shift()!.resolve(ok()); await tick(); }
    await Promise.all(ps);
    expect(c.max).toBe(2);
    expect(c.calls).toBe(5);
    expect(gw.status().inFlight).toBe(0);
    expect(gw.status().queued).toBe(0);
  });

  it("rejects with RateLimited(queue_full) once the queue is at max depth", async () => {
    const c = controlled();
    const gw = createGateway(c.model, fast());
    const ps = Array.from({ length: 5 }, () => gw.generate({ user: "x" }));
    ps.forEach((p) => p.catch(() => {}));
    await tick();
    const err = await gw.generate({ user: "overflow" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRateLimitedError);
    expect(err.reason).toBe("queue_full");
    expect(gw.status().queued).toBe(3);
    expect(gw.status().rejected).toBe(1);
  });

  it("removes a queued waiter whose deadline passes (no leak)", async () => {
    const c = controlled();
    const gw = createGateway(c.model, fast({ maxConcurrent: 1, timeoutMs: 30 }));
    const a = gw.generate({ user: "a" }); a.catch(() => {});
    const b = gw.generate({ user: "b" });
    await expect(b).rejects.toBeInstanceOf(AiTimeoutError);
    expect(gw.status().queued).toBe(0);
    c.pending[0]?.resolve(ok());
  });

  it("enforces a total timeout even if the adapter ignores the abort signal", async () => {
    const c = controlled();
    const gw = createGateway(c.model, fast({ timeoutMs: 40 }));
    const t = Date.now();
    await expect(gw.generate({ user: "x" })).rejects.toBeInstanceOf(AiTimeoutError);
    expect(Date.now() - t).toBeLessThan(500);
    expect(gw.status().inFlight).toBe(0);
  });

  it("passes an abort signal that fires at the deadline", async () => {
    let aborted = false;
    const model: TextModel = { id: "s", generate: (r) => new Promise((_, rej) => { r.signal!.addEventListener("abort", () => { aborted = true; rej(new Error("x")); }); }) };
    const gw = createGateway(model, fast({ timeoutMs: 30 }));
    await expect(gw.generate({ user: "x" })).rejects.toBeInstanceOf(AiTimeoutError);
    expect(aborted).toBe(true);
  });
});

describe("gateway retries", () => {
  it("retries retryable failures up to maxRetries with jittered backoff, then succeeds", async () => {
    const sleeps: number[] = [];
    const s = scripted([boom(new AiUnavailableError("http", "500")), boom(new AiRateLimitedError("upstream", "429")), () => ok("fine")]);
    const gw = createGateway(s.model, fast({ maxRetries: 2, backoffBaseMs: 100, backoffMaxMs: 10_000, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5 }));
    expect((await gw.generate({ user: "x" })).text).toBe("fine");
    expect(s.calls.n).toBe(3);
    expect(sleeps.length).toBe(2);
    // full jitter: random() * base * 2^attempt
    expect(sleeps).toEqual([50, 100]);
  });

  it("does not retry BadOutput and gives up after the retry budget", async () => {
    const s = scripted([boom(new AiBadOutputError("junk"))]);
    const gw = createGateway(s.model, fast({ maxRetries: 3 }));
    await expect(gw.generate({ user: "x" })).rejects.toBeInstanceOf(AiBadOutputError);
    expect(s.calls.n).toBe(1);
    const s2 = scripted([boom(new AiUnavailableError("http", "500"))]);
    const gw2 = createGateway(s2.model, fast({ maxRetries: 2, breakerFailures: 99 }));
    await expect(gw2.generate({ user: "x" })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(s2.calls.n).toBe(3);
  });
});

describe("gateway circuit breaker", () => {
  it("opens after N consecutive failures and fails fast without calling the model", async () => {
    const s = scripted([boom(new AiUnavailableError("network", "down"))]);
    let now = 0;
    const gw = createGateway(s.model, fast({ now: () => now }));
    for (let i = 0; i < 3; i++) await gw.generate({ user: "x" }).catch(() => {});
    expect(gw.status().breaker).toBe("open");
    expect(s.calls.n).toBe(3);
    const err = await gw.generate({ user: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err.reason).toBe("circuit_open");
    expect(s.calls.n).toBe(3);
  });

  it("goes half-open after the cooldown, allows one probe, closes on success", async () => {
    let fail = true;
    const model: TextModel = { id: "m", generate: async () => { if (fail) throw new AiUnavailableError("network", "down"); return ok(); } };
    let now = 0;
    const gw = createGateway(model, fast({ now: () => now }));
    for (let i = 0; i < 3; i++) await gw.generate({ user: "x" }).catch(() => {});
    expect(gw.status().breaker).toBe("open");
    now += 999;
    expect((await gw.generate({ user: "x" }).catch((e) => e)).reason).toBe("circuit_open");
    now += 2;
    fail = false;
    await gw.generate({ user: "probe" });
    expect(gw.status().breaker).toBe("closed");
    expect(gw.status().consecutiveFailures).toBe(0);
  });

  it("re-opens when the half-open probe fails, and admits only one probe at a time", async () => {
    let now = 0;
    const c = controlled();
    const gw = createGateway(c.model, fast({ now: () => now, maxQueue: 5 }));
    for (let i = 0; i < 3; i++) {
      const p = gw.generate({ user: "x" }).catch(() => {});
      await tick(); c.pending.shift()!.reject(new AiUnavailableError("network", "down")); await p;
    }
    expect(gw.status().breaker).toBe("open");
    now += 1001;
    const probe = gw.generate({ user: "probe" }).catch((e) => e);
    await tick();
    expect(gw.status().breaker).toBe("half-open");
    const second = await gw.generate({ user: "second" }).catch((e) => e);
    expect(second.reason).toBe("circuit_open");
    expect(c.pending.length).toBe(1);
    c.pending.shift()!.reject(new AiTimeoutError("slow"));
    await probe;
    expect(gw.status().breaker).toBe("open");
  });

  it("does not count BadOutput or backpressure as breaker failures", async () => {
    const s = scripted([boom(new AiBadOutputError("junk"))]);
    const gw = createGateway(s.model, fast());
    for (let i = 0; i < 10; i++) await gw.generate({ user: "x" }).catch(() => {});
    expect(gw.status().breaker).toBe("closed");
  });

  it("a success resets the consecutive failure count", async () => {
    const s = scripted([boom(new AiUnavailableError("http", "x")), boom(new AiUnavailableError("http", "x")), () => ok(), boom(new AiUnavailableError("http", "x")), boom(new AiUnavailableError("http", "x"))]);
    const gw = createGateway(s.model, fast());
    for (let i = 0; i < 5; i++) await gw.generate({ user: "x" }).catch(() => {});
    expect(gw.status().breaker).toBe("closed");
  });
});

describe("gateway budgets and memory", () => {
  it("enforces a per game request budget but not for other games", async () => {
    const s = scripted([() => ok()]);
    const gw = createGateway(s.model, fast({ perGame: { maxRequests: 2, maxTokens: 1e9 } }));
    await gw.generate({ user: "x", gameId: "G1" });
    await gw.generate({ user: "x", gameId: "G1" });
    const err = await gw.generate({ user: "x", gameId: "G1" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRateLimitedError);
    expect(err.reason).toBe("game_budget");
    await gw.generate({ user: "x", gameId: "G2" });
    expect(s.calls.n).toBe(3);
  });

  it("enforces a per game token budget using actual usage", async () => {
    const s = scripted([() => ok("a", 400, 400)]);
    const gw = createGateway(s.model, fast({ perGame: { maxRequests: 99, maxTokens: 1000 } }));
    await gw.generate({ user: "hi", gameId: "G", maxOutputTokens: 100 });
    expect(gw.gameUsage("G").tokens).toBe(800);
    const err = await gw.generate({ user: "hi", gameId: "G", maxOutputTokens: 900 }).catch((e) => e);
    expect(err.reason).toBe("game_budget");
  });

  it("enforces a global rolling window budget that resets with time", async () => {
    const s = scripted([() => ok()]);
    let now = 0;
    const gw = createGateway(s.model, fast({ now: () => now, global: { maxRequests: 2, maxTokens: 1e9, windowMs: 1000 } }));
    await gw.generate({ user: "x" }); await gw.generate({ user: "x" });
    expect((await gw.generate({ user: "x" }).catch((e) => e)).reason).toBe("global_budget");
    now += 1001;
    await gw.generate({ user: "x" });
  });

  it("failed calls refund the token reservation but still count the request", async () => {
    const s = scripted([boom(new AiBadOutputError("x"))]);
    const gw = createGateway(s.model, fast({ perGame: { maxRequests: 99, maxTokens: 1000 } }));
    await gw.generate({ user: "x", gameId: "G", maxOutputTokens: 500 }).catch(() => {});
    expect(gw.gameUsage("G")).toEqual({ requests: 1, tokens: 0 });
  });

  it("bounds the number of tracked games (no unbounded memory)", async () => {
    const s = scripted([() => ok()]);
    const gw = createGateway(s.model, fast({ maxTrackedGames: 50 }));
    for (let i = 0; i < 500; i++) await gw.generate({ user: "x", gameId: `G${i}` });
    expect(gw.status().trackedGames).toBeLessThanOrEqual(50);
    expect(gw.gameUsage("G499").requests).toBe(1);
  });

  it("releaseGame forgets a game's counters", async () => {
    const gw = createGateway(scripted([() => ok()]).model, fast());
    await gw.generate({ user: "x", gameId: "G" });
    gw.releaseGame("G");
    expect(gw.gameUsage("G")).toEqual({ requests: 0, tokens: 0 });
  });
});
