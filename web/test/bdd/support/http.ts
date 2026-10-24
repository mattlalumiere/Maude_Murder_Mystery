// Calls the real Next route handlers in process with real Request objects, optionally through the
// real middleware policy first (rate limits, CSRF, headers). A route file that does not exist
// yields a 404, which is what Next would answer.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { createPolicy } from "../../../src/lib/security/edge";
import { sessionStore } from "./seams";

const API = resolve(__dirname, "../../../src/app/api");

export interface CallOpts {
  /** Signed-in host id (the auth seam). null = anonymous. undefined = the world's session. */
  host?: string | null;
  player?: { id: string; token: string } | null;
  query?: Record<string, string | number>;
  body?: unknown;
  raw?: BodyInit;
  headers?: Record<string, string>;
  ip?: string;
  /** Run the middleware policy first. */
  mw?: boolean;
}
export interface Res { status: number; headers: Headers; text: string; json: any; ms: number }

interface Match { file: string; params: Record<string, string> }

function resolveRoute(segs: string[]): Match | null {
  const rec = (dir: string, i: number, params: Record<string, string>): Match | null => {
    if (i === segs.length) {
      const f = join(dir, "route.ts");
      return existsSync(f) ? { file: f, params } : null;
    }
    let names: string[] = [];
    try { names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()); } catch { return null; }
    if (names.includes(segs[i])) { const r = rec(join(dir, segs[i]), i + 1, params); if (r) return r; }
    for (const n of names) {
      const m = /^\[([^\].]+)\]$/.exec(n);
      if (m) { const r = rec(join(dir, n), i + 1, { ...params, [m[1]]: segs[i] }); if (r) return r; }
    }
    return null;
  };
  return rec(API, 0, {});
}

const policies = new WeakMap<object, ReturnType<typeof createPolicy>>();
export function policyFor(w: { clock: { now(): number } }) {
  let p = policies.get(w);
  if (!p) {
    p = createPolicy({ dev: true, tls: false, rateLimit: true, trustedProxyHops: 1, now: () => w.clock.now() });
    policies.set(w, p);
  }
  return p;
}

function wrap(res: Response, ms: number, text: string): Res {
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, text, json, ms };
}

export async function callApi(w: { clock: { now(): number } }, method: string, path: string, o: CallOpts): Promise<Res> {
  const url = new URL(path, "http://localhost:3000");
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.player) { headers["x-player-id"] = o.player.id; headers["x-player-token"] = o.player.token; }
  if (o.ip) headers["x-forwarded-for"] = o.ip;
  let body: BodyInit | undefined = o.raw;
  if (body === undefined && o.body !== undefined) { body = JSON.stringify(o.body); headers["content-type"] ??= "application/json"; }
  const init: RequestInit = { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body };

  const t0 = performance.now();
  let mwHeaders: Headers | null = null;
  if (o.mw) {
    const out = policyFor(w).handle(new NextRequest(url, init as any));
    if (out.headers.get("x-middleware-next") !== "1") {
      const text = await out.text();
      return wrap(out, performance.now() - t0, text);
    }
    mwHeaders = out.headers;
  }

  const segs = url.pathname.replace(/^\/+|\/+$/g, "").split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (segs[0] !== "api") return { status: 404, headers: new Headers(), text: "Not found", json: null, ms: 0 };
  const match = resolveRoute(segs.slice(1));
  if (!match) return { status: 404, headers: new Headers(), text: "Not found", json: null, ms: performance.now() - t0 };
  const mod = require(match.file);
  const fn = mod[method];
  if (typeof fn !== "function") return { status: 405, headers: new Headers(), text: "Method not allowed", json: null, ms: performance.now() - t0 };
  const req = new Request(url, init);
  const res: Response = await sessionStore.run({ hostId: o.host ?? null }, () => fn(req, { params: Promise.resolve(match.params) }));
  const text = await res.text();
  if (mwHeaders) mwHeaders.forEach((v, k) => { if (!k.startsWith("x-middleware")) { try { res.headers.set(k, v); } catch { /* immutable */ } } });
  return wrap(res, performance.now() - t0, text);
}
