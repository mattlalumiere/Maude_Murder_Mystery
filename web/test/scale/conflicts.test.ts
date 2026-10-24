import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", async () => await import("./sim/auth-mock"));
import { api } from "./sim/api";
import { setupEnv } from "./sim/env";
import { seedGame, TO_ACT4, type SeededGame } from "./sim/seed-games";
import { saveResult } from "./sim/stats";
import { ROSTER16 } from "./sim/roster";

// Optimistic lock behaviour under bursts, in REAL time with injected store latency (a conflict needs two
// requests inside each other's read-to-write window, so virtual time cannot model it).
// mutate() retries 6 times with no jitter, then answers 409 "Busy".

interface Result { scenario: string; spreadS: number; latencyMs: number; games: number; writes: number; conflicts: number; conflictRate: number; exhausted: number; attempts: number; okRate: number }
const results: Result[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ballotScenario(spreadS: number, latencyMs: number, games: number): Promise<Result> {
  const env = setupEnv({ store: "memory" });
  try {
    const gs: SeededGame[] = [];
    for (let i = 0; i < games; i++) gs.push(await seedGame(i, { advanceTo: TO_ACT4 }));
    const opts = new Map<string, { k: string; m: string; mo: string }>();
    for (const g of gs) {
      const s = (await api.state(g.code, { role: "player", pid: g.players[0].pid, token: g.players[0].token })).json<any>();
      opts.set(g.code, { k: s.ballotOptions.suspects[0].id, m: s.ballotOptions.methods[0].id, mo: s.ballotOptions.motives[0].id });
    }
    env.store.reset();
    env.store.fault.latencyMs = latencyMs;
    env.store.fault.jitterMs = latencyMs * 0.5;
    const jobs: Promise<number>[] = [];
    for (const g of gs) for (const p of g.players) {
      const o = opts.get(g.code)!;
      jobs.push((async () => {
        await sleep(Math.random() * spreadS * 1000);
        const r = await api.action(g.code, { type: "ballot", ballot: { killerId: o.k, methodId: o.m, motiveId: o.mo } }, { pid: p.pid, token: p.token });
        return r.status;
      })());
    }
    const statuses = await Promise.all(jobs);
    const c = env.store.c;
    const exhausted = statuses.filter((s) => s === 409).length;
    const requests = statuses.length;
    const gets = c.get;
    return {
      scenario: "ballot", spreadS, latencyMs, games, writes: c.put, conflicts: c.putConflict, conflictRate: c.putConflict / Math.max(1, c.put),
      exhausted, attempts: gets / requests, okRate: statuses.filter((s) => s === 200).length / requests,
    };
  } finally { env.teardown(); }
}

async function joinScenario(spreadS: number, latencyMs: number, games: number): Promise<Result> {
  const env = setupEnv({ store: "memory" });
  try {
    const codes: string[] = [];
    for (let i = 0; i < games; i++) {
      const c = await api.create(`h${i}`, { overrideCode: "vault-secret" });
      codes.push(c.json<{ code: string }>().code);
    }
    env.store.reset();
    env.store.fault.latencyMs = latencyMs;
    env.store.fault.jitterMs = latencyMs * 0.5;
    const jobs: Promise<number>[] = [];
    codes.forEach((code, gi) => ROSTER16.forEach((r) => jobs.push((async () => {
      await sleep(Math.random() * spreadS * 1000);
      return (await api.join(code, { name: `${r.name}-g${gi}`, ageGroup: r.ageGroup })).status;
    })())));
    const statuses = await Promise.all(jobs);
    const c = env.store.c;
    return {
      scenario: "join", spreadS, latencyMs, games, writes: c.put, conflicts: c.putConflict, conflictRate: c.putConflict / Math.max(1, c.put),
      exhausted: statuses.filter((s) => s === 409).length, attempts: c.get / statuses.length, okRate: statuses.filter((s) => s === 200).length / statuses.length,
    };
  } finally { env.teardown(); }
}

afterAll(() => { saveResult("conflicts", results); console.table(results.map((r) => ({ ...r, conflictRate: +(r.conflictRate * 100).toFixed(2), okRate: +(r.okRate * 100).toFixed(1), attempts: +r.attempts.toFixed(2) }))); });

describe("optimistic lock under bursts (16 players per game, 20 games in parallel, memory store + injected latency)", () => {
  // Realistic: ballots spread over ~6 s, 5 ms store round trip (Postgres in the same zone).
  it("NF-14: realistic ballot window (6 s, 5 ms store) has a conflict rate below 1% and no exhausted retries", async () => {
    const r = await ballotScenario(6, 5, 20); results.push(r);
    expect(r.conflictRate).toBeLessThan(0.01);
    expect(r.exhausted).toBe(0);
  }, 60_000);

  it("realistic join window: 16 joins spread over 30 s, 25 ms store, conflict rate below 1%", async () => {
    const r = await joinScenario(30, 25, 20); results.push(r);
    expect(r.conflictRate).toBeLessThan(0.01);
    expect(r.exhausted).toBe(0);
  }, 90_000);

  // Characterisation matrix (no assertion on the numbers, saved for the report).
  for (const latency of [0, 5, 25]) for (const spread of [0, 2, 6]) {
    it(`matrix ballot spread=${spread}s latency=${latency}ms`, async () => { results.push(await ballotScenario(spread, latency, 20)); }, 60_000);
    it(`matrix join spread=${spread}s latency=${latency}ms`, async () => { results.push(await joinScenario(spread, latency, 20)); }, 60_000);
  }

  // SCALE-DEFECT C1: mutate() has no backoff or jitter and only 6 attempts. When all 16 phones submit in the same
  // instant, 16 writers race on one row: one wins per round, so at most 6 get through and 10 players see "Busy".
  it("C1: sixteen simultaneous ballots in one game all succeed (zero 409 Busy)", async () => {
    const r = await ballotScenario(0, 5, 10); results.push({ ...r, scenario: "ballot-simultaneous" });
    expect(r.exhausted).toBe(0);
  }, 60_000);

  it("C1b: sixteen simultaneous joins in one game all succeed (zero 409 Busy)", async () => {
    const r = await joinScenario(0, 5, 10); results.push({ ...r, scenario: "join-simultaneous" });
    expect(r.exhausted).toBe(0);
  }, 60_000);
});
