// T3 part 2: route level authn/z. Real route handlers, real engine and stores (temp dirs), only the Auth.js session is faked.
// Matrix source: docs/platform/security/practices.md section 2 and docs/platform/specs/api.openapi.yaml.
import { knownDefect } from "./_support";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seededRandom, setRuntime } from "@/lib/ids";
import {
  asPlayer, bodyOf, boot, ctx, getStore, hostSession, loadRoom, mkReq, mutate, newGame, routes, type Booted, type TestGame,
} from "./_app";
vi.mock("@/auth", async () => ({ hostIdFromSession: async () => (await import("./_app")).hostSession.id }));

let app: Booted;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeAll(async () => { app = await boot(); });
afterAll(async () => { await app.cleanup(); });
beforeEach(() => { hostSession.id = null; errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => errSpy.mockRestore());

const HOST_ACTIONS = [
  { type: "start" }, { type: "advance" }, { type: "pause" }, { type: "resume" }, { type: "addPlayer", name: "Mallory", ageGroup: "adult" },
  { type: "kick", playerId: "x" }, { type: "override", code: "whatever", cmd: "NUDGE" }, { type: "setPlan", capUsd: 5 }, { type: "purgePhotos" },
] as const;
const PLAYER_ACTIONS = [{ type: "ready" }, { type: "removePhoto" }, { type: "ballot", ballot: { killerId: "a", methodId: "b", motiveId: "c" } }] as const;

async function post(code: string, json: unknown, headers: Record<string, string> = {}) {
  const { POST } = await routes.action();
  return POST(mkReq("POST", `/api/rooms/${code}/action`, { json, headers }), ctx(code));
}
async function getState(code: string, query = "", headers: Record<string, string> = {}) {
  const { GET } = await routes.state();
  return GET(mkReq("GET", `/api/rooms/${code}/state`, { query, headers }), ctx(code));
}
const versionOf = async (code: string) => (await loadRoom(code)).version;

describe("POST /api/rooms (create)", () => {
  it("anonymous callers get 401 and nothing is created", async () => {
    const { POST } = await routes.rooms();
    const res = await POST(mkReq("POST", "/api/rooms", { json: { overrideCode: "swordfish" } }), ctx(""));
    expect(res.status).toBe(401);
  });
  it("a signed in host gets only a join code back, never the room", async () => {
    hostSession.id = "host-create";
    const { POST } = await routes.rooms();
    const res = await POST(mkReq("POST", "/api/rooms", { json: { overrideCode: "swordfish-1" } }), ctx(""));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["code"]);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/hash|salt|token|gameId|hostId/i);
  });
  it("the stored room records the caller as host, whatever the body claims (mass assignment)", async () => {
    hostSession.id = "host-real";
    const { POST } = await routes.rooms();
    const res = await POST(mkReq("POST", "/api/rooms", { json: { overrideCode: "swordfish-1", hostId: "host-victim", gameId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", code: "AAAA", players: [{ id: "x" }], version: 99, phase: "reveal", config: { __proto__: { polluted: true }, name: "ok" } } }), ctx(""));
    const code = ((await res.json()) as { code: string }).code;
    const room = await loadRoom(code);
    expect(room.hostId).toBe("host-real");
    expect(room.phase).toBe("lobby");
    expect(room.players).toHaveLength(0);
    expect(room.code).not.toBe("AAAA");
    expect(room.gameId).not.toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("the override code is never echoed or stored in clear text", async () => {
    hostSession.id = "host-hash";
    const secret = "correct-horse-battery";
    const { POST } = await routes.rooms();
    const res = await POST(mkReq("POST", "/api/rooms", { json: { overrideCode: secret } }), ctx(""));
    const code = ((await res.json()) as { code: string }).code;
    expect(JSON.stringify(await loadRoom(code))).not.toContain(secret);
  });
});

describe("POST /api/rooms/{code}/join", () => {
  it("is open to anyone with the code, returns only {playerId, token}, and the token is fresh per player", async () => {
    const g = await newGame({ mix: ["adult"] });
    const { POST } = await routes.join();
    const a = await POST(mkReq("POST", "/j", { json: { name: "Zed", ageGroup: "adult" } }), ctx(g.code));
    expect(a.status).toBe(200);
    const body = (await a.json()) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(["playerId", "token"]);
    const b = await POST(mkReq("POST", "/j", { json: { name: "Yan", ageGroup: "adult" } }), ctx(g.code));
    expect(((await b.json()) as { token: string }).token).not.toBe(body.token);
  });
  it("mass assignment: client chosen id, token, character, photo key and consent are ignored", async () => {
    const g = await newGame({ mix: ["adult"] });
    const { POST } = await routes.join();
    const res = await POST(mkReq("POST", "/j", { json: {
      name: "Mal", ageGroup: "adult", id: "chosen-id", token: "chosen-token", characterId: "killer", ready: true, ballot: { killerId: "x" },
      profile: { photoKey: "local-0/games/OTHERGAME/photos/stolen.jpg", avatarId: "other-avatar", consent: "self", backstoryMode: "own", backstory: "hi" },
    } }), ctx(g.code));
    const { playerId, token } = (await res.json()) as { playerId: string; token: string };
    expect(playerId).not.toBe("chosen-id");
    expect(token).not.toBe("chosen-token");
    const p = (await loadRoom(g.code)).players.find((x) => x.id === playerId)!;
    expect(p.characterId).toBeUndefined();
    expect(p.ready).toBe(false);
    expect(p.ballot).toBeUndefined();
    expect(p.profile.photoKey).toBeUndefined();
    expect(p.profile.avatarId).toBeUndefined();
  });
  it("unknown code is a 404 and a started game refuses newcomers with 409", async () => {
    const { POST } = await routes.join();
    expect((await POST(mkReq("POST", "/j", { json: { name: "A", ageGroup: "adult" } }), ctx("ZZZZ"))).status).toBe(404);
    const g = await newGame({ start: true });
    expect((await POST(mkReq("POST", "/j", { json: { name: "Late", ageGroup: "adult" } }), ctx(g.code))).status).toBe(409);
  });
  it("the 41st player is refused and the stored state stays within the 40 player quota", async () => {
    const g = await newGame({ mix: Array(40).fill("adult") });
    const { POST } = await routes.join();
    const res = await POST(mkReq("POST", "/j", { json: { name: "Extra", ageGroup: "adult" } }), ctx(g.code));
    expect(res.status).toBe(409);
    expect((await loadRoom(g.code)).players).toHaveLength(40);
  });
  it("names are clamped, trimmed of control characters, and unique case insensitively", async () => {
    const g = await newGame({ mix: ["adult"] });
    const { POST } = await routes.join();
    const long = await POST(mkReq("POST", "/j", { json: { name: "N".repeat(5000), ageGroup: "adult" } }), ctx(g.code));
    expect(long.status).toBe(200);
    const stored = (await loadRoom(g.code)).players.at(-1)!;
    expect(stored.name.length).toBeLessThanOrEqual(24);
    const dup = await POST(mkReq("POST", "/j", { json: { name: stored.name.toLowerCase(), ageGroup: "adult" } }), ctx(g.code));
    expect(dup.status).toBe(409);
  });
});

describe("GET /api/rooms/{code}/state", () => {
  let g: TestGame, other: TestGame;
  beforeAll(async () => { g = await newGame({ start: true, host: "host-A" }); other = await newGame({ start: true, host: "host-B", names: "Q" }); });

  it("unknown code and malformed code never produce a 5xx", async () => {
    for (const c of ["ZZZZ", "zzzz", "!!", "a/b", "x".repeat(200), "%00"]) {
      const res = await getState(c);
      expect(res.status, c).toBeLessThan(500);
    }
  });

  describe("player projection requires the right id AND token", () => {
    const cases: [string, () => Record<string, string>, number][] = [
      ["anonymous", () => ({}), 401],
      ["token only", () => ({ "x-player-token": g.players[0].token }), 401],
      ["id only", () => ({ "x-player-id": g.players[0].id }), 401],
      ["another game's player (their own valid credentials)", () => asPlayer(other.players[0]), 401],
      ["another player's id with my token (header spoofing)", () => ({ "x-player-id": g.players[1].id, "x-player-token": g.players[0].token }), 401],
      ["my id with another player's token", () => ({ "x-player-id": g.players[0].id, "x-player-token": g.players[1].token }), 401],
      ["empty token", () => ({ "x-player-id": g.players[0].id, "x-player-token": "" }), 401],
      ["token prefix", () => ({ "x-player-id": g.players[0].id, "x-player-token": g.players[0].token.slice(0, -1) }), 401],
      ["token with extra suffix", () => ({ "x-player-id": g.players[0].id, "x-player-token": g.players[0].token + "A" }), 401],
      ["upper cased token", () => ({ "x-player-id": g.players[0].id, "x-player-token": g.players[0].token.toUpperCase() }), 401],
      ["unequal length tokens (1 and 5000 chars)", () => ({ "x-player-id": g.players[0].id, "x-player-token": "A".repeat(5000) }), 401],
      ["the right credentials", () => asPlayer(g.players[0]), 200],
    ];
    it.each(cases)("%s", async (_n, headers, status) => {
      const res = await getState(g.code, "?role=player", headers());
      expect(res.status).toBe(status);
      if (status === 200) expect(((await res.json()) as { me: { id: string } }).me.id).toBe(g.players[0].id);
    });
    it("a host session is not a player: role=player with host cookie and no credentials is 401", async () => {
      hostSession.id = g.hostId;
      expect((await getState(g.code, "?role=player")).status).toBe(401);
    });
  });

  describe("host projection requires the session whose id equals room.hostId", () => {
    it("anonymous 403", async () => expect((await getState(g.code, "?role=host")).status).toBe(403));
    it("a player's credentials are not host credentials", async () => expect((await getState(g.code, "?role=host", asPlayer(g.players[0]))).status).toBe(403));
    it("the host of another game gets 403", async () => { hostSession.id = other.hostId; expect((await getState(g.code, "?role=host")).status).toBe(403); });
    it("a session whose id merely contains or resembles the host id gets 403", async () => {
      for (const id of [g.hostId + "x", g.hostId.toUpperCase(), g.hostId + "\0", " " + g.hostId, "", "undefined", "null"]) {
        hostSession.id = id || null;
        expect((await getState(g.code, "?role=host")).status, JSON.stringify(id)).toBe(403);
      }
    });
    it("the host gets 200", async () => { hostSession.id = g.hostId; expect((await getState(g.code, "?role=host")).status).toBe(200); });
  });

  describe("adversarial role parameters never widen the projection", () => {
    const roles = ["Host", "HOST", " host", "host ", "host,player", "host&role=host", "admin", "operator", "root", "*", "__proto__", "host%00", "host\n", "player%20", "screen&role=host", "", "true", "1", "[object Object]", "ｈｏｓｔ"];
    it.each(roles)("role=%j without credentials returns the public view only", async (role) => {
      const res = await getState(g.code, `?role=${encodeURIComponent(role)}`);
      if (res.status !== 200) return expect([401, 403]).toContain(res.status);
      const v = (await res.json()) as Record<string, unknown>;
      for (const k of ["me", "budget", "config", "players", "jobs", "runSheet", "overrideUsed", "lockedUntil", "caseSource"]) expect(v, `${role} exposed ${k}`).not.toHaveProperty(k);
    });
    it("duplicate role parameters: the first wins and credentials are still required", async () => {
      expect((await getState(g.code, "?role=player&role=screen")).status).toBe(401);
      const r = await getState(g.code, "?role=screen&role=host");
      expect(r.status).toBe(200);
      expect(await r.json()).not.toHaveProperty("budget");
    });
    it("spoofed x-forwarded or role headers do nothing", async () => {
      const r = await getState(g.code, "", { "x-role": "host", "x-host": "true", "x-forwarded-user": g.hostId, "x-user-id": g.hostId, "x-player-role": "host", authorization: "Bearer " + g.hostId });
      expect(await r.json()).not.toHaveProperty("budget");
    });
  });

  describe("[T3-001] the unauthenticated ?v= short circuit", () => {
    it("screen role: version equality returns the cheap unchanged answer (the version is public data)", async () => {
      const v = await versionOf(g.code);
      const res = await getState(g.code, `?v=${v}`);
      expect(await res.json()).toEqual({ unchanged: true, version: v });
    });
    // KNOWN-DEFECT T3-001: state/route.ts:14 answers {unchanged:true, version} before authenticating the role
    knownDefect("role=host without a session does not learn the version number", async () => {
      const v = await versionOf(g.code);
      const res = await getState(g.code, `?role=host&v=${v}`);
      expect(res.status).toBe(403);
    });
    knownDefect("role=player without credentials does not learn the version number", async () => {
      const v = await versionOf(g.code);
      const res = await getState(g.code, `?role=player&v=${v}`);
      expect(res.status).toBe(401);
    });
    knownDefect("a wrong-token player cannot use ?v= to tell that a version is current", async () => {
      const v = await versionOf(g.code);
      const res = await getState(g.code, `?role=player&v=${v}`, { "x-player-id": g.players[0].id, "x-player-token": "wrong" });
      expect(res.status).toBe(401);
    });
    it("a wrong version gets the full view, not an error that discloses the right one", async () => {
      const res = await getState(g.code, "?role=host&v=0");
      expect(res.status).toBe(403);
    });
  });

  it("unknown code and an expired game are indistinguishable (same status and body)", async () => {
    const e = await newGame({ start: false, host: "host-exp" });
    await mutate(e.code, (r) => { r.ttl = Math.floor(Date.now() / 1000) - 5; });
    // mutate refuses expired rooms on the next read; write the past ttl through the store directly
    const live = await loadRoom(e.code).catch(() => null);
    void live;
    const unknown = await getState("ZZZZ");
    const expired = await getState(e.code);
    expect(expired.status).toBe(unknown.status);
    expect(await bodyOf(expired)).toEqual(await bodyOf(unknown));
  });
});

describe("POST /api/rooms/{code}/action: host only actions", () => {
  let g: TestGame, other: TestGame;
  beforeAll(async () => { g = await newGame({ host: "host-act", overrideCode: "Sw0rdfish!" }); other = await newGame({ host: "host-other", start: true, names: "R" }); });

  const actors: [string, () => { headers: Record<string, string>; host: string | null }][] = [
    ["anonymous", () => ({ headers: {}, host: null })],
    ["a player of this game", () => ({ headers: asPlayer(g.players[0]), host: null })],
    ["a player of another game", () => ({ headers: asPlayer(other.players[0]), host: null })],
    ["the host of another game", () => ({ headers: {}, host: other.hostId })],
    ["the host of another game that also sends this game's player credentials", () => ({ headers: asPlayer(g.players[0]), host: other.hostId })],
    ["a player spoofing a host header", () => ({ headers: { ...asPlayer(g.players[0]), "x-host-id": g.hostId, "x-user-id": g.hostId }, host: null })],
  ];
  for (const [who, actor] of actors) {
    describe(who, () => {
      it.each(HOST_ACTIONS.map((a) => [a.type, a] as const))("%s is refused with 403 and changes nothing", async (_t, action) => {
        const before = await loadRoom(g.code);
        const a = actor();
        hostSession.id = a.host;
        const res = await post(g.code, action, a.headers);
        expect(res.status).toBe(403);
        const after = await loadRoom(g.code);
        expect(after.version).toBe(before.version);
        expect(after.failedOverrides).toBe(before.failedOverrides);
        expect(after.players.length).toBe(before.players.length);
        expect(after.phase).toBe(before.phase);
      });
    });
  }

  it("a non-host cannot lock the host out of override by spamming wrong codes", async () => {
    hostSession.id = null;
    for (let i = 0; i < 10; i++) await post(g.code, { type: "override", code: "nope" + i, cmd: "NUDGE" }, asPlayer(g.players[0]));
    const r = await loadRoom(g.code);
    expect(r.lockedUntil).toBe(0);
    expect(r.failedOverrides).toBe(0);
  });

  it("the host succeeds", async () => {
    hostSession.id = g.hostId;
    const res = await post(g.code, { type: "pause" });
    expect(res.status).toBe(200);
    expect((await loadRoom(g.code)).paused).toBe(true);
    await post(g.code, { type: "resume" });
  });

  it("an addPlayer response gives the host only that new player's credentials", async () => {
    hostSession.id = g.hostId;
    const res = await post(g.code, { type: "addPlayer", name: "Grandma", ageGroup: "adult" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["playerId", "token"]);
  });
});

describe("POST /api/rooms/{code}/action: player only actions", () => {
  let g: TestGame, other: TestGame;
  beforeAll(async () => { g = await newGame({ start: true, host: "host-pa" }); other = await newGame({ start: true, host: "host-pb", names: "S" }); });
  const bad: [string, () => { headers: Record<string, string>; host: string | null }][] = [
    ["anonymous", () => ({ headers: {}, host: null })],
    ["the host without player credentials", () => ({ headers: {}, host: g.hostId })],
    ["a player of another game", () => ({ headers: asPlayer(other.players[0]), host: null })],
    ["another player's id with my token", () => ({ headers: { "x-player-id": g.players[1].id, "x-player-token": g.players[0].token }, host: null })],
    ["a wrong token", () => ({ headers: { "x-player-id": g.players[0].id, "x-player-token": "AAAA" }, host: null })],
  ];
  for (const [who, actor] of bad) {
    it.each(PLAYER_ACTIONS.map((a) => [a.type, a] as const))(`${who}: %s is 401`, async (_t, action) => {
      const before = await loadRoom(g.code);
      const a = actor();
      hostSession.id = a.host;
      const res = await post(g.code, action, a.headers);
      expect(res.status).toBe(401);
      expect((await loadRoom(g.code)).version).toBe(before.version);
    });
  }
  it("a player can only mark themselves ready, never someone else", async () => {
    await post(g.code, { type: "ready", playerId: g.players[1].id, id: g.players[1].id }, asPlayer(g.players[0]));
    const r = await loadRoom(g.code);
    expect(r.players.find((p) => p.id === g.players[0].id)!.ready).toBe(true);
    expect(r.players.find((p) => p.id === g.players[1].id)!.ready).toBe(false);
  });
  it("ballots are stored on the caller only and rejected for values outside the ballot options", async () => {
    await mutate(g.code, (r) => { r.ballotsOpen = true; });
    const res = await post(g.code, { type: "ballot", ballot: { killerId: "__proto__", methodId: "x", motiveId: "y" } }, asPlayer(g.players[0]));
    expect(res.status).toBe(400);
    const res2 = await post(g.code, { type: "ballot", ballot: null }, asPlayer(g.players[0]));
    expect(res2.status).toBeGreaterThanOrEqual(400);
  });
  it("unknown, inherited and non-string action types are 400 and never reach a handler", async () => {
    hostSession.id = g.hostId;
    for (const type of ["", "START", "start ", "__proto__", "constructor", "toString", "hasOwnProperty", 1, null, ["start"], { toString: "start" }, true]) {
      const res = await post(g.code, { type });
      expect(res.status, JSON.stringify(type)).toBe(400);
    }
  });
});

describe("expired and removed credentials", () => {
  it("a kicked player's token stops working on every player route", async () => {
    const g = await newGame({ host: "host-k" });
    hostSession.id = g.hostId;
    const victim = g.players[0];
    expect((await getState(g.code, "?role=player", asPlayer(victim))).status).toBe(200);
    await post(g.code, { type: "kick", playerId: victim.id });
    expect((await getState(g.code, "?role=player", asPlayer(victim))).status).toBe(401);
    hostSession.id = null;
    expect((await post(g.code, { type: "ready" }, asPlayer(victim))).status).toBe(401);
    const { GET } = await routes.photo();
    expect((await GET(mkReq("GET", "/p", { headers: asPlayer(victim) }), ctx(g.code))).status).toBe(401);
    const run = await routes.mediaRun();
    expect((await run.POST(mkReq("POST", "/m", { headers: asPlayer(victim) }), ctx(g.code))).status).toBe(403);
  });
  it("after the game expires every route answers 404 and nothing is served", async () => {
    const restore = setRuntime({ random: seededRandom(5) });
    try {
      const g = await newGame({ start: true, host: "host-x" });
      // age the game: write a past ttl straight into the store
      const store = getStore();
      const room = (await store.get(g.code))!;
      await store.put({ ...room, ttl: Math.floor(Date.now() / 1000) - 10, version: room.version + 1 }, room.version);
      hostSession.id = g.hostId;
      expect((await getState(g.code)).status).toBe(404);
      expect((await getState(g.code, "?role=host")).status).toBe(404);
      expect((await getState(g.code, "?role=player", asPlayer(g.players[0]))).status).toBe(404);
      expect((await post(g.code, { type: "pause" })).status).toBe(404);
      const j = await routes.join();
      expect((await j.POST(mkReq("POST", "/j", { json: { name: "Late", ageGroup: "adult" } }), ctx(g.code))).status).toBe(404);
      const run = await routes.mediaRun();
      expect((await run.POST(mkReq("POST", "/m"), ctx(g.code))).status).toBe(404);
      const med = await routes.mediaGet();
      expect((await med.GET(mkReq("GET", "/m"), ctx(g.code, { id: "x" }))).status).toBe(404);
    } finally { restore(); }
  });
});

describe("health probes", () => {
  it("healthz and readyz are anonymous, no-store and carry no secrets", async () => {
    const h = await (await routes.healthz()).GET();
    expect(h.status).toBe(200);
    expect(h.headers.get("cache-control")).toBe("no-store");
    const r = await (await routes.readyz()).GET();
    const text = JSON.stringify(await r.json());
    expect(text).not.toMatch(/postgres:\/\/|password|secret|token|AKIA|bucket/i);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("readyz does not echo environment values beyond adapter names", async () => {
    process.env.DATABASE_URL = "postgres://user:s3cretpw@db.internal:5432/x";
    process.env.AI_API_KEY = "sk-live-canary-123";
    try {
      const r = await (await routes.readyz()).GET();
      const text = JSON.stringify(await r.json());
      expect(text).not.toContain("s3cretpw");
      expect(text).not.toContain("sk-live-canary-123");
      expect(text).not.toContain("db.internal");
    } finally { delete process.env.DATABASE_URL; delete process.env.AI_API_KEY; }
  });
});
