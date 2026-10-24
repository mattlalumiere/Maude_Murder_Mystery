// T3 part 3a: reproductions of the weaknesses in W10's report (docs/platform/security/practices.md section 3,
// feedback/to-W*-from-W10.md) and W2's ambiguity list (feedback/to-W4-from-W2.md, to-W7-from-W2.md).
// Each knownDefect() asserts the SECURE behaviour and is expected to fail today. When a developer fixes the defect the
// test flips to a vitest failure ("expected to fail but passed") and the knownDefect() wrapper must be replaced by it().
import { existsSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlayer, authPlayer, createRoom, override, startGame } from "@/lib/engine";
import { seededRandom, setRuntime } from "@/lib/ids";
import { createStore } from "@/lib/storage";
import { LIMITS } from "@/lib/security/limits";
import { ManualClock } from "../unit/engine/helpers/runtime";
import { knownDefect } from "./_support";
import { asPlayer, boot, bodyOf, ctx, fakeJpeg, getMediaStore, getStore, hostSession, loadRoom, mkReq, mutate, newGame, routes, type Booted } from "./_app";
vi.mock("@/auth", async () => ({ hostIdFromSession: async () => (await import("./_app")).hostSession.id }));

const SRC = new URL("../../src/", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, SRC), "utf8");

let app: Booted;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeAll(async () => { app = await boot(); });
afterAll(async () => { await app.cleanup(); });
beforeEach(() => { hostSession.id = null; errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => errSpy.mockRestore());

const act = async (code: string, json: unknown, headers: Record<string, string> = {}) => (await routes.action()).POST(mkReq("POST", "/a", { json, headers }), ctx(code));

describe("[T3-005] player tokens at rest (F2)", () => {
  knownDefect("the stored room holds no clear text player token", async () => {
    // KNOWN-DEFECT T3-005: engine.ts addPlayer stores `token: rid(18)`; anyone with state store read access can impersonate every player
    const g = await newGame({ host: "d-tok", mix: ["adult", "adult"] });
    const stored = JSON.stringify(await getStore().get(g.code));
    for (const p of g.players) expect(stored, `token of ${p.name} stored in clear`).not.toContain(p.token);
  });
  it("the credentials still authenticate (guard so the fix keeps working)", async () => {
    const g = await newGame({ host: "d-tok2", mix: ["adult", "adult"] });
    const room = await loadRoom(g.code);
    expect(authPlayer(room, g.players[0].id, g.players[0].token).id).toBe(g.players[0].id);
    expect(() => authPlayer(room, g.players[0].id, g.players[1].token)).toThrow();
  });
});

describe("[T3-006] override code strength (F5)", () => {
  knownDefect("an override code shorter than 6 characters is refused", async () => {
    // KNOWN-DEFECT T3-006: engine-limits.ts overrideCodeMin is 4 (security/limits.ts minOverrideCodeChars is 6)
    await expect(createRoom("d-ovr", "abcde")).rejects.toThrow();
  });
  knownDefect("the override code is case sensitive", async () => {
    // KNOWN-DEFECT T3-006: engine.ts hashCode lower-cases and trims, shrinking the space
    const room = await createRoom("d-ovr2", "AbCdEf-123");
    await mutate(room.code, async (r) => { for (const [n, a] of [["a", "adult"], ["b", "adult"], ["c", "kid"], ["d", "kid"]] as const) addPlayer(r, n, a, false); await startGame(r); });
    const r = await loadRoom(room.code);
    expect(() => override(r, "abcdef-123", "NUDGE", false)).toThrow();
  });
  it("whitespace around the code does not matter but inner content does; a wrong code never reveals which part was wrong", async () => {
    const room = await createRoom("d-ovr3", "correct-horse");
    await mutate(room.code, async (r) => { for (const [n, a] of [["a", "adult"], ["b", "adult"], ["c", "kid"], ["d", "kid"]] as const) addPlayer(r, n, a, false); await startGame(r); });
    const r = await loadRoom(room.code);
    const msgs = new Set<string>();
    for (const bad of ["correct-hors", "correct-horsee", "x", "", "correct horse", "correct-horse\0"]) {
      try { override(r, bad, "NUDGE", false); expect.fail("accepted " + bad); } catch (e) { msgs.add((e as Error).message); }
      r.failedOverrides = 0; r.lockedUntil = 0;
    }
    expect(msgs.size).toBe(1);
  });
  it("three wrong codes lock for 10 minutes (even the right code), then it unlocks; non-string codes count as wrong", async () => {
    const clock = new ManualClock();
    const restore = setRuntime({ clock, random: seededRandom(9) });
    try {
      const room = await createRoom("d-ovr4", "correct-horse");
      for (const [n, a] of [["a", "adult"], ["b", "adult"], ["c", "kid"], ["d", "kid"]] as const) addPlayer(room, n, a, false);
      await startGame(room);
      const tries: unknown[] = [123, null, { toString: () => "correct-horse" }, ["correct-horse"]];
      const statuses: number[] = [];
      for (const t of tries) { try { override(room, t as string, "NUDGE", false); statuses.push(200); } catch (e) { statuses.push((e as { status: number }).status); } }
      expect(statuses.slice(0, 3)).toEqual([403, 403, 429]);
      expect(statuses[3]).toBe(429);
      expect(() => override(room, "correct-horse", "NUDGE", false)).toThrow(/Gerald|locked/i);
      clock.advance(10 * 60 * 1000 + 1);
      expect(override(room, "correct-horse", "NUDGE", false).message).toBeTruthy();
    } finally { restore(); }
  });
  knownDefect("[T3-037] failed attempts accumulate per host id, not only per room", async () => {
    // KNOWN-DEFECT T3-037: engine.ts failedOverrides lives on the room; a host brute forces a fresh room each 3 tries
    // (only their own rooms are attackable, hence low). The documented fix locks on host id as well.
    hostSession.id = "d-brute";
    const rooms = [];
    for (let i = 0; i < 2; i++) {
      const room = await createRoom("d-brute", "correct-horse");
      await mutate(room.code, async (r) => { for (const [n, a] of [["a", "adult"], ["b", "adult"], ["c", "kid"], ["d", "kid"]] as const) addPlayer(r, n, a, false); await startGame(r); });
      rooms.push(room.code);
    }
    for (let i = 0; i < 3; i++) await act(rooms[0], { type: "override", code: "wrong" + i, cmd: "NUDGE" });
    const res = await act(rooms[1], { type: "override", code: "correct-horse", cmd: "NUDGE" });
    expect(res.status, "the same host was allowed to continue guessing on a second room").toBe(429);
  });
  knownDefect("[T3-029] an unknown override command is a 400 and does not 500", async () => {
    // KNOWN-DEFECT T3-029: action/route.ts passes cmd through; override() returns undefined and json(undefined) throws (500). The correct code also resets failedOverrides.
    const g = await newGame({ start: true, host: "d-cmd", overrideCode: "correct-horse" });
    hostSession.id = g.hostId;
    const res = await act(g.code, { type: "override", code: "correct-horse", cmd: "BOGUS" });
    expect(res.status).toBe(400);
  });
});

describe("[T3-007] join code space (W10 finding 4)", () => {
  knownDefect("new games get a 6 character code", async () => {
    // KNOWN-DEFECT T3-007: ids.ts allocateJoinCode starts at 4 characters; at 10,000 live games 4 chars of a 30 letter alphabet is a ~1% hit rate per guess
    hostSession.id = "d-code";
    const { POST } = await routes.rooms();
    const lens: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await POST(mkReq("POST", "/r", { json: { overrideCode: "correct-horse" } }), ctx(""));
      lens.push(((await res.json()) as { code: string }).code.length);
    }
    expect(Math.min(...lens)).toBeGreaterThanOrEqual(LIMITS.joinCodeLength);
  });
});

