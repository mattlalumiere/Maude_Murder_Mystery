import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security/headers";

const directive = (csp: string, name: string) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ") || s === name);

describe("buildCsp", () => {
  const csp = buildCsp({ dev: false, tls: false });
  it("denies framing, objects and foreign bases", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });
  it("uses no external origins at all", () => {
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).not.toContain("*");
  });
  it("forbids eval in production but allows it in dev", () => {
    expect(directive(csp, "script-src")).not.toContain("unsafe-eval");
    expect(directive(buildCsp({ dev: true, tls: false }), "script-src")).toContain("'unsafe-eval'");
  });
  it("allows what the app needs: own images, blobs, data, websocket-free connect", () => {
    expect(directive(csp, "img-src")).toContain("blob:");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "worker-src")).toContain("'self'");
  });
  it("upgrades insecure requests only behind TLS", () => {
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ dev: false, tls: true })).toContain("upgrade-insecure-requests");
  });
  it("switches to nonce scripts when a nonce is given", () => {
    const s = directive(buildCsp({ dev: false, tls: false, nonce: "N0nce" }), "script-src")!;
    expect(s).toContain("'nonce-N0nce'");
    expect(s).not.toContain("'unsafe-inline'");
  });
});

describe("securityHeaders", () => {
  it("sets the baseline set", () => {
    const h = securityHeaders({ path: "/host/ABCD", dev: false, tls: false });
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
  it("sends HSTS only when TLS is asserted", () => {
    expect(securityHeaders({ path: "/", dev: false, tls: false })["Strict-Transport-Security"]).toBeUndefined();
    expect(securityHeaders({ path: "/", dev: false, tls: true })["Strict-Transport-Security"]).toMatch(/max-age=\d+; includeSubDomains/);
  });
  it("denies camera, microphone and geolocation except camera on player pages", () => {
    const host = securityHeaders({ path: "/host/ABCD", dev: false, tls: false })["Permissions-Policy"];
    expect(host).toContain("camera=()");
    expect(host).toContain("microphone=()");
    expect(host).toContain("geolocation=()");
    const play = securityHeaders({ path: "/play/ABCD", dev: false, tls: false })["Permissions-Policy"];
    expect(play).toContain("camera=(self)");
    expect(play).toContain("microphone=()");
    expect(play).toContain("geolocation=()");
    expect(securityHeaders({ path: "/join/ABCD", dev: false, tls: false })["Permissions-Policy"]).toContain("camera=(self)");
  });
  it("marks API responses uncacheable", () => {
    expect(securityHeaders({ path: "/api/rooms/ABCD/state", dev: false, tls: false })["Cache-Control"]).toBe("no-store");
    expect(securityHeaders({ path: "/host/ABCD", dev: false, tls: false })["Cache-Control"]).toBeUndefined();
  });
});
