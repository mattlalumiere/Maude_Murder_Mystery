// OpenAI-compatible fake that models a slow local model in compressed time.
// Real model: prefill 300 tokens/s, decode 40 tokens/s, at most `slots` requests accepted into the engine.
// `mode: "serial"` processes one request at a time (mlx_lm.server style); `mode: "shared"` splits aggregate
// throughput between active requests (continuous batching) with aggregate speedup `gain` (1 = memory bound).
// Everything is divided by `speedup` so minutes of model time take seconds of test time.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeLlmOptions {
  speedup: number;
  mode: "serial" | "shared";
  slots?: number;
  gain?: number;
  prefillTps?: number;
  decodeTps?: number;
  outputTokens?: number;
  /** Stop working on a request when the client disconnects (true) or finish it anyway and waste the capacity (false). */
  cancelOnDisconnect?: boolean;
  content: string;
}

interface Job {
  id: number; res: ServerResponse; remaining: number; total: number; arrivedAt: number; startedAt?: number; aborted: boolean; promptTokens: number;
}

export interface FakeLlm {
  baseUrl: string;
  opts: Required<FakeLlmOptions>;
  stats: { received: number; completed: number; abortedWhileQueued: number; abortedWhileRunning: number; wastedModelSec: number; busyModelSec: number; maxWaiting: number; maxActive: number; failMode: null | "500" | "drop" };
  /** model seconds from arrival to completion per completed job */
  sojourn: number[];
  setFail(m: null | "500" | "drop"): void;
  close(): Promise<void>;
}

export async function startFakeLlm(o: FakeLlmOptions): Promise<FakeLlm> {
  const opts = { slots: 3, gain: 1, prefillTps: 300, decodeTps: 40, outputTokens: 8000, cancelOnDisconnect: true, ...o } as Required<FakeLlmOptions>;
  const slots = opts.mode === "serial" ? 1 : opts.slots;
  const sockets = new Set<import("node:net").Socket>();
  const waiting: Job[] = [];
  let active: Job[] = [];
  let last = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 1;
  const fake: FakeLlm = {
    baseUrl: "", opts, sojourn: [],
    stats: { received: 0, completed: 0, abortedWhileQueued: 0, abortedWhileRunning: 0, wastedModelSec: 0, busyModelSec: 0, maxWaiting: 0, maxActive: 0, failMode: null },
    setFail(m) { fake.stats.failMode = m; },
    async close() { if (timer) clearTimeout(timer); for (const s of sockets) s.destroy(); await new Promise<void>((r) => server.close(() => r())); },
  };
  const rate = () => (active.length ? Math.min(active.length, opts.gain) / active.length : 0); // model seconds per model second, per job

  function advanceClock() {
    const now = Date.now();
    const modelDt = ((now - last) / 1000) * opts.speedup;
    last = now;
    if (!active.length || modelDt <= 0) return;
    const r = rate();
    for (const j of active) { j.remaining -= modelDt * r; if (j.aborted) fake.stats.wastedModelSec += modelDt * r; }
    fake.stats.busyModelSec += modelDt * Math.min(active.length, opts.gain);
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    while (active.length < slots && waiting.length) {
      const j = waiting.shift()!; j.startedAt = Date.now(); active.push(j);
    }
    fake.stats.maxActive = Math.max(fake.stats.maxActive, active.length);
    if (!active.length) return;
    const r = rate();
    const minRem = Math.max(0, Math.min(...active.map((j) => j.remaining)));
    const realMs = (minRem / r / opts.speedup) * 1000;
    timer = setTimeout(tick, Math.max(0, realMs));
  }
  function tick() {
    advanceClock();
    const done = active.filter((j) => j.remaining <= 1e-6);
    active = active.filter((j) => j.remaining > 1e-6);
    for (const j of done) {
      fake.sojourn.push(((Date.now() - j.arrivedAt) / 1000) * opts.speedup);
      if (j.aborted) continue;
      fake.stats.completed++;
      const payload = JSON.stringify({
        id: "x", model: "fake-local",
        choices: [{ index: 0, message: { role: "assistant", content: opts.content }, finish_reason: "stop" }],
        usage: { prompt_tokens: j.promptTokens, completion_tokens: opts.outputTokens },
      });
      j.res.writeHead(200, { "content-type": "application/json" }); j.res.end(payload);
    }
    schedule();
  }

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      fake.stats.received++;
      if (fake.stats.failMode === "500") { res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":{"message":"boom"}}'); return; }
      if (fake.stats.failMode === "drop") { req.socket.destroy(); return; }
      advanceClock();
      const promptTokens = Math.ceil(raw.length / 3);
      const total = promptTokens / opts.prefillTps + opts.outputTokens / opts.decodeTps;
      const job: Job = { id: nextId++, res, remaining: total, total, arrivedAt: Date.now(), aborted: false, promptTokens };
      res.on("close", () => {
        if (res.writableEnded) return;
        if (waiting.includes(job)) { waiting.splice(waiting.indexOf(job), 1); fake.stats.abortedWhileQueued++; return; }
        if (!active.includes(job)) return;
        fake.stats.abortedWhileRunning++;
        if (opts.cancelOnDisconnect) { advanceClock(); active = active.filter((j) => j !== job); schedule(); } else job.aborted = true;
      });
      waiting.push(job);
      fake.stats.maxWaiting = Math.max(fake.stats.maxWaiting, waiting.length);
      schedule();
    });
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  fake.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return fake;
}