describe("[T3-008] request body handling (F11)", () => {
  const bad: [string, string][] = [["null", "null"], ["a JSON string", '"start"'], ["a number", "42"], ["truncated JSON", "{"], ["empty body", ""], ["not JSON", "type=start"]];
  for (const [name, body] of bad) {
    knownDefect(`action: ${name} is a 400`, async () => {
      // KNOWN-DEFECT T3-008: action/route.ts:25 `(await req.json()) as Body`
      const g = await newGame({ host: "d-body", mix: ["adult"] });
      hostSession.id = g.hostId;
      const res = await (await routes.action()).POST(mkReq("POST", "/a", { body }), ctx(g.code));
      expect(res.status).toBe(400);
    });
  }
  knownDefect("join: null body is a 400", async () => {
    const g = await newGame({ host: "d-body2", mix: ["adult"] });
    const res = await (await routes.join()).POST(mkReq("POST", "/j", { body: "null" }), ctx(g.code));
    expect(res.status).toBe(400);
  });
  knownDefect("create: null body is a 400", async () => {
    hostSession.id = "d-body3";
    const res = await (await routes.rooms()).POST(mkReq("POST", "/r", { body: "null" }), ctx(""));
    expect(res.status).toBe(400);
  });
  knownDefect("a body over maxJsonBodyBytes (32 KiB) is refused with 413 before it is parsed", async () => {
    // KNOWN-DEFECT T3-008b: no size cap on JSON routes
    const g = await newGame({ host: "d-body4", mix: ["adult"] });
    const res = await (await routes.join()).POST(mkReq("POST", "/j", { json: { name: "x", ageGroup: "adult", pad: "A".repeat(2 * 1024 * 1024) } }), ctx(g.code));
    expect(res.status).toBe(413);
  });
});

