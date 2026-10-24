import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", async () => await import("./sim/auth-mock"));
import { setupEnv } from "./sim/env";
import { runParty, type PartyReport } from "./sim/party";
import { fmt, saveResult } from "./sim/stats";

// SCALE_N games (default 100) x 16 players. SCALE_STORE=memory|file. Results go to $SCALE_OUT/party-<store>-<N>.json.
const N = Number(process.env.SCALE_N ?? 100);
const STORE = (process.env.SCALE_STORE ?? "memory") as "memory" | "file";
const SAMPLE = Number(process.env.SCALE_POLL_SAMPLE ?? 1);

let report: PartyReport;
const p = (label: string, r: PartyReport) => {
  const L = r.latency;
  const row = (k: string) => L[k] ? `${k}: n=${L[k].n} p50=${fmt(L[k].p50)} p95=${fmt(L[k].p95)} p99=${fmt(L[k].p99)} max=${fmt(L[k].max)}` : `${k}: none`;
  console.log(`\n=== ${label} N=${N} store=${STORE} wall=${fmt(r.wallSec, 1)}s ops/s=${fmt(r.opsPerWallSec, 0)} cpu ms/op=${fmt(r.cpuMsPerOp, 3)} heap/game=${fmt(r.heap.perGameBytes / 1024, 0)}kB rssPeak=${fmt(r.heap.rssPeakMB, 0)}MB`);
  for (const k of Object.keys(L)) console.log("  " + row(k));
  console.log("  totals", JSON.stringify(r.totals), "bodies", JSON.stringify(r.bodyBytes), "room", JSON.stringify(r.roomBytes));
  console.log("  store", JSON.stringify(r.store), "correct", JSON.stringify({ ...r.correctness, failures: r.correctness.failures.slice(0, 5) }));
};

describe(`full parties: ${N} games x 16 players on the ${STORE} store (real routes, virtual time)`, () => {
  it("runs every game to the reveal", async () => {
    const env = setupEnv({ store: STORE });
    try {
      report = await runParty(env, { games: N, pollSample: SAMPLE, verbose: !!process.env.SCALE_VERBOSE });
    } finally { env.teardown(); }
    saveResult(`party-${STORE}-${N}`, report);
    p("party", report);
    // NF-12: zero 5xx, zero cross-game leaks, everyone reaches the reveal.
    expect(report.correctness.failures).toEqual([]);
    expect(report.totals.fivexx).toBe(0);
    expect(report.correctness.leaks).toBe(0);
    expect(report.correctness.secretHits).toBe(0);
    expect(report.correctness.reachedReveal).toBe(N);
    expect(report.correctness.allBallotsIn).toBe(N);
  });

  it("NF-3: changed poll payloads stay within 24/32/48 KB (public/player/host)", () => {
    expect(report.bodyBytes.changedMax.screen).toBeLessThanOrEqual(24 * 1024);
    expect(report.bodyBytes.changedMax.player).toBeLessThanOrEqual(32 * 1024);
    expect(report.bodyBytes.changedMax.host).toBeLessThanOrEqual(48 * 1024);
  });

  it("NF-2: an unchanged poll body is at most 100 bytes", () => {
    expect(report.bodyBytes.unchangedMax).toBeLessThanOrEqual(100);
  });

  it("NF-13: stored game state is at most 256 KB", () => {
    expect(report.roomBytes.max).toBeLessThanOrEqual(256 * 1024);
  });

  it("NF-14: write conflict retries do not exhaust (zero 409 Busy) with a realistic 30 s join window", () => {
    expect(report.totals.busy409).toBe(0);
    const writes = report.store.counters.put;
    expect(report.store.counters.putConflict / Math.max(1, writes)).toBeLessThan(0.01);
  });

  it("NF-5: p95 of in-process action handler time is at most 20 ms (memory store)", () => {
    if (STORE !== "memory") return;
    for (const op of ["join", "ready", "ballot", "advance"]) expect(report.latency[op].p95, op).toBeLessThanOrEqual(20);
  });

  it("NF-6: start with the sample case has p95 <= 1500 ms", () => {
    expect(report.latency.start.p95).toBeLessThanOrEqual(1500);
  });

  it("NF-23: at most 1 MB of heap per hot game (memory store)", () => {
    if (STORE !== "memory") return;
    expect(report.heap.perGameBytes).toBeLessThanOrEqual(1024 * 1024);
  });
});
afterAll(() => { /* results already saved */ });
