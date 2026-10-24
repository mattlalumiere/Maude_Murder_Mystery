import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", async () => await import("./sim/auth-mock"));
import { getAiConfig, getTextModel, readAiConfig, resetAiState } from "../../src/lib/ai/config";
import { SAMPLE_CASE } from "../../src/lib/sample-case";
import { api } from "./sim/api";
import { setupEnv, type SimEnv } from "./sim/env";
import { startFakeLlm, type FakeLlm } from "./sim/fake-llm";
import { seedGame, type SeededGame } from "./sim/seed-games";
import { saveResult, fmt } from "./sim/stats";

// AI path under load. The model is a fake with the real model's speed (prefill 300 tok/s, decode 40 tok/s,
// 8,000 output tokens = about 210 s per case) compressed by SPEEDUP so a 3.5 minute case takes about 2 s.
// The gateway, circuit breaker, queue, deadlines and startGame are the REAL code, configured with the REAL defaults
// divided by SPEEDUP (AI_CASE_TIMEOUT_MS 300000 -> 3000, breaker cooldown 30000 -> 300, ...).
const SPEEDUP = Number(process.env.SCALE_AI_SPEEDUP ?? 100);
const results: Record<string, unknown> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let env: SimEnv | undefined;
let llm: FakeLlm | undefined;
afterEach(async () => { await llm?.close(); env?.teardown(); llm = undefined; env = undefined; });

async function aiSetup(o: { mode: "serial" | "shared"; gain?: number; cancel?: boolean; envExtra?: Record<string, string>; defaultsScaled?: boolean }) {
  llm = await startFakeLlm({ speedup: SPEEDUP, mode: o.mode, gain: o.gain ?? 1, cancelOnDisconnect: o.cancel ?? true, content: JSON.stringify(SAMPLE_CASE) });
  env = setupEnv({
    store: "memory",
    env: {
      AI_TEXT_ADAPTER: "openai-compatible", AI_BASE_URL: llm.baseUrl, AI_MODEL: "fake",
      AI_CASE_TIMEOUT_MS: String(Math.round(300_000 / SPEEDUP)), AI_TIMEOUT_MS: String(Math.round(60_000 / SPEEDUP)),
      AI_BREAKER_COOLDOWN_MS: String(Math.round(30_000 / SPEEDUP)),
      // Isolate queue and deadline behaviour from the per minute budget window (which cannot be compressed); tested separately.
      AI_GLOBAL_REQUESTS_PER_MIN: "1000000", AI_GLOBAL_TOKENS_PER_MIN: "1000000000",
      ...o.envExtra,
    },
  });
  resetAiState();
  return { env, llm };
}

interface Outcome { k: number; status: number; virtualSec: number; source: string; atVirtualSec: number }

async function startAll(games: SeededGame[], arrivalsVirtualSec: number[]): Promise<Outcome[]> {
  const t0 = Date.now();
  const out: Outcome[] = [];
  await Promise.all(games.map(async (g, k) => {
    await sleep(Math.max(0, (arrivalsVirtualSec[k] / SPEEDUP) * 1000 - (Date.now() - t0)));
    const s = Date.now();
    const r = await api.action(g.code, { type: "start" }, { host: g.host });
    const room = await env!.raw.get(g.code);
    out.push({ k, status: r.status, virtualSec: ((Date.now() - s) / 1000) * SPEEDUP, source: room?.caseSource ?? "none", atVirtualSec: arrivalsVirtualSec[k] });
  }));
  return out.sort((a, b) => a.k - b.k);
}
const lobbies = async (n: number) => { const gs: SeededGame[] = []; for (let i = 0; i < n; i++) gs.push(await seedGame(i, { start: false })); return gs; };
const summarise = (o: Outcome[]) => {
  const model = o.filter((x) => x.source === "bedrock"), fallback = o.filter((x) => x.source === "sample");
  const lat = o.map((x) => x.virtualSec).sort((a, b) => a - b);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
  return { n: o.length, non200: o.filter((x) => x.status !== 200).length, modelCases: model.length, fallbacks: fallback.length, fallbackRate: fallback.length / o.length,
    startP50: q(0.5), startP95: q(0.95), startMax: lat[lat.length - 1], firstCaseAtSec: model.length ? Math.min(...model.map((x) => x.atVirtualSec + x.virtualSec)) : null,
    modelCaseSecs: model.map((x) => Math.round(x.virtualSec)).sort((a, b) => a - b) };
};