describe("[T3-019] [T3-020] spend and quota caps at creation", () => {
  knownDefect("the budget cap is clamped to maxAiSpendUsdPerGame (50)", async () => {
    // KNOWN-DEFECT T3-019: sanitize.ts money() allows 500
    hostSession.id = "d-cap";
    const res = await (await routes.rooms()).POST(mkReq("POST", "/r", { json: { overrideCode: "correct-horse", capUsd: 1e9 } }), ctx(""));
    const room = await loadRoom(((await res.json()) as { code: string }).code);
    expect(room.budget.capUsd).toBeLessThanOrEqual(LIMITS.maxAiSpendUsdPerGame);
  });
  knownDefect("a host cannot hold more than maxActiveGamesPerHost (3) live games", async () => {
    // KNOWN-DEFECT T3-020: rooms/route.ts has no per host quota
    hostSession.id = "d-quota";
    const { POST } = await routes.rooms();
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.maxActiveGamesPerHost + 2; i++) statuses.push((await POST(mkReq("POST", "/r", { json: { overrideCode: "correct-horse" } }), ctx(""))).status);
    expect(statuses.slice(0, LIMITS.maxActiveGamesPerHost).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(LIMITS.maxActiveGamesPerHost).every((s) => s === 429), `statuses ${statuses}`).toBe(true);
  }, 30_000);
});

describe("[T3-024] kick (W2 ambiguity 3)", () => {
  it("kick works in the lobby", async () => {
    const g = await newGame({ host: "d-kick1", mix: ["adult", "adult"] });
    hostSession.id = g.hostId;
    expect((await act(g.code, { type: "kick", playerId: g.players[0].id })).status).toBe(200);
    expect((await loadRoom(g.code)).players).toHaveLength(1);
  });
  knownDefect("kick after the game started is refused (it orphans a character and can remove the killer)", async () => {
    // KNOWN-DEFECT T3-024: action/route.ts:44 has no phase check
    const g = await newGame({ phase: "act1", host: "d-kick2" });
    hostSession.id = g.hostId;
    const res = await act(g.code, { type: "kick", playerId: g.players[0].id });
    expect(res.status).toBe(409);
  });
  it("the host cannot kick a player id that does not exist or from another game's list (no cross-game effect)", async () => {
    const a = await newGame({ host: "d-kick3", mix: ["adult", "adult"] });
    const b = await newGame({ host: "d-kick4", mix: ["adult", "adult"], names: "B" });
    hostSession.id = a.hostId;
    await act(a.code, { type: "kick", playerId: b.players[0].id });
    expect((await loadRoom(b.code)).players).toHaveLength(2);
  });
});

