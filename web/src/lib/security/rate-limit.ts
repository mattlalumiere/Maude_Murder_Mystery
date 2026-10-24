export interface RateRule {
  /** Burst size, also the bucket ceiling. */
  capacity: number;
  /** Sustained tokens per second. */
  refillPerSec: number;
}

export const ROUTE_CLASSES = ["state", "action", "join", "photo", "mediaRun", "mediaGet", "create", "auth", "api"] as const;
export type RouteClass = (typeof ROUTE_CLASSES)[number];

export interface Decision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** Interface a shared backend (Redis, Postgres, sidecar) implements later. The in-memory limiter below is the default. */
export interface RateLimiter {
  consume(key: string, cls: RouteClass, cost?: number): Decision | Promise<Decision>;
}

export const limiterKey = (scope: "game" | "ip" | "host", id: string) => `${scope}:${id}`;

interface Bucket { tokens: number; at: number }

export class TokenBucketLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  private now: () => number;
  private maxKeys: number;

  constructor(private rules: Partial<Record<RouteClass, RateRule>>, opts: { now?: () => number; maxKeys?: number } = {}) {
    this.now = opts.now ?? Date.now;
    this.maxKeys = opts.maxKeys ?? 50_000;
  }

  consume(key: string, cls: RouteClass, cost = 1): Decision {
    const rule = this.rules[cls];
    if (!rule) throw new Error(`No rate rule for route class ${cls}`);
    const id = `${cls}|${key}`;
    const t = this.now();
    let b = this.buckets.get(id);
    if (b) {
      this.buckets.delete(id); // re-insert below so Map order is least recently used first
      b.tokens = Math.min(rule.capacity, b.tokens + ((t - b.at) / 1000) * rule.refillPerSec);
      b.at = t;
    } else {
      b = { tokens: rule.capacity, at: t };
    }
    this.buckets.set(id, b);
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    if (cost <= b.tokens && cost <= rule.capacity) {
      b.tokens -= cost;
      return { allowed: true, remaining: Math.floor(b.tokens), retryAfterMs: 0 };
    }
    const missing = Math.min(cost, rule.capacity) - b.tokens;
    return { allowed: false, remaining: Math.floor(b.tokens), retryAfterMs: Math.ceil((missing / rule.refillPerSec) * 1000) };
  }

  size() { return this.buckets.size; }
}
