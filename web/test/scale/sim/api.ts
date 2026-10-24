// Client over the REAL route handlers (no HTTP stack, no middleware). Import this only from a test
// file that mocks "@/auth" with ./auth-mock (see any *.test.ts here).
import * as createRoute from "@/app/api/rooms/route";
import * as joinRoute from "@/app/api/rooms/[code]/join/route";
import * as stateRoute from "@/app/api/rooms/[code]/state/route";
import * as actionRoute from "@/app/api/rooms/[code]/action/route";
import { asHost } from "./auth-mock";

export interface Call {
  status: number;
  text: string;
  bytes: number;
  /** Wall clock ms for handler plus body read. */
  ms: number;
  json<T = any>(): T;
}

async function run(fn: () => Promise<Response>): Promise<Call> {
  const t0 = performance.now();
  const res = await fn();
  const text = await res.text();
  const ms = performance.now() - t0;
  return { status: res.status, text, bytes: Buffer.byteLength(text), ms, json: () => JSON.parse(text) };
}

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const URL0 = "http://sim.local";

export interface Auth { pid?: string; token?: string }

export const api = {
  create: (host: string | null, body: unknown) => run(() => asHost(host, () =>
    createRoute.POST(new Request(`${URL0}/api/rooms`, { method: "POST", body: JSON.stringify(body) })))),

  join: (code: string, body: unknown) => run(() =>
    joinRoute.POST(new Request(`${URL0}/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify(body) }), ctx(code))),

  state: (code: string, o: { role?: "screen" | "player" | "host"; v?: number; host?: string | null } & Auth = {}) => run(() => asHost(o.host ?? null, () => {
    const q = new URLSearchParams();
    if (o.role) q.set("role", o.role);
    if (o.v !== undefined) q.set("v", String(o.v));
    const headers: Record<string, string> = {};
    if (o.pid) headers["x-player-id"] = o.pid;
    if (o.token) headers["x-player-token"] = o.token;
    return stateRoute.GET(new Request(`${URL0}/api/rooms/${code}/state?${q}`, { headers }), ctx(code));
  })),

  action: (code: string, body: unknown, o: { host?: string | null } & Auth = {}) => run(() => asHost(o.host ?? null, () => {
    const headers: Record<string, string> = {};
    if (o.pid) headers["x-player-id"] = o.pid;
    if (o.token) headers["x-player-token"] = o.token;
    return actionRoute.POST(new Request(`${URL0}/api/rooms/${code}/action`, { method: "POST", headers, body: JSON.stringify(body) }), ctx(code));
  })),
};