describe("[T3-034] host added players hold a token (device-less guests)", () => {
  knownDefect("a device-less adult is never cast as the killer (the host holds that player's token and could read the card)", async () => {
    // KNOWN-DEFECT T3-034: addPlayer(host action) returns the token to the host; castPlayers picks the killer among all adults.
    // A host who registers every adult as device-less can read the killer's card without the override code.
    let hostCouldRead = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const restore = setRuntime({ clock: new ManualClock(Date.UTC(2026, 0, 1) + seed), random: seededRandom(seed) });
      try {
        const room = await createRoom("d-ghost", "correct-horse");
        for (let i = 0; i < 3; i++) addPlayer(room, `Real${i}`, "adult", false, true);
        for (let i = 0; i < 3; i++) addPlayer(room, `Ghost${i}`, "adult", false, false);
        addPlayer(room, "Kid", "kid", false, true);
        await startGame(room);
        const killerPlayer = room.players.find((p) => p.characterId === room.case!.killerId)!;
        if (!killerPlayer.hasDevice) hostCouldRead++;
      } finally { restore(); }
    }
    expect(hostCouldRead, `host held the killer's token in ${hostCouldRead}/40 games`).toBe(0);
  }, 60_000);
});

describe("[T3-016] [T3-017] photo retention and exposure to image models", () => {
  const blobCount = async (code: string, gameId: string) => {
    const m = getMediaStore();
    return [...new Set([code, gameId])].reduce(async (acc, id) => (await acc) + (await m.list(`local-0/games/${id}`)).entries.filter((e) => e.key.includes("/photos/")).length, Promise.resolve(0));
  };
  it("photos are purged when the game reaches the Reveal (W2 ambiguity 5)", async () => {
    // KNOWN-DEFECT T3-016: engine.ts setPhase("reveal") does not touch the media store
    const g = await newGame({ host: "d-ret", mix: ["adult", "adult", "adult", "kid"], names: "R" });
    const { POST } = await routes.photo();
    const up = await POST(mkReq("POST", "/p", { body: fakeJpeg() as unknown as BodyInit, headers: { "x-consent": "self", ...asPlayer(g.players[0]) } }), ctx(g.code));
    expect(up.status).toBe(200);
    expect(await blobCount(g.code, g.gameId)).toBe(1);
    hostSession.id = g.hostId;
    await act(g.code, { type: "start" });
    for (let i = 0; i < 7; i++) await act(g.code, { type: "advance" });
    expect((await loadRoom(g.code)).phase).toBe("reveal");
    expect(await blobCount(g.code, g.gameId), "photo still stored after the Reveal").toBe(0);
  });
  it("photos are deleted once the avatar jobs have finished", async () => {
    // KNOWN-DEFECT T3-016b: media-runner.ts never deletes the reference photos (policy: deleted when avatar generation completes)
    const g = await newGame({ host: "d-ret2", mix: ["adult", "adult", "adult", "kid"], names: "A" });
    const { POST } = await routes.photo();
    await POST(mkReq("POST", "/p", { body: fakeJpeg() as unknown as BodyInit, headers: { "x-consent": "self", ...asPlayer(g.players[0]) } }), ctx(g.code));
    hostSession.id = g.hostId;
    await act(g.code, { type: "setPlan", plan: { avatars: true, scenesPerAct: 0, videoClips: 0 }, capUsd: 20 });
    await act(g.code, { type: "start" });
    const { runNext } = await import("@/lib/media-runner");
    for (let i = 0; i < 20; i++) await runNext(g.code);
    const r = await loadRoom(g.code);
    expect(r.media.filter((m) => m.kind === "avatar" && m.status === "done").length).toBeGreaterThan(0);
    expect(await blobCount(g.code, g.gameId), "photo kept after its avatar was generated").toBe(0);
  });
});

