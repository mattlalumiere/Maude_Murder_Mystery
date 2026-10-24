import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { classifyRoute, clientIp, createPolicy } from "@/lib/security/edge";

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, init);

describe("classifyRoute", () => {
  it("maps API paths to route classes and game scope", () => {
    expect(classifyRoute("GET", "/api/rooms/abcd/state")).toEqual({ cls: "state", gameCode: "ABCD" });
    expect(classifyRoute("POST", "/api/rooms/ABCD/action")).toEqual({ cls: "action", gameCode: "ABCD" });
    expect(classifyRoute("POST", "/api/rooms/ABCD/join")).toEqual({ cls: "join", gameCode: "ABCD" });
    expect(classifyRoute("POST", "/api/rooms/ABCD/photo")).toEqual({ cls: "photo", gameCode: "ABCD" });
    expect(classifyRoute("GET", "/api/rooms/ABCD/photo")).toEqual({ cls: "photo", gameCode: "ABCD" });
    expect(classifyRoute("POST", "/api/rooms/ABCD/media/run")).toEqual({ cls: "mediaRun", gameCode: "ABCD" });
    expect(classifyRoute("GET", "/api/rooms/ABCD/media/xyz")).toEqual({ cls: "mediaGet", gameCode: "ABCD" });
    expect(classifyRoute("POST", "/api/rooms")).toEqual({ cls: "create" });
    expect(classifyRoute("POST", "/api/auth/callback/google")).toEqual({ cls: "auth" });
  });
  it("returns null for pages, static assets and health endpoints", () => {
    expect(classifyRoute("GET", "/host/ABCD")).toBeNull();
    expect(classifyRoute("GET", "/_next/static/a.js")).toBeNull();
    expect(classifyRoute("GET", "/api/healthz")).toBeNull();
    expect(classifyRoute("GET", "/api/readyz")).toBeNull();
  });
});

describe("clientIp", () => {
  it("takes the entry added by the last trusted proxy, not the spoofable first one", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), 1)).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" }), 2)).toBe("1.2.3.4");
  });
  it("falls back to unknown", () => expect(clientIp(new Headers(), 1)).toBe("unknown"));
});

describe("policy", () => {
  let now = 0;
  beforeEach(() => { now = 1_000_000; });
  const policy = (extra: Partial<Parameters<typeof createPolicy>[0]> = {}) => createPolicy({ dev: false, tls: false, rateLimit: true, trustedProxyHops: 1, now: () => now, ...extra });

  it("adds security headers and a request id to page responses and does not block them", () => {
    const res = policy().handle(req("/host/ABCD"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("propagates a valid incoming request id to the response and to the downstream request", () => {
    const res = policy().handle(req("/api/healthz", { headers: { "x-request-id": "client-req-0001" } }));
    expect(res.headers.get("x-request-id")).toBe("client-req-0001");
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe("client-req-0001");
  });

  it("rate limits per game and answers 429 with Retry-After", () => {
    const p = policy();
    const hit = () => p.handle(req("/api/rooms/ABCD/join", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" } }));
    const codes = Array.from({ length: 60 }, () => hit().status);
    expect(codes.includes(429)).toBe(true);
    const denied = hit();
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(denied.headers.get("x-request-id")).toBeTruthy();
  });

  it("one noisy game does not throttle another game from a different IP", () => {
    const p = policy();
    for (let i = 0; i < 200; i++) p.handle(req("/api/rooms/AAAA/join", { method: "POST", headers: { "x-forwarded-for": "1.1.1.1" } }));
    expect(p.handle(req("/api/rooms/BBBB/join", { method: "POST", headers: { "x-forwarded-for": "2.2.2.2" } })).status).toBe(200);
  });

  it("never rate limits health probes or static assets", () => {
    const p = policy();
    for (let i = 0; i < 2000; i++) expect(p.handle(req("/api/healthz")).status).toBe(200);
    for (let i = 0; i < 2000; i++) expect(p.handle(req("/_next/static/x.js")).status).toBe(200);
  });

  it("can be turned off", () => {
    const p = policy({ rateLimit: false });
    for (let i = 0; i < 500; i++) expect(p.handle(req("/api/rooms/ABCD/join", { method: "POST" })).status).toBe(200);
  });

  it("rejects cross-origin state changing API calls, allows same-origin and header-token calls without Origin", () => {
    const p = policy();
    const evil = p.handle(req("/api/rooms", { method: "POST", headers: { origin: "https://evil.example", host: "localhost:3000" } }));
    expect(evil.status).toBe(403);
    const same = p.handle(req("/api/rooms", { method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" } }));
    expect(same.status).toBe(200);
    const none = p.handle(req("/api/rooms", { method: "POST", headers: { host: "localhost:3000" } }));
    expect(none.status).toBe(200);
  });

  it("honours x-forwarded-host for the origin check behind a proxy", () => {
    const p = policy();
    const ok = p.handle(req("/api/rooms", { method: "POST", headers: { origin: "https://party.example", "x-forwarded-host": "party.example", host: "10.0.0.5:3000" } }));
    expect(ok.status).toBe(200);
  });

  it("sends HSTS only with tls", () => {
    expect(policy().handle(req("/")).headers.get("strict-transport-security")).toBeNull();
    expect(policy({ tls: true }).handle(req("/")).headers.get("strict-transport-security")).toContain("max-age");
  });
});
