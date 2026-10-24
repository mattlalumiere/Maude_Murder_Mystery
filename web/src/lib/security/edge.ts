import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "./headers";
import { RATE_LIMITS } from "./limits";
import { TokenBucketLimiter, limiterKey, type RateLimiter, type RouteClass } from "./rate-limit";
import { REQUEST_ID_HEADER, newRequestId, resolveRequestId } from "./request-id";

export interface Route { cls: RouteClass; gameCode?: string }

/** Maps an API request to its rate class and game scope. Returns null for anything that must never be limited. */
export function classifyRoute(method: string, path: string): Route | null {
  if (path === "/api/healthz" || path === "/api/readyz") return null;
  if (path.startsWith("/api/auth/") || path === "/api/auth") return { cls: "auth" };
  if (path === "/api/rooms") return { cls: "create" };
  const m = /^\/api\/rooms\/([^/]+)\/(state|action|join|photo|media)(?:\/([^/]+))?\/?$/.exec(path);
  if (m) {
    const gameCode = m[1].toUpperCase();
    switch (m[2]) {
      case "state": return { cls: "state", gameCode };
      case "action": return { cls: "action", gameCode };
      case "join": return { cls: "join", gameCode };
      case "photo": return { cls: "photo", gameCode };
      case "media": return m[3] === "run" ? { cls: "mediaRun", gameCode } : { cls: "mediaGet", gameCode };
    }
  }
  if (path.startsWith("/api/")) return { cls: "api" };
  void method;
  return null;
}

/** The client IP as seen by the last trusted proxy. The leftmost X-Forwarded-For entry is attacker controlled, so count from the right. */
export function clientIp(headers: Headers, trustedHops: number): string {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "unknown";
  return parts[Math.max(0, parts.length - Math.max(1, trustedHops))] ?? "unknown";
}

export interface PolicyOptions {
  dev: boolean;
  tls: boolean;
  rateLimit: boolean;
  trustedProxyHops: number;
  now?: () => number;
  /** Replace with a shared backend later. Both scopes must share semantics with TokenBucketLimiter. */
  limiters?: { game: RateLimiter; ip: RateLimiter };
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function createPolicy(o: PolicyOptions) {
  const limiters = o.limiters ?? {
    game: new TokenBucketLimiter(RATE_LIMITS.game, { now: o.now }),
    ip: new TokenBucketLimiter(RATE_LIMITS.ip, { now: o.now }),
  };

  const decorate = (res: NextResponse, path: string, requestId: string) => {
    for (const [k, v] of Object.entries(securityHeaders({ path, dev: o.dev, tls: o.tls }))) res.headers.set(k, v);
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  };

  const deny = (status: number, body: string, path: string, requestId: string, retryAfterSec?: number) => {
    const res = NextResponse.json({ error: body }, { status });
    if (retryAfterSec) res.headers.set("Retry-After", String(retryAfterSec));
    return decorate(res, path, requestId);
  };

  return {
    handle(req: NextRequest): NextResponse {
      const path = req.nextUrl.pathname;
      const requestId = resolveRequestId(req.headers.get(REQUEST_ID_HEADER), newRequestId);
      const isApi = path.startsWith("/api/");

      // CSRF defence in depth: browsers always send Origin on cross-site POSTs. Header-token clients send none.
      if (isApi && !SAFE.has(req.method)) {
        const origin = req.headers.get("origin");
        if (origin) {
          const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
          let originHost = "";
          try { originHost = new URL(origin).host; } catch { /* malformed origin is rejected below */ }
          if (originHost !== host) return deny(403, "Cross-origin request refused", path, requestId);
        }
      }

      if (isApi && o.rateLimit) {
        const route = classifyRoute(req.method, path);
        if (route) {
          const ip = limiters.ip.consume(limiterKey("ip", clientIp(req.headers, o.trustedProxyHops)), route.cls);
          const game = route.gameCode ? limiters.game.consume(limiterKey("game", route.gameCode), route.cls) : null;
          // Both are Decision (sync) for the in-memory limiter. A shared async backend should be awaited in an async policy variant.
          const bad = [ip, game].find((d) => d && "allowed" in d && !d.allowed) as { retryAfterMs: number } | undefined;
          if (bad) return deny(429, "Too many requests", path, requestId, Math.max(1, Math.ceil(bad.retryAfterMs / 1000)));
        }
      }

      const headers = new Headers(req.headers);
      headers.set(REQUEST_ID_HEADER, requestId);
      return decorate(NextResponse.next({ request: { headers } }), path, requestId);
    },
  };
}
