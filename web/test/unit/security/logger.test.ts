import { describe, expect, it } from "vitest";
import { createLogger, redact, REDACTED } from "@/lib/security/logger";

describe("redact", () => {
  it("redacts sensitive keys at any depth, case-insensitively", () => {
    const out = redact({
      a: 1,
      nested: { Authorization: "Bearer abc", deep: [{ "x-player-token": "t0k", ok: "fine" }] },
      OverrideCode: "swordfish",
      overrideHash: "h",
      password: "p",
      cookie: "c=1",
      "set-cookie": "s=1",
      apiKey: "k",
      photoKey: "G/photos/p1.jpg",
      killerId: "x",
      truth: { story: "x" },
    }) as Record<string, unknown>;
    const s = JSON.stringify(out);
    for (const bad of ["Bearer abc", "t0k", "swordfish", "G/photos", "\"p\"", "c=1", "s=1", "\"k\"", "\"x\""]) expect(s).not.toContain(bad);
    expect(s).toContain("fine");
    expect((out as { a: number }).a).toBe(1);
  });

  it("redacts the code field only when it is an override body", () => {
    expect(JSON.stringify(redact({ type: "override", code: "hunter2", cmd: "NUDGE" }))).not.toContain("hunter2");
    expect(JSON.stringify(redact({ code: "ABCD" }))).toContain("ABCD");
  });

  it("scrubs secret-looking values inside free text", () => {
    const s = String(redact("failed with Authorization: Bearer abc.def.ghi and x-player-token: AbC123xyz_-"));
    expect(s).not.toContain("abc.def.ghi");
    expect(s).not.toContain("AbC123xyz_-");
  });

  it("drops Buffers and typed arrays (photos) to a size marker", () => {
    const out = JSON.stringify(redact({ body: Buffer.from("secretbytes"), u: new Uint8Array(4) }));
    expect(out).not.toContain("secretbytes");
    expect(out).toContain("bytes");
  });

  it("survives cycles, deep nesting and hostile getters", () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 200; i++) { deep.c = {}; deep = deep.c as Record<string, unknown>; }
    expect(() => redact(root)).not.toThrow();
    const evil = {};
    Object.defineProperty(evil, "boom", { enumerable: true, get() { throw new Error("x"); } });
    expect(() => redact(evil)).not.toThrow();
  });

  it("serialises Errors without leaking request data attached to them", () => {
    const e = Object.assign(new Error("db down"), { request: { token: "tt" } });
    const s = JSON.stringify(redact(e));
    expect(s).toContain("db down");
    expect(s).not.toContain("tt\"");
  });

  it("fuzz: a canary under any sensitive key never survives, at random depth and shape", () => {
    const keys = ["token", "x-player-token", "authorization", "cookie", "password", "secret", "apiKey", "api_key", "overrideCode", "overrideHash", "overrideSalt", "photoKey", "photo", "bytes", "nudges", "advanced", "backstory", "AUTH_SECRET"];
    let seed = 42;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 300; i++) {
      const canary = `CANARY${i}Z`;
      const key = keys[Math.floor(rnd() * keys.length)];
      const mixed = rnd() < 0.5 ? key.toUpperCase() : key;
      let v: unknown = { [mixed]: rnd() < 0.5 ? canary : { inner: [canary] }, keep: "ok" };
      const depth = Math.floor(rnd() * 6);
      for (let d = 0; d < depth; d++) v = rnd() < 0.5 ? { w: v, x: [1, 2] } : [v, { y: 1 }];
      expect(JSON.stringify(redact(v))).not.toContain(canary);
    }
  });
});

describe("createLogger", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, sink: (l: string) => lines.push(l) };
  };

  it("writes one JSON line with level, msg, time and bound fields", () => {
    const { lines, sink } = collect();
    const log = createLogger({ level: "info", sink, now: () => 1700000000000, base: { cell: "c1" } });
    log.info("hello", { requestId: "r1" });
    const o = JSON.parse(lines[0]);
    expect(o).toMatchObject({ level: "info", msg: "hello", cell: "c1", requestId: "r1", time: "2023-11-14T22:13:20.000Z" });
  });

  it("filters below the configured level", () => {
    const { lines, sink } = collect();
    const log = createLogger({ level: "warn", sink });
    log.debug("d"); log.info("i"); log.warn("w"); log.error("e");
    expect(lines.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  it("redacts fields and the message itself", () => {
    const { lines, sink } = collect();
    const log = createLogger({ level: "debug", sink });
    log.info("got x-player-token: ZZZsecretZZZ", { headers: { "x-player-token": "ZZZsecretZZZ" } });
    expect(lines[0]).not.toContain("ZZZsecretZZZ");
  });

  it("child loggers inherit and extend bound fields", () => {
    const { lines, sink } = collect();
    const log = createLogger({ level: "info", sink, base: { cell: "c1" } }).child({ requestId: "r9" });
    log.info("x");
    expect(JSON.parse(lines[0])).toMatchObject({ cell: "c1", requestId: "r9" });
  });

  it("never throws even if the sink throws", () => {
    const log = createLogger({ level: "info", sink: () => { throw new Error("disk"); } });
    expect(() => log.error("x")).not.toThrow();
  });
});