describe("[T3-018] (see ai.injection.test.ts) and [T3-025] missing spec routes", () => {
  const files = ["app/api/rooms/[code]/route.ts", "app/api/directory/[code]/route.ts", "app/api/rooms/[code]/export/route.ts"];
  knownDefect("DELETE /api/rooms/{code}, GET /api/directory/{code} and GET /api/rooms/{code}/export exist", async () => {
    // KNOWN-DEFECT T3-025: api.openapi.yaml marks them x-status: new. Without DELETE a host cannot erase a game (deletion on request, practices.md section 12)
    for (const f of files) expect(existsSync(new URL(f, SRC)), f).toBe(true);
  });
  const deleteRoute = new URL("app/api/rooms/[code]/route.ts", SRC);
  it.skipIf(!existsSync(deleteRoute))("DELETE room: anonymous 401, other host 403/404, host 204 and everything gone", async () => {
    const mod = (await import(/* @vite-ignore */ deleteRoute.pathname)) as { DELETE: (r: Request, c: unknown) => Promise<Response> };
    const g = await newGame({ host: "d-del", mix: ["adult"] });
    expect([401, 403]).toContain((await mod.DELETE(mkReq("DELETE", "/r"), ctx(g.code))).status);
    hostSession.id = "someone-else";
    expect([403, 404]).toContain((await mod.DELETE(mkReq("DELETE", "/r"), ctx(g.code))).status);
    hostSession.id = g.hostId;
    expect((await mod.DELETE(mkReq("DELETE", "/r"), ctx(g.code))).status).toBe(204);
    expect(await getStore().get(g.code)).toBeNull();
  });
  const dirRoute = new URL("app/api/directory/[code]/route.ts", SRC);
  it.skipIf(!existsSync(dirRoute))("directory lookup never returns gameId, cell or host", async () => {
    const mod = (await import(/* @vite-ignore */ dirRoute.pathname)) as { GET: (r: Request, c: unknown) => Promise<Response> };
    const g = await newGame({ host: "d-dir", mix: ["adult"] });
    const t = JSON.stringify(await bodyOf(await mod.GET(mkReq("GET", "/d"), ctx(g.code))));
    expect(t).not.toMatch(new RegExp(`${g.gameId}|d-dir|local-0|token|hash`));
  });
  const exportRoute = new URL("app/api/rooms/[code]/export/route.ts", SRC);
  it.skipIf(!existsSync(exportRoute))("export: host only, no tokens or override data", async () => {
    const mod = (await import(/* @vite-ignore */ exportRoute.pathname)) as { GET: (r: Request, c: unknown) => Promise<Response> };
    const g = await newGame({ host: "d-exp", mix: ["adult", "adult"] });
    expect([401, 403]).toContain((await mod.GET(mkReq("GET", "/e"), ctx(g.code))).status);
    hostSession.id = g.hostId;
    const res = await mod.GET(mkReq("GET", "/e"), ctx(g.code));
    const raw = Buffer.from(await res.arrayBuffer()).toString("latin1");
    for (const p of g.players) expect(raw).not.toContain(p.token);
    expect(raw).not.toContain(g.overrideCode);
  });
});