describe("configuration against the non functional targets", () => {
  // SCALE-DEFECT A2 (documented deviation, to-W1-from-W5): NF-7 says start returns within 62 s; case generation has a 300 s deadline.
  it.fails("NF-7: case generation deadline is at most 60 s so start returns within 62 s", () => {
    expect(readAiConfig({}).caseTimeoutMs).toBeLessThanOrEqual(60_000);
  });
  // SCALE-DEFECT A5 (documented defaults, ai/README.md): NF-9 says 3 in flight and queue depth 50; defaults are 2 and 8.
  it.fails("NF-9: AI concurrency 3 and queue depth 50 by default", () => {
    const c = readAiConfig({});
    expect(c.maxConcurrent).toBe(3);
    expect(c.maxQueue).toBe(50);
  });
  it("NF-8: breaker opens after 3 consecutive failures for 30 s, one retry only", () => {
    const c = readAiConfig({});
    expect(c.breakerFailures).toBe(3);
    expect(c.breakerCooldownMs).toBe(30_000);
    expect(c.maxRetries).toBe(1);
  });
});

describe(`one model, speedup x${SPEEDUP}`, () => {
  it("a single start gets a real case in about 210 s of model time (control)", async () => {
    await aiSetup({ mode: "serial" });
    const [g] = await lobbies(1);
    const o = await startAll([g], [0]);
    const s = summarise(o); results.single = s;
    expect(o[0].status).toBe(200);
    expect(o[0].source).toBe("bedrock");
    expect(o[0].virtualSec).toBeGreaterThan(150);
    expect(o[0].virtualSec).toBeLessThan(300);
  }, 60_000);

  // SCALE-DEFECT A1: startGame runs inside mutate(). While the host waits minutes for the model, any other write to the
  // game (a late join, a ready tap) bumps the version, the final put fails, mutate retries and startGame calls the model AGAIN.
  it("A1: a player tapping ready during generation does not trigger a second model call", async () => {
    await aiSetup({ mode: "serial" });
    const [g] = await lobbies(1);
    const startP = api.action(g.code, { type: "start" }, { host: g.host });
    await sleep(500); // 50 s of model time later
    const p = g.players[0];
    const r = await api.action(g.code, { type: "ready" }, { pid: p.pid, token: p.token });
    expect(r.status).toBe(200);
    const res = await startP;
    results.doubleGeneration = { modelCalls: llm!.stats.received, startStatus: res.status };
    expect(llm!.stats.received).toBe(1);
  }, 120_000);

  it("A1b: a late joiner during generation is not lost and does not break start", async () => {
    await aiSetup({ mode: "serial" });
    const [g] = await lobbies(1);
    const startP = api.action(g.code, { type: "start" }, { host: g.host });
    await sleep(300);
    const j = await api.join(g.code, { name: "Latecomer-g0", ageGroup: "adult" });
    const res = await startP;
    const room = await env!.raw.get(g.code);
    expect([200, 409]).toContain(j.status);
    expect(res.status).toBe(200);
    if (j.status === 200) expect(room!.players.some((p) => p.name === "Latecomer-g0")).toBe(true);
  }, 120_000);

  for (const K of [3, 11, 60]) {
    it(`burst of ${K} simultaneous starts (serial server): measures queue, fallbacks, time to first case`, async () => {
      await aiSetup({ mode: "serial" });
      const gs = await lobbies(K);
      const status0 = getTextModel()!.status();
      void status0;
      let maxQ = 0, maxIn = 0;
      const poller = setInterval(() => { const s = getTextModel()?.status(); if (s) { maxQ = Math.max(maxQ, s.queued); maxIn = Math.max(maxIn, s.inFlight); } }, 5);
      const o = await startAll(gs, gs.map(() => 0));
      clearInterval(poller);
      const st = getTextModel()!.status();
      const s = { ...summarise(o), maxQueued: maxQ, maxInFlight: maxIn, gateway: { rejected: st.rejected, breaker: st.breaker, totals: st.totals }, model: llm!.stats };
      results[`burst-serial-${K}`] = s;
      console.log(`burst ${K}:`, JSON.stringify({ ...s, modelCaseSecs: s.modelCaseSecs.slice(0, 5) }));
      // NF-17: no failed player facing request, whatever the AI does.
      expect(s.non200).toBe(0);
      // Backpressure: nobody beyond concurrency + queue may wait for a slot; the overflow degrades at once.
      if (K > getAiConfig().maxConcurrent + getAiConfig().maxQueue) {
        const fast = o.filter((x) => x.source === "sample" && x.virtualSec < 10).length;
        expect(fast).toBeGreaterThanOrEqual(K - (getAiConfig().maxConcurrent + getAiConfig().maxQueue));
      }
    }, 120_000);
  }

  it("burst of 11 on a shared (continuous batching, gain 1) server", async () => {
    await aiSetup({ mode: "shared", gain: 1 });
    const gs = await lobbies(11);
    const o = await startAll(gs, gs.map(() => 0));
    results["burst-shared-11"] = { ...summarise(o), model: llm!.stats };
    expect(summarise(o).non200).toBe(0);
  }, 120_000);

  // Goodput: arrivals at lambda per hour for one virtual hour against a model that can finish 17 cases per hour.
  // A healthy queue serves about 17 per hour whatever the load; congestion collapse serves far fewer.
  for (const [mode, lambda] of [["serial", 17], ["serial", 60], ["shared", 60]] as const) {
    it(`goodput at ${lambda} starts per hour (${mode} server)`, async () => {
      await aiSetup({ mode, gain: 1 });
      const hours = 1;
      const n = Math.round(lambda * hours);
      const gs = await lobbies(n);
      // deterministic Poisson-like arrivals (exponential gaps, seeded)
      let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      let t = 0; const at: number[] = [];
      for (let i = 0; i < n; i++) { t += (-Math.log(1 - rnd()) * 3600) / lambda; at.push(Math.min(t, 3600 * hours)); }
      const o = await startAll(gs, at);
      const s = summarise(o);
      const finishHour = Math.max(...o.map((x) => x.atVirtualSec + x.virtualSec)) / 3600;
      const r = { lambda, mode, ...s, modelCasesPerHour: s.modelCases / Math.max(hours, finishHour), idealPerHour: 3600 / 210, wastedModelSec: llm!.stats.wastedModelSec, busyModelSec: llm!.stats.busyModelSec, aborted: llm!.stats.abortedWhileRunning + llm!.stats.abortedWhileQueued };
      results[`goodput-${mode}-${lambda}`] = r;
      console.log(`goodput ${mode} ${lambda}/h:`, JSON.stringify({ ...r, modelCaseSecs: undefined }));
      expect(s.non200).toBe(0);
      // SCALE-DEFECT A4 (new): under overload the model must still produce at least half of its ideal 17 cases per hour.
      if (lambda >= 60) expect(r.modelCasesPerHour).toBeGreaterThanOrEqual(0.5 * r.idealPerHour);
    }, 300_000);
  }
});

