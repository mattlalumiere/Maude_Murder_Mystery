import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", async () => await import("./sim/auth-mock"));
import { api } from "./sim/api";
import { setupEnv, type SimEnv } from "./sim/env";
import { seedGame, type SeededGame } from "./sim/seed-games";
import { saveResult } from "./sim/stats";

// NF-2: unchanged poll = 1 store read, 0 writes, body <= 100 bytes, and "a cheap version check".
// W10's capacity model and docs/platform/feedback/to-W3-from-W10.md item 7 assume the poll does not read the full room.

let env: SimEnv;
let game: SeededGame;
beforeAll(async () => {
  env = setupEnv({ store: "memory" });
  game = await seedGame(1, { advanceTo: 3 });
});
afterAll(() => env.teardown());

const version = async () => (await api.state(game.code, { role: "screen" })).json<{ version: number }>().version;

describe("NF-2 unchanged poll cost (counting store)", () => {
  it("is one store read, zero writes, and a body of at most 100 bytes", async () => {
    const v = await version();
    env.store.reset();
    const r = await api.state(game.code, { role: "screen", v });
    expect(r.json()).toEqual({ unchanged: true, version: v });
    expect(r.bytes).toBeLessThanOrEqual(100);
    expect(env.store.c.get + env.store.c.getById).toBe(1);
    expect(env.store.c.put).toBe(0);
  });

  // SCALE-DEFECT S1 (documented by W10: capacity-model.md section 2 lever 1, to-W3-from-W10 item 7):
  // the unchanged poll reads and deserialises the whole room (about 17 to 22 KB here, 40 KB in W10's model).
  it.fails("reads at most 1 KB from the store for an unchanged poll (version-only read)", async () => {
    const v = await version();
    env.store.reset();
    env.store.sampleEvery = 1;
    await api.state(game.code, { role: "screen", v });
    expect(env.store.estBytesRead()).toBeLessThanOrEqual(1024);
  });

  it("measures bytes read per unchanged poll (informational, saved for the report)", async () => {
    const v = await version();
    env.store.reset();
    env.store.sampleEvery = 1;
    for (let i = 0; i < 20; i++) await api.state(game.code, { role: "screen", v });
    const perPoll = env.store.estBytesRead() / 20;
    saveResult("poll-bytes", { bytesReadPerUnchangedPoll: perPoll, responseBytes: 31 });
    expect(perPoll).toBeGreaterThan(0);
  });
});

describe("serial handler cost on a populated memory store (no HTTP stack)", () => {
  it("records microseconds per operation", async () => {
    const games: SeededGame[] = [game];
    for (let i = 2; i <= 40; i++) games.push(await seedGame(i, { advanceTo: 6 }));
    const vers = new Map<string, number>();
    for (const g of games) vers.set(g.code, (await api.state(g.code, { role: "screen" })).json<{ version: number }>().version);
    const bench = async (label: string, n: number, fn: (i: number) => Promise<unknown>) => {
      for (let i = 0; i < 200; i++) await fn(i); // warm up
      const c0 = process.cpuUsage(); const t0 = performance.now();
      for (let i = 0; i < n; i++) await fn(i);
      const ms = performance.now() - t0; const cpu = process.cpuUsage(c0);
      return { label, n, usPerOp: (ms * 1000) / n, cpuUsPerOp: (cpu.user + cpu.system) / n, opsPerSec: (n / ms) * 1000 };
    };
    const out = [
      await bench("poll.unchanged.screen", 20000, (i) => { const g = games[i % games.length]; return api.state(g.code, { role: "screen", v: vers.get(g.code) }); }),
      await bench("poll.changed.screen", 5000, (i) => api.state(games[i % games.length].code, { role: "screen", v: -1 })),
      await bench("poll.changed.player", 5000, (i) => { const g = games[i % games.length]; const p = g.players[i % 16]; return api.state(g.code, { role: "player", v: -1, pid: p.pid, token: p.token }); }),
      await bench("poll.changed.host", 5000, (i) => { const g = games[i % games.length]; return api.state(g.code, { role: "host", v: -1, host: g.host }); }),
      await bench("action.ready", 2000, (i) => { const g = games[i % games.length]; const p = g.players[i % 16]; return api.action(g.code, { type: "ready" }, { pid: p.pid, token: p.token }); }),
    ];
    // one create to price scrypt
    const c = await bench("create (scryptSync)", 20, (i) => api.create(`bench-${i}`, { overrideCode: "vault-secret" }));
    out.push(c);
    saveResult("microbench-memory", out);
    console.table(out.map((o) => ({ ...o, usPerOp: Math.round(o.usPerOp), cpuUsPerOp: Math.round(o.cpuUsPerOp), opsPerSec: Math.round(o.opsPerSec) })));
    // The in-process unchanged poll must be far cheaper than the 1.5k rps/pod planning figure allows (0.67 ms).
    expect(out[0].usPerOp).toBeLessThan(670);
  }, 120_000);
});
