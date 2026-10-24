// Discrete tick driver (1 tick = 1 virtual second) that plays N complete parties through the REAL route
// handlers: create, join storm, start, ready, advance through every phase, simultaneous ballots, reveal,
// with every device polling every 2 virtual seconds using the `v=` unchanged fast path.
import { gc, Recorder } from "./stats";
import { api } from "./api";
import { ROSTER16 } from "./roster";
import type { SimEnv } from "./env";
import { seededRandom } from "../../../src/lib/ids";

export interface PartyOpts {
  games: number;
  rampS?: number;
  joinWindowS?: number;
  phaseS?: number;
  ballotSpreadS?: number;
  pollEveryS?: number;
  /** Fraction of due polls actually executed (1 = all). Counts are scaled back up in the report. */
  pollSample?: number;
  /** Max operations in flight at once (models in-flight requests on one pod). */
  chunk?: number;
  seed?: number;
  verbose?: boolean;
  /** All hosts press Advance in the same tick (worst case) instead of staggered by creation time. */
  synchronised?: boolean;
  /** Retry a 409/5xx once on the next tick (what a user would do by tapping again). */
  retryFailures?: boolean;
}

type Kind = "player" | "host" | "screen";
interface Dev {
  g: Game; kind: Kind; ver: number; active: boolean; phase: number;
  pid?: string; token?: string; name?: string; age?: string;
  ballotOpts?: { k: string; m: string; mo: string };
}
interface Game {
  i: number; host: string; code?: string; devs: Dev[]; players: Dev[]; hostDev: Dev; screenDev: Dev;
  createAt: number; startAt: number; advanceAt: number[]; revealPhaseSeen: boolean; marker: string;
  failed: string[]; done: boolean;
}
type Op = () => Promise<void>;

export interface PartyReport {
  opts: Required<Omit<PartyOpts, "verbose">>;
  wallSec: number; virtualSec: number; ticks: number;
  latency: ReturnType<Recorder["table"]>;
  statuses: Record<string, number>;
  totals: { ops: number; polls: number; pollsExecuted: number; unchanged: number; changed: number; mutations: number; fivexx: number; busy409: number };
  opsPerWallSec: number; cpuMsPerOp: number;
  bodyBytes: { unchangedMax: number; unchangedAvg: number; changedMax: Record<string, number>; changedAvg: Record<string, number> };
  store: { counters: Record<string, number>; avgRoomBytes: number; estBytesReadPerPoll: number };
  heap: { perGameBytes: number; heapDeltaMB: number; rssPeakMB: number };
  correctness: { reachedReveal: number; allBallotsIn: number; leaks: number; secretHits: number; failures: string[] };
  roomBytes: { max: number; avg: number };
}

const PHASE_TICKS = 7; // cards -> act1 -> death -> act2 -> intermission -> act3 -> act4 -> reveal