describe("[T3-026] [T3-027] [T3-028] configuration safety (F7, F8, F18, F9)", () => {
  knownDefect("the memory state store refuses to start in production outside the local cell", async () => {
    // KNOWN-DEFECT T3-026: storage/index.ts createStore never checks NODE_ENV/CELL_ID; every pod would hold its own private set of games
    expect(() => createStore({ NODE_ENV: "production", STORE_ADAPTER: "memory", CELL_ID: "eu-west-1a" } as never)).toThrow();
  });
  it("the memory store is still allowed for local development", () => {
    expect(() => createStore({ STORE_ADAPTER: "memory", CELL_ID: "local-0" } as never)).not.toThrow();
  });
  knownDefect("Auth.js does not blindly trust the Host header", async () => {
    // KNOWN-DEFECT T3-027: auth.ts:38 trustHost: true (host header injection in callback URLs behind a mis-set ingress)
    expect(read("auth.ts")).not.toMatch(/trustHost:\s*true/);
  });
  knownDefect("the host session lasts hours, not Auth.js' default 30 days", async () => {
    // KNOWN-DEFECT T3-028: auth.ts session: { strategy: "jwt" } has no maxAge
    const m = /session:\s*\{[^}]*maxAge:\s*([^,}\s]+)/.exec(read("auth.ts"));
    expect(m, "session.maxAge is not configured").not.toBeNull();
  });
  it("the dev login provider is gated by NODE_ENV and is never enabled in a cloud values file", () => {
    expect(read("auth.ts")).toMatch(/ALLOW_DEV_LOGIN === "true" && process\.env\.NODE_ENV !== "production"/);
    const root = new URL("../../../deploy/helm/maude/", import.meta.url);
    for (const f of ["values.yaml", "values-aws.yaml", "values-azure.yaml", "values-gcp.yaml"]) {
      const p = new URL(f, root);
      if (existsSync(p)) expect(readFileSync(p, "utf8"), f).not.toMatch(/ALLOW_DEV_LOGIN:\s*["']?true/);
    }
  });
});

describe("[T3-022] errors are logged through a redacting logger (W10 finding 11)", () => {
  knownDefect("an unexpected failure containing credentials never reaches the console in clear text", async () => {
    // KNOWN-DEFECT T3-022: http.ts:9 console.error(e) prints the raw error object (message, stack and any attached request data)
    const g = await newGame({ host: "d-log", mix: ["adult"] });
    const canary = "CANARY-TOKEN-8f3a91";
    const store = getStore();
    const spy = vi.spyOn(store, "get").mockRejectedValue(new Error(`upstream failed: x-player-token: ${canary} Authorization: Bearer ${canary} postgres://u:${canary}@db/x`));
    const lines: string[] = [];
    errSpy.mockImplementation((...a: unknown[]) => { lines.push(a.map((x) => (x instanceof Error ? `${x.message}\n${x.stack}` : JSON.stringify(x))).join(" ")); });
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(" ")); });
    try { await (await routes.state()).GET(mkReq("GET", "/s"), ctx(g.code)); } finally { spy.mockRestore(); log.mockRestore(); }
    expect(lines.join("\n")).not.toContain(canary);
  });
});

describe("log hygiene over a whole game driven through the routes", () => {
  it("no console output contains an override code, a player token, the killer id, or photo bytes", async () => {
    const out: string[] = [];
    const sinks = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { out.push(a.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.stack ?? x.message : JSON.stringify(x))).join(" ")); }));
    const w = vi.spyOn(process.stdout, "write").mockImplementation(((s: unknown) => { out.push(String(s)); return true; }) as never);
    try {
      hostSession.id = "d-hyg";
      const overrideCode = "hygiene-CANARY-77";
      const { POST: create } = await routes.rooms();
      const code = ((await (await create(mkReq("POST", "/r", { json: { overrideCode } }), ctx(""))).json()) as { code: string }).code;
      const join = await routes.join();
      const players: { id: string; token: string }[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await join.POST(mkReq("POST", "/j", { json: { name: `H${i}`, ageGroup: i < 4 ? "adult" : "kid", profile: { backstoryMode: "own", backstory: "my-backstory-CANARY" } } }), ctx(code));
        players.push((await r.json()) as { id: string; token: string } & { playerId: string } as never);
      }
      const ps = (await loadRoom(code)).players;
      const photo = fakeJpeg(4000, "PHOTO-BYTES-CANARY");
      await (await routes.photo()).POST(mkReq("POST", "/p", { body: photo as unknown as BodyInit, headers: { "x-consent": "self", "x-player-id": ps[0].id, "x-player-token": ps[0].token } }), ctx(code));
      await act(code, { type: "start" });
      await act(code, { type: "override", code: "wrong-CANARY", cmd: "NUDGE" });
      await act(code, { type: "override", code: overrideCode, cmd: "ADVANCED" });
      for (let i = 0; i < 7; i++) await act(code, { type: "advance" });
      await act(code, { type: "bogus" });
      const room = await loadRoom(code);
      const text = out.join("\n");
      expect(text).not.toContain(overrideCode);
      expect(text).not.toContain("wrong-CANARY");
      expect(text).not.toContain("PHOTO-BYTES-CANARY");
      expect(text).not.toContain("my-backstory-CANARY");
      for (const p of room.players) expect(text).not.toContain(p.token);
      expect(text).not.toContain(room.case!.killerId + '"');
      expect(text).not.toContain(room.overrideHash);
    } finally { sinks.forEach((s) => s.mockRestore()); w.mockRestore(); }
  });
});