describe("failure behaviour of the AI path", () => {
  it("AI down (HTTP 500): breaker opens after 3 failures, every start still succeeds with the sample case, later starts are instant", async () => {
    await aiSetup({ mode: "serial" });
    llm!.setFail("500");
    const gs = await lobbies(8);
    // sequential so the breaker state is observable per start
    const lat: number[] = [], src: string[] = [];
    for (const g of gs) {
      const t = Date.now();
      const r = await api.action(g.code, { type: "start" }, { host: g.host });
      expect(r.status).toBe(200);
      lat.push(Date.now() - t); src.push((await env!.raw.get(g.code))!.caseSource ?? "");
    }
    const st = getTextModel()!.status();
    results.aiDown = { startMs: lat, sources: src, breaker: st.breaker, modelCallsMade: llm!.stats.received };
    expect(src.every((x) => x === "sample")).toBe(true);
    expect(st.breaker).toBe("open");
    // once open, no further calls reach the model and starts take well under 100 ms
    expect(llm!.stats.received).toBeLessThanOrEqual(8); // 3 failures x (1 + 1 retry) = 6 at most before the breaker opens
    expect(lat.slice(-3).every((x) => x < 100)).toBe(true);
  }, 60_000);

  it("AI recovers: after the cooldown a probe succeeds, the breaker closes and the next start gets a model case", async () => {
    await aiSetup({ mode: "serial" });
    llm!.setFail("500");
    const gs = await lobbies(6);
    for (const g of gs.slice(0, 4)) await api.action(g.code, { type: "start" }, { host: g.host });
    expect(getTextModel()!.status().breaker).toBe("open");
    llm!.setFail(null);
    await sleep(Math.round(30_000 / SPEEDUP) + 100);
    const r = await api.action(gs[4].code, { type: "start" }, { host: gs[4].host });
    expect(r.status).toBe(200);
    expect((await env!.raw.get(gs[4].code))!.caseSource).toBe("bedrock");
    expect(getTextModel()!.status().breaker).toBe("closed");
  }, 60_000);

  it("a hung model (connection dropped mid call) degrades to the sample case, never a 5xx", async () => {
    await aiSetup({ mode: "serial" });
    llm!.setFail("drop");
    const [g] = await lobbies(1);
    const r = await api.action(g.code, { type: "start" }, { host: g.host });
    expect(r.status).toBe(200);
    expect((await env!.raw.get(g.code))!.caseSource).toBe("sample");
  }, 60_000);

  // SCALE-DEFECT A3 (new): a flood of rejected starts (queue_full) consumes the per minute global request window
  // (admit() counts a request before the queue check), so once the flood is over the idle model is still refused
  // with global_budget until the minute rolls over.
  it("A3: after a rejected flood drains, the next start in the same minute gets the model, not a global_budget refusal", async () => {
    await aiSetup({ mode: "serial", envExtra: { AI_GLOBAL_REQUESTS_PER_MIN: "120", AI_GLOBAL_TOKENS_PER_MIN: "1000000000", AI_CASE_TIMEOUT_MS: "1500" } });
    const flood = await lobbies(130);
    const o = await startAll(flood, flood.map(() => 0));
    const afterFlood = summarise(o);
    // wait until the model is idle again
    for (let i = 0; i < 100 && (getTextModel()!.status().inFlight > 0 || getTextModel()!.status().queued > 0); i++) await sleep(50);
    const [late] = await lobbies(1).then((g) => g.map((x) => ({ ...x, i: 999 })));
    void late;
    const g2 = await seedGame(5000, { start: false });
    const r = await api.action(g2.code, { type: "start" }, { host: g2.host });
    const room = await env!.raw.get(g2.code);
    results.globalBudgetFlood = { floodStarts: 130, floodFallbacks: afterFlood.fallbacks, nextStartStatus: r.status, nextStartSource: room?.caseSource, gateway: getTextModel()!.status().lastError };
    expect(r.status).toBe(200);
    expect(room!.caseSource).toBe("bedrock");
  }, 180_000);
});

describe("capacity arithmetic for one local model", () => {
  it("serves at most 3600/210 = 17 cases per hour, so 10,000 games cannot be served and the 10,001st gets the sample case", () => {
    const secPerCase = 8000 / 40 + 3000 / 300; // decode + prefill
    const perHour = 3600 / secPerCase;
    const startsPerHourAt10k = 10_000 / 2; // 2 hour games
    results.capacity = { secPerCase, casesPerHourPerBox: perHour, startsPerHourAt10k, boxesNeeded: startsPerHourAt10k / perHour, realCaseShareOnOneBox: perHour / startsPerHourAt10k };
    expect(perHour).toBeCloseTo(17.1, 0);
    expect(startsPerHourAt10k / perHour).toBeGreaterThan(250);
    saveResult("ai-load", results);
  });
});