export async function runParty(env: SimEnv, o: PartyOpts): Promise<PartyReport> {
  const opts = {
    rampS: 60, joinWindowS: 30, phaseS: 10, ballotSpreadS: 6, pollEveryS: 2, pollSample: 1, chunk: 8, seed: 7,
    synchronised: false, retryFailures: true, ...o,
  };
  const rnd = seededRandom(opts.seed);
  const rec = new Recorder();
  const N = opts.games;
  const nP = ROSTER16.length;

  // ---- schedule ----
  const games: Game[] = [];
  const events = new Map<number, Op[]>(); // tick -> ops that are not polls
  const addEv = (t: number, op: Op) => { const a = events.get(t); if (a) a.push(op); else events.set(t, [op]); };
  const firstOps = new WeakSet<Op>();
  let horizon = 0;
  const T = { polls: 0, exec: 0, unchanged: 0, changed: 0, mutations: 0, fivexx: 0, busy409: 0, ops: 0, leaks: 0, secretHits: 0, creations: 0 };
  const bodies = { unchangedMax: 0, unchangedSum: 0, changedMax: {} as Record<string, number>, changedSum: {} as Record<string, number>, changedN: {} as Record<string, number> };
  const failures: string[] = [];
  const fail = (g: Game, m: string) => { g.failed.push(m); if (failures.length < 30) failures.push(`g${g.i}: ${m}`); };

  const markerRe = /-g(\d+)\b/g;
  const forbidden = ['"truth"', '"overrideHash"', '"overrideSalt"', '"token"', '"photoKey"', '"nudges"'];
  function inspect(g: Game, text: string) {
    markerRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(text))) if (Number(m[1]) !== g.i) { T.leaks++; if (failures.length < 30) failures.push(`g${g.i}: foreign marker g${m[1]}`); break; }
    for (const f of forbidden) if (text.includes(f)) { T.secretHits++; if (failures.length < 30) failures.push(`g${g.i}: body contains ${f}`); break; }
  }

  const timedMut = async (op: string, g: Game, fn: () => Promise<{ status: number; ms: number; text: string; json<T>(): T }>) => {
    let r = await fn();
    rec.add(op, r.ms, r.status); T.mutations++; T.ops++;
    if (r.status >= 500) T.fivexx++;
    if (r.status === 409 && /Busy/.test(r.text)) T.busy409++;
    if (opts.retryFailures && (r.status >= 500 || (r.status === 409 && /Busy/.test(r.text)))) {
      r = await fn();
      rec.add(op + ".retry", r.ms, r.status); T.mutations++; T.ops++;
      if (r.status >= 500) T.fivexx++;
      if (r.status === 409 && /Busy/.test(r.text)) T.busy409++;
    }
    if (r.status >= 400 && !(r.status === 409 && op === "ballot")) fail(g, `${op} -> ${r.status} ${r.text.slice(0, 80)}`);
    return r;
  };

  for (let i = 0; i < N; i++) {
    const createAt = Math.floor(rnd.float() * opts.rampS);
    const marker = `-g${i}`;
    const g: Game = {
      i, host: `host-${i}`, marker, createAt, devs: [], players: [], revealPhaseSeen: false, failed: [], done: false,
      startAt: opts.synchronised ? opts.rampS + opts.joinWindowS + 2 : createAt + opts.joinWindowS + 2 + Math.floor(rnd.float() * 3),
      advanceAt: [], hostDev: null as unknown as Dev, screenDev: null as unknown as Dev,
    };
    g.hostDev = { g, kind: "host", ver: -1, active: false, phase: Math.floor(rnd.float() * opts.pollEveryS) };
    g.screenDev = { g, kind: "screen", ver: -1, active: false, phase: Math.floor(rnd.float() * opts.pollEveryS) };
    g.devs.push(g.hostDev, g.screenDev);
    ROSTER16.slice(0, nP).forEach((r, k) => {
      const d: Dev = { g, kind: "player", ver: -1, active: false, phase: Math.floor(rnd.float() * opts.pollEveryS), name: `${r.name}${marker}`, age: r.ageGroup };
      g.players.push(d); g.devs.push(d);
      const joinAt = createAt + 1 + Math.floor(rnd.float() * opts.joinWindowS);
      addEv(joinAt, async () => {
        if (!g.code) { fail(g, "no code at join"); return; }
        const res = await timedMut("join", g, () => api.join(g.code!, { name: d.name, ageGroup: d.age }));
        if (res.status === 200) { const j = res.json<{ playerId: string; token: string }>(); d.pid = j.playerId; d.token = j.token; d.active = true; }
      });
      addEv(g.startAt + 1 + Math.floor(rnd.float() * 5), async () => {
        if (!d.pid) return;
        await timedMut("ready", g, () => api.action(g.code!, { type: "ready" }, { pid: d.pid, token: d.token }));
      });
      const abAt = g.startAt + PHASE_TICKS - 1; // placeholder, fixed below
      void abAt; void k;
    });
    for (let p = 1; p <= PHASE_TICKS; p++) g.advanceAt.push(g.startAt + p * opts.phaseS);
    // ballots: act4 begins at advanceAt[5]; reveal is advanceAt[6]
    const act4 = g.advanceAt[5];
    g.players.forEach((d) => {
      const at = act4 + 1 + Math.floor(rnd.float() * Math.max(1, opts.ballotSpreadS));
      addEv(at, async () => {
        if (!d.pid) return;
        if (!d.ballotOpts) {
          const s = await api.state(g.code!, { role: "player", pid: d.pid, token: d.token });
          rec.add("state.prefetch", s.ms, s.status);
          if (s.status === 200) readOpts(d, s.json());
        }
        if (!d.ballotOpts) { fail(g, "no ballot options"); return; }
        const b = d.ballotOpts;
        await timedMut("ballot", g, () => api.action(g.code!, { type: "ballot", ballot: { killerId: b.k, methodId: b.m, motiveId: b.mo } }, { pid: d.pid, token: d.token }));
      });
    });
    const createOp: Op = async () => {
      const res = await timedMut("create", g, () => api.create(g.host, { overrideCode: `vault-${i}-secret`, config: { name: `Party${marker}` } }));
      if (res.status === 200) { g.code = res.json<{ code: string }>().code; T.creations++; g.hostDev.active = true; g.screenDev.active = true; }
    };
    firstOps.add(createOp);
    addEv(createAt, createOp);
    addEv(g.startAt, async () => { await timedMut("start", g, () => api.action(g.code!, { type: "start" }, { host: g.host })); });
    g.advanceAt.forEach((t, k) => {
      addEv(t, async () => { await timedMut("advance", g, () => api.action(g.code!, { type: "advance" }, { host: g.host })); });
      horizon = Math.max(horizon, t + 6);
      void k;
    });
    games.push(g);
  }

  function readOpts(d: Dev, v: any) {
    const bo = v?.ballotOptions;
    if (bo?.suspects?.length) d.ballotOpts = { k: bo.suspects[0].id, m: bo.methods[0].id, mo: bo.motives[0].id };
  }

  async function poll(d: Dev) {
    const g = d.g;
    if (!g.code) return;
    T.polls++;
    const o = d.kind === "player" ? { role: "player" as const, v: d.ver, pid: d.pid, token: d.token }
      : d.kind === "host" ? { role: "host" as const, v: d.ver, host: g.host }
      : { role: "screen" as const, v: d.ver };
    const r = await api.state(g.code, o);
    T.exec++; T.ops++;
    if (r.status >= 500) { T.fivexx++; rec.add("poll.error", r.ms, r.status); return; }
    if (r.status !== 200) { rec.add("poll.error", r.ms, r.status); if (r.status !== 404 && r.status !== 401) fail(g, `poll ${d.kind} ${r.status}`); return; }
    if (r.bytes < 100 && r.text.includes('"unchanged"')) {
      T.unchanged++; bodies.unchangedSum += r.bytes; if (r.bytes > bodies.unchangedMax) bodies.unchangedMax = r.bytes;
      rec.add("poll.unchanged", r.ms, 200);
      return;
    }
    T.changed++;
    const v = r.json<any>();
    d.ver = v.version;
    rec.add(`poll.changed.${d.kind}`, r.ms, 200);
    bodies.changedMax[d.kind] = Math.max(bodies.changedMax[d.kind] ?? 0, r.bytes);
    bodies.changedSum[d.kind] = (bodies.changedSum[d.kind] ?? 0) + r.bytes;
    bodies.changedN[d.kind] = (bodies.changedN[d.kind] ?? 0) + 1;
    inspect(g, r.text);
    if (d.kind === "player") readOpts(d, v);
    if (v.phase === "reveal") g.revealPhaseSeen = true;
  }

  async function runBatch(ops: Op[]) {
    // Shuffle so operations on the same game land in the same chunk by chance, like real arrivals.
    for (let i = ops.length - 1; i > 0; i--) { const j = rnd.int(i + 1); [ops[i], ops[j]] = [ops[j], ops[i]]; }
    for (let i = 0; i < ops.length; i += opts.chunk) await Promise.all(ops.slice(i, i + opts.chunk).map((f) => f().catch((e) => { T.fivexx++; if (failures.length < 30) failures.push(`thrown: ${(e as Error).message}`); })));
  }

  // ---- baseline heap (schedule already built) ----
  gc();
  const heap0 = process.memoryUsage().heapUsed;
  let rssPeak = process.memoryUsage().rss;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  env.store.reset();
  env.store.sampleEvery = Math.max(1, Math.floor(N / 20) + 1) * 8;

  // ---- run ----
  const lastTick = horizon;
  for (let t = 0; t <= lastTick; t++) {
    env.clock.set(env.clock.now() + 1000);
    const ev = events.get(t) ?? [];
    events.delete(t);
    // Creation must finish before joins in the same tick, so run create ops first.
    const first: Op[] = [], rest: Op[] = [];
    for (const f of ev) (firstOps.has(f) ? first : rest).push(f);
    if (first.length) await runBatch(first);
    const polls: Op[] = [];
    if (t > 0) {
      for (const g of games) {
        if (!g.code) continue;
        for (const d of g.devs) {
          if (d.active && (t + d.phase) % opts.pollEveryS === 0 && (opts.pollSample >= 1 || rnd.float() < opts.pollSample)) polls.push(() => poll(d));
        }
        if (t > g.advanceAt[PHASE_TICKS - 1] + 4) { g.done = true; }
      }
    }
    // Mutations first in the list but shuffled together with polls (arrival order is random).
    await runBatch([...rest, ...polls]);
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    if (opts.verbose && t % 10 === 0) console.log(`tick ${t}/${lastTick} ops=${T.ops} rssMB=${(process.memoryUsage().rss / 1048576).toFixed(0)}`);
  }
  const wallSec = (performance.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  gc();
  const heap1 = process.memoryUsage().heapUsed;

  // ---- verify end state straight from the store (not counted) ----
  let reveal = 0, allBallots = 0, maxB = 0, sumB = 0;
  const counters = { ...env.store.c };
  const avgRoomBytes = env.store.avgReadBytes();
  const estBytesReadPerPoll = env.store.estBytesRead() / Math.max(1, T.exec + T.mutations);
  for (const g of games) {
    if (!g.code) continue;
    const room = await env.raw.get(g.code);
    if (!room) { fail(g, "room missing at end"); continue; }
    if (room.phase === "reveal") reveal++;
    if (room.players.length === nP && room.players.every((p) => p.ballot)) allBallots++;
    const sz = Buffer.byteLength(JSON.stringify(room)); maxB = Math.max(maxB, sz); sumB += sz;
    if (room.phase !== "reveal" && g.failed.length === 0) fail(g, `ended in ${room.phase}`);
  }
  const scale = opts.pollSample > 0 ? 1 / opts.pollSample : 1;
  return {
    opts: opts as PartyReport["opts"], wallSec, virtualSec: lastTick, ticks: lastTick + 1,
    latency: rec.table(), statuses: rec.statuses(),
    totals: { ops: T.ops, polls: Math.round(T.polls * scale), pollsExecuted: T.exec, unchanged: T.unchanged, changed: T.changed, mutations: T.mutations, fivexx: T.fivexx, busy409: T.busy409 },
    opsPerWallSec: T.ops / wallSec, cpuMsPerOp: (cpu.user + cpu.system) / 1000 / Math.max(1, T.ops),
    bodyBytes: {
      unchangedMax: bodies.unchangedMax, unchangedAvg: T.unchanged ? bodies.unchangedSum / T.unchanged : 0,
      changedMax: bodies.changedMax,
      changedAvg: Object.fromEntries(Object.keys(bodies.changedSum).map((k) => [k, bodies.changedSum[k] / bodies.changedN[k]])),
    },
    store: {
      counters, avgRoomBytes, estBytesReadPerPoll,
    },
    heap: { perGameBytes: (heap1 - heap0) / Math.max(1, T.creations), heapDeltaMB: (heap1 - heap0) / 1048576, rssPeakMB: rssPeak / 1048576 },
    correctness: { reachedReveal: reveal, allBallotsIn: allBallots, leaks: T.leaks, secretHits: T.secretHits, failures },
    roomBytes: { max: maxB, avg: sumB / Math.max(1, T.creations) },
  };
}
