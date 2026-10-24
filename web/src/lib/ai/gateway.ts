// Guards any TextModel with what slow, single GPU local servers need:
// concurrency limit, bounded queue with backpressure, per game and global budgets,
// a total deadline, bounded retries with jitter and a circuit breaker.
// State is in memory and per process. Per game state is bounded (LRU) so it cannot grow without limit.
import {
  AiError, AiRateLimitedError, AiTimeoutError, AiUnavailableError, estimateTokens,
  type TextModel, type TextRequest, type TextResult,
} from "./ports";

export interface Budget { maxRequests: number; maxTokens: number }
export interface GlobalBudget extends Budget { windowMs: number }

export interface GatewayOptions {
  maxConcurrent: number;
  /** Max callers waiting for a slot. Beyond this, calls fail fast with RateLimited(queue_full). */
  maxQueue: number;
  /** Extra attempts after the first, for retryable errors only. */
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Total deadline per generate() call, including queue wait and retries. */
  timeoutMs: number;
  breakerFailures: number;
  breakerCooldownMs: number;
  perGame?: Budget;
  global?: GlobalBudget;
  /** Assumed output size when a request does not say (used to reserve tokens up front). */
  defaultMaxOutputTokens?: number;
  maxTrackedGames?: number;
  /** Clock for breaker and budget windows. Deadlines always use real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export type BreakerState = "closed" | "open" | "half-open";
export interface GatewayStatus {
  breaker: BreakerState;
  consecutiveFailures: number;
  openedAt?: number;
  inFlight: number;
  queued: number;
  rejected: number;
  maxConcurrent: number;
  maxQueue: number;
  trackedGames: number;
  totals: { requests: number; failures: number; inputTokens: number; outputTokens: number };
  lastError?: { code: string; message: string; at: number };
}

export interface Gateway extends TextModel {
  status(): GatewayStatus;
  gameUsage(gameId: string): { requests: number; tokens: number };
  releaseGame(gameId: string): void;
}

interface Waiter { resolve: () => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }

export function createGateway(inner: TextModel, o: GatewayOptions): Gateway {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  const maxGames = o.maxTrackedGames ?? 10_000;
  const defOut = o.defaultMaxOutputTokens ?? 4096;

  // ----- limiter -----
  let inFlight = 0, rejected = 0;
  const queue: Waiter[] = [];
  async function acquire(deadline: number): Promise<() => void> {
    const release = () => {
      const next = queue.shift();
      if (next) { clearTimeout(next.timer); next.resolve(); } else inFlight--;
    };
    if (inFlight < o.maxConcurrent) { inFlight++; return release; }
    if (queue.length >= o.maxQueue) { rejected++; throw new AiRateLimitedError("queue_full", "AI queue is full"); }
    await new Promise<void>((resolve, reject) => {
      const w: Waiter = {
        resolve, reject,
        timer: setTimeout(() => {
          const i = queue.indexOf(w);
          if (i >= 0) queue.splice(i, 1);
          reject(new AiTimeoutError("Timed out waiting for an AI slot"));
        }, Math.max(0, deadline - Date.now())),
      };
      queue.push(w);
    });
    return release;
  }

  // ----- breaker -----
  let state: BreakerState = "closed", failures = 0, openedAt = 0, probing = false;
  const open = () => { state = "open"; openedAt = now(); probing = false; };
  const circuitOpen = () => new AiUnavailableError("circuit_open", "AI circuit breaker is open");
  function peekBreaker() { if (state === "open" && now() - openedAt < o.breakerCooldownMs) throw circuitOpen(); }
  function beforeCall() {
    if (state === "open") {
      if (now() - openedAt < o.breakerCooldownMs) throw circuitOpen();
      state = "half-open"; probing = false;
    }
    if (state === "half-open") { if (probing) throw circuitOpen(); probing = true; }
  }
  const onHealthy = () => { failures = 0; state = "closed"; probing = false; };
  function onInfraFailure() {
    failures++;
    if (state === "half-open" || failures >= o.breakerFailures) open();
  }

  // ----- budgets -----
  const games = new Map<string, { requests: number; tokens: number }>();
  const gameEntry = (id: string) => {
    let g = games.get(id);
    if (g) games.delete(id); else g = { requests: 0, tokens: 0 };
    games.set(id, g);
    while (games.size > maxGames) games.delete(games.keys().next().value!);
    return g;
  };
  const win = { start: 0, requests: 0, tokens: 0 };
  const rollWindow = () => {
    if (o.global && now() - win.start >= o.global.windowMs) { win.start = now(); win.requests = 0; win.tokens = 0; }
  };

  const totals = { requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 };
  let lastError: GatewayStatus["lastError"];

  function admit(req: TextRequest, reserve: number) {
    const g = req.gameId ? gameEntry(req.gameId) : null;
    if (g && o.perGame && (g.requests + 1 > o.perGame.maxRequests || g.tokens + reserve > o.perGame.maxTokens)) {
      throw new AiRateLimitedError("game_budget", "This game has used its AI allowance");
    }
    rollWindow();
    if (o.global && (win.requests + 1 > o.global.maxRequests || win.tokens + reserve > o.global.maxTokens)) {
      throw new AiRateLimitedError("global_budget", "AI is at capacity, try again shortly");
    }
    if (g) { g.requests++; g.tokens += reserve; }
    win.requests++; win.tokens += reserve;
  }
  function settle(req: TextRequest, reserve: number, actual: number) {
    const delta = actual - reserve;
    if (req.gameId) { const g = games.get(req.gameId); if (g) g.tokens = Math.max(0, g.tokens + delta); }
    win.tokens = Math.max(0, win.tokens + delta);
  }

  async function callWithDeadline(req: TextRequest, deadline: number, timeoutMs: number): Promise<TextResult> {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AiTimeoutError("AI deadline already passed");
    const deadlineP = new Promise<never>((_, rej) => {
      timer = setTimeout(() => { const e = new AiTimeoutError(`AI call exceeded ${timeoutMs}ms`); rej(e); ctl.abort(e); }, remaining);
    });
    try {
      const p = inner.generate({ ...req, signal: ctl.signal });
      p.catch(() => {}); // late rejection after the deadline must not be unhandled
      return await Promise.race([p, deadlineP]);
    } finally { clearTimeout(timer); }
  }

  async function generate(req: TextRequest): Promise<TextResult> {
    const timeoutMs = req.timeoutMs ?? o.timeoutMs;
    const deadline = Date.now() + timeoutMs;
    peekBreaker();
    const reserve = estimateTokens((req.system ?? "") + req.user) + (req.maxOutputTokens ?? defOut);
    admit(req, reserve);
    totals.requests++;
    let settled = false;
    try {
      for (let attempt = 0; ; attempt++) {
        let release: (() => void) | undefined;
        try {
          release = await acquire(deadline);
          beforeCall();
          const r = await callWithDeadline(req, deadline, timeoutMs);
          onHealthy();
          totals.inputTokens += r.usage.inputTokens; totals.outputTokens += r.usage.outputTokens;
          settle(req, reserve, r.usage.inputTokens + r.usage.outputTokens);
          settled = true;
          return r;
        } catch (e) {
          const err = e instanceof AiError ? e : new AiUnavailableError("network", (e as Error).message);
          const local = err instanceof AiUnavailableError && err.reason === "circuit_open";
          if (!local) { lastError = { code: err.code, message: err.message, at: now() }; }
          if (err.infrastructure) { totals.failures++; onInfraFailure(); }
          else if (!local && !(err instanceof AiRateLimitedError && err.reason !== "upstream")) { if (state !== "closed" || failures) onHealthy(); }
          if (!err.retryable || attempt >= o.maxRetries) throw err;
          const backoff = random() * Math.min(o.backoffMaxMs, o.backoffBaseMs * 2 ** attempt);
          const wait = err instanceof AiRateLimitedError && err.retryAfterMs ? Math.max(backoff, Math.min(err.retryAfterMs, o.backoffMaxMs)) : backoff;
          if (Date.now() + wait >= deadline) throw err;
          release?.(); release = undefined;
          await sleep(wait);
          peekBreaker();
        } finally { release?.(); }
      }
    } finally {
      if (!settled) settle(req, reserve, 0);
    }
  }

  return {
    id: inner.id,
    generate,
    status: () => ({
      breaker: state, consecutiveFailures: failures, openedAt: state === "closed" ? undefined : openedAt,
      inFlight, queued: queue.length, rejected, maxConcurrent: o.maxConcurrent, maxQueue: o.maxQueue,
      trackedGames: games.size, totals: { ...totals }, lastError,
    }),
    gameUsage: (id) => { const g = games.get(id); return g ? { ...g } : { requests: 0, tokens: 0 }; },
    releaseGame: (id) => { games.delete(id); },
  };
}
