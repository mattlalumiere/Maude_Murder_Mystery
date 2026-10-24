// T3 part 2b: photo, media run and media fetch routes. Privacy of children's photos and paid media abuse.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImage } from "@/lib/media-gen";
import { claim, runNext } from "@/lib/media-runner";
import { LIMITS } from "@/lib/security/limits";
import { findLeaks, forbiddenFor } from "../unit/engine/helpers/secrets";
import { hostView, playerView, publicView } from "@/lib/engine";
import type { MediaItem } from "@/lib/types";
import { knownDefect } from "./_support";
import { asPlayer, boot, bodyOf, ctx, fakeJpeg, getMediaStore, getStore, hostSession, loadRoom, mkReq, mutate, newGame, routes, type Booted, type TestGame } from "./_app";
vi.mock("@/auth", async () => ({ hostIdFromSession: async () => (await import("./_app")).hostSession.id }));

let app: Booted;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeAll(async () => { app = await boot(); });
afterAll(async () => { await app.cleanup(); });
beforeEach(() => { hostSession.id = null; errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); vi.unstubAllEnvs(); });

async function upload(g: TestGame, who: number, body: BodyInit | Buffer, headers: Record<string, string> = {}) {
  const { POST } = await routes.photo();
  return POST(mkReq("POST", `/api/rooms/${g.code}/photo`, { body: body as BodyInit, headers: { "x-consent": "self", ...asPlayer(g.players[who]), ...headers } }), ctx(g.code));
}
const blobsOf = async (g: TestGame) => {
  const m = getMediaStore();
  const keys: string[] = [];
  for (const id of new Set([g.gameId, g.code])) keys.push(...(await m.list(`local-0/games/${id}`)).entries.map((e) => e.key));
  return keys;
};

describe("POST /api/rooms/{code}/photo", () => {
  let g: TestGame, other: TestGame;
  beforeAll(async () => { g = await newGame({ host: "ph-host" }); other = await newGame({ host: "ph-host2", names: "O" }); });

  it("requires explicit consent", async () => {
    for (const c of [undefined, "", "yes", "SELF", "none", "self,guardian"]) {
      const res = await upload(g, 0, fakeJpeg(), { "x-consent": c as string });
      expect(res.status, String(c)).toBe(400);
    }
  });
  it("requires the right player credentials", async () => {
    const { POST } = await routes.photo();
    const jpg = fakeJpeg();
    const attempts: Record<string, string>[] = [
      {}, asPlayer(other.players[0]), { "x-player-id": g.players[1].id, "x-player-token": g.players[0].token }, { "x-player-id": g.players[0].id, "x-player-token": "" },
    ];
    for (const h of attempts) {
      const res = await POST(mkReq("POST", "/p", { body: jpg as unknown as BodyInit, headers: { "x-consent": "self", ...h } }), ctx(g.code));
      expect(res.status, JSON.stringify(h)).toBe(401);
    }
    expect(await blobsOf(g)).toEqual([]);
  });
  it("size, type and phase limits", async () => {
    expect((await upload(g, 0, fakeJpeg(500))).status).toBe(413);
    expect((await upload(g, 0, fakeJpeg(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(g, 0, Buffer.alloc(5000, 0x41))).status).toBe(415);
    expect((await upload(g, 0, Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(5000)]))).status).toBe(415);
    expect((await upload(g, 0, Buffer.concat([Buffer.from("<html><script>"), Buffer.alloc(5000)]))).status).toBe(415);
    expect(await blobsOf(g)).toEqual([]);
    const started = await newGame({ phase: "act1", host: "ph-host3", names: "S" });
    expect((await upload(started, 0, fakeJpeg())).status).toBe(409);
  });
  it("error bodies carry a generic message, never paths, stack traces or other players' data", async () => {
    for (const res of [await upload(g, 0, fakeJpeg(500)), await upload(g, 0, Buffer.alloc(5000, 1)), await upload(other, 0, fakeJpeg(), { "x-player-token": "bad" })]) {
      const t = await res.text();
      expect(t).not.toMatch(/\/Users\/|node_modules|at .*\(.*:\d+|\.ts:\d+|ENOENT|EACCES/);
      expect(t.length).toBeLessThan(300);
    }
  });
  it("a successful upload is visible only to its owner: GET returns own bytes, never another player's, and no view carries the key", async () => {
    const { GET } = await routes.photo();
    const a = await upload(g, 0, fakeJpeg(4000, "OWNER-A"));
    expect(a.status).toBe(200);
    const b = await upload(g, 1, fakeJpeg(4000, "OWNER-B"));
    expect(b.status).toBe(200);
    const mine = await GET(mkReq("GET", "/p", { headers: asPlayer(g.players[0]) }), ctx(g.code));
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toMatch(/private/);
    expect(Buffer.from(await mine.arrayBuffer()).toString("latin1")).toContain("OWNER-A");
    // query string tricks must not select another player's photo
    for (const q of [`?player=${g.players[1].id}`, `?pid=${g.players[1].id}`, `?id=${g.players[1].id}`, `?key=local-0/games/${g.code}/photos/${g.players[1].id}.jpg`]) {
      const r = await GET(mkReq("GET", "/p", { headers: asPlayer(g.players[0]), query: q }), ctx(g.code));
      expect(Buffer.from(await r.arrayBuffer()).toString("latin1"), q).not.toContain("OWNER-B");
    }
    // another game's player cannot fetch it
    const x = await GET(mkReq("GET", "/p", { headers: asPlayer(other.players[0]) }), ctx(g.code));
    expect(x.status).toBe(401);
    // anonymous cannot
    expect((await GET(mkReq("GET", "/p"), ctx(g.code))).status).toBe(401);

    const room = await loadRoom(g.code);
    const keys = room.players.map((p) => p.profile.photoKey).filter(Boolean) as string[];
    expect(keys.length).toBe(2);
    const views: unknown[] = [publicView(room), hostView(room), ...room.players.map((p) => playerView(room, p))];
    for (const v of views) {
      const wire = JSON.stringify(v);
      for (const k of keys) expect(wire).not.toContain(k);
      expect(wire).not.toMatch(/photoKey|\/photos\//);
    }
    for (const viewer of ["public", "host", ...room.players] as const) {
      const v = viewer === "public" ? publicView(room) : viewer === "host" ? hostView(room) : playerView(room, viewer);
      expect(findLeaks(v, forbiddenFor(room, viewer))).toEqual([]);
    }
  });
  it("a child cannot attach a photo with self declared consent: 400", async () => {
    const k = await newGame({ host: "ph-kid", mix: ["adult", "adult", "kid"], names: "K" });
    const res = await upload(k, 2, fakeJpeg(), { "x-consent": "self" });
    expect(res.status).toBe(400);
  });
  it("one player re-uploading many times never stores more than one blob (bounded storage per player)", async () => {
    const r = await newGame({ host: "ph-rep", mix: ["adult"], names: "R" });
    for (let i = 0; i < 15; i++) expect((await upload(r, 0, fakeJpeg(3000 + i))).status).toBe(200);
    expect((await blobsOf(r)).filter((k) => !k.endsWith(".mime"))).toHaveLength(1);
  });

  // ---------- known defects ----------
  describe("[T3-011] child photo persisted before consent is validated", () => {
    it("a rejected upload (child, self consent) leaves no blob behind", async () => {
      // KNOWN-DEFECT T3-011: photo/route.ts:24 stores the blob, then setPhoto() rejects: a minor's photo is kept without guardian consent
      const k = await newGame({ host: "ph-kid2", mix: ["adult", "adult", "kid"], names: "K" });
      const res = await upload(k, 2, fakeJpeg(), { "x-consent": "self" });
      expect(res.status).toBe(400);
      expect(await blobsOf(k), "blob of a minor without guardian consent was stored").toEqual([]);
    });
    knownDefect("a rejected upload (state commit fails) leaves no orphan blob", async () => {
      // KNOWN-DEFECT T3-011 (orphan variant, F14): the blob is written before mutate(); the kick races the commit
      const k = await newGame({ host: "ph-orph", mix: ["adult", "adult"], names: "Z" });
      const store = getStore();
      const spy = vi.spyOn(store, "put").mockResolvedValue(false); // every commit loses the optimistic race
      try { await upload(k, 0, fakeJpeg()); } finally { spy.mockRestore(); }
      expect(await blobsOf(k), "orphan photo blob after a failed commit").toEqual([]);
    });
  });

  describe("[T3-013] blob keys are built from the join code, not the game id", () => {
    knownDefect("Store.delete(gameId) removes the player's photo", async () => {
      // KNOWN-DEFECT T3-013: photo/route.ts:23 uses `${code}/photos/...`; keys.ts maps that to games/{CODE}/..., store.delete removes games/{gameId}/...
      const d = await newGame({ host: "ph-del", mix: ["adult"], names: "D" });
      expect((await upload(d, 0, fakeJpeg())).status).toBe(200);
      expect((await blobsOf(d)).length).toBeGreaterThan(0);
      await getStore().delete(d.gameId);
      expect(await blobsOf(d), "photo survived game deletion (retention promise: gone with the game)").toEqual([]);
    });
    knownDefect("photo blobs live under the game's own id prefix", async () => {
      const d = await newGame({ host: "ph-pref", mix: ["adult"], names: "P" });
      await upload(d, 0, fakeJpeg());
      const own = (await getMediaStore().list(`local-0/games/${d.gameId}`)).entries;
      expect(own.length, "nothing under games/{gameId}").toBeGreaterThan(0);
    });
    knownDefect("a new game that reuses an old game's join code does not inherit its blobs", async () => {
      const d = await newGame({ host: "ph-reuse", mix: ["adult"], names: "U" });
      await upload(d, 0, fakeJpeg());
      await getStore().delete(d.gameId);
      // a successor with the same code would sit on the same blob namespace; simulate by listing what the code prefix holds
      expect((await getMediaStore().list(`local-0/games/${d.code}`)).entries, "old photos still addressable via the code namespace").toEqual([]);
    });
  });

  describe("[T3-010] request body size is enforced before the body is read", () => {
    knownDefect("a 12 MiB streamed body is cut off near the 2 MiB limit", async () => {
      // KNOWN-DEFECT T3-010: photo/route.ts:18 `await req.arrayBuffer()` buffers everything first
      const r = await newGame({ host: "ph-big", mix: ["adult"], names: "B" });
      let pulled = 0;
      const chunk = new Uint8Array(64 * 1024).fill(0xff);
      const total = 12 * 1024 * 1024;
      const stream = new ReadableStream<Uint8Array>({
        pull(ctrl) { if (pulled >= total) return ctrl.close(); pulled += chunk.length; ctrl.enqueue(chunk); },
      });
      const { POST } = await routes.photo();
      const req = new Request("http://localhost/p", { method: "POST", body: stream, headers: { "x-consent": "self", ...asPlayer(r.players[0]) }, duplex: "half" } as RequestInit);
      const res = await POST(req, ctx(r.code));
      expect(res.status).toBe(413);
      expect(pulled, `route consumed ${pulled} bytes`).toBeLessThanOrEqual(LIMITS.maxPhotoBodyBytes + 256 * 1024);
    });
    knownDefect("a declared Content-Length over the cap is refused without reading the body", async () => {
      const r = await newGame({ host: "ph-cl", mix: ["adult"], names: "L" });
      let pulled = 0;
      const stream = new ReadableStream<Uint8Array>({ pull(ctrl) { pulled += 1024; ctrl.enqueue(new Uint8Array(1024)); if (pulled > 5_000_000) ctrl.close(); } });
      const { POST } = await routes.photo();
      const req = new Request("http://localhost/p", { method: "POST", body: stream, headers: { "x-consent": "self", "content-length": String(50 * 1024 * 1024), ...asPlayer(r.players[0]) }, duplex: "half" } as RequestInit);
      const res = await POST(req, ctx(r.code)).catch(() => new Response("", { status: 500 }));
      expect(res.status).toBe(413);
      expect(pulled).toBeLessThan(512 * 1024);
    });
  });

  describe("[T3-014] only the first 3 bytes are checked", () => {
    it("JPEG magic followed by an HTML/script payload or EXIF GPS block is rejected or re-encoded", async () => {
      // KNOWN-DEFECT T3-014: photo/route.ts:20. Stored bytes are exactly what the client sent (EXIF, GPS, polyglots survive)
      const r = await newGame({ host: "ph-poly", mix: ["adult"], names: "Y" });
      const payload = fakeJpeg(3000, "", { exif: "Exif\0\0GPSLatitude", trailing: "<script>alert(document.domain)</script>" });
      const res = await upload(r, 0, payload);
      if (res.status !== 200) return; // rejected: secure
      const key = (await loadRoom(r.code)).players[0].profile.photoKey!;
      const stored = (await getMediaStore().get(key))!.bytes;
      expect(stored.equals(payload), "bytes stored verbatim (no decode and re-encode)").toBe(false);
    });
  });

  describe("[T3-015] moderation fails open", () => {
    it("with NODE_ENV=production and no moderator configured, photos are refused", async () => {
      // KNOWN-DEFECT T3-015: media-gen.ts moderatePhoto returns ok:true when MEDIA_PROVIDER is not bedrock
      vi.stubEnv("NODE_ENV", "production");
      const r = await newGame({ host: "ph-mod", mix: ["adult"], names: "M" });
      const res = await upload(r, 0, fakeJpeg());
      expect(res.status, "an unmoderated child photo was accepted in production").not.toBe(200);
    });
  });
});

describe("GET photo: error handling", () => {
  knownDefect("[T3-012] an unexpected store failure does not leak its message", async () => {
    // KNOWN-DEFECT T3-012: photo/route.ts:41 returns (e as Error).message for non HttpError failures
    const g = await newGame({ host: "ph-err", mix: ["adult"], names: "E" });
    const store = getStore();
    const spy = vi.spyOn(store, "get").mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:5432 password=hunter2 /var/lib/postgresql"));
    try {
      const { GET } = await routes.photo();
      const res = await GET(mkReq("GET", "/p", { headers: asPlayer(g.players[0]) }), ctx(g.code));
      const t = await res.text();
      expect(res.status).toBe(500);
      expect(t).not.toMatch(/ECONNREFUSED|hunter2|10\.1\.2\.3|postgresql/);
    } finally { spy.mockRestore(); }
  });
});

describe("POST /api/rooms/{code}/media/run", () => {
  let g: TestGame, other: TestGame;
  beforeAll(async () => { g = await newGame({ start: true, host: "mr-host" }); other = await newGame({ start: true, host: "mr-host2", names: "O" }); });
  const run = async (code: string, headers: Record<string, string> = {}) => (await routes.mediaRun()).POST(mkReq("POST", "/m", { headers }), ctx(code));

  it("anonymous, another game's player, another game's host, spoofed credentials: 403", async () => {
    expect((await run(g.code)).status).toBe(403);
    expect((await run(g.code, asPlayer(other.players[0]))).status).toBe(403);
    expect((await run(g.code, { "x-player-id": g.players[0].id, "x-player-token": "x" })).status).toBe(403);
    expect((await run(g.code, { "x-player-id": g.players[1].id, "x-player-token": g.players[0].token })).status).toBe(403);
    hostSession.id = other.hostId;
    expect((await run(g.code)).status).toBe(403);
    expect((await run("ZZZZ")).status).toBe(404);
  });
  it("the host may trigger a tick", async () => {
    hostSession.id = g.hostId;
    expect((await run(g.code)).status).toBe(200);
  });
  // KNOWN-DEFECT T3-002 (F6)
  knownDefect("[T3-002] a plain joined player cannot trigger paid generation", async () => {
    const res = await run(g.code, asPlayer(g.players[0]));
    expect(res.status).toBe(403);
  });
  knownDefect("[T3-003] the token comparison in the route is constant time (source inspection)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/app/api/rooms/[code]/media/run/route.ts", import.meta.url), "utf8");
    // KNOWN-DEFECT T3-003: route.ts:16 `p.token === tok`
    const usesSafe = /safeEqual|timingSafeEqual|authPlayer/.test(src);
    const usesPlainEquals = /\.token\s*===|===\s*tok\b/.test(src);
    expect(usesSafe && !usesPlainEquals, "media/run compares tokens with ===").toBe(true);
  });
});

describe("spend abuse on paid media (server side caps)", () => {
  const mk = (id: string, est: number): MediaItem => ({ id, kind: "scene", phase: "act1", playerIds: [], caption: "c", prompt: "p", estCostUsd: est, status: "queued", createdAt: Date.now() });

  it("claim() never reserves beyond the cap, however many times it is called", async () => {
    const g = await newGame({ start: true, host: "sp-1" });
    await mutate(g.code, (r) => { r.media = Array.from({ length: 30 }, (_, i) => mk(`m${i}`, 0.4)); r.budget.capUsd = 1; r.budget.spentUsd = 0; r.budget.reservedUsd = 0; r.budget.plan.paused = false; });
    let claimed = 0;
    for (let i = 0; i < 50; i++) { const { result } = await mutate(g.code, claim); if (result) claimed++; }
    const r = await loadRoom(g.code);
    expect(claimed).toBe(2); // 0.4 + 0.4 <= 1, a third would be 1.2
    expect(r.budget.spentUsd + r.budget.reservedUsd).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.media.filter((m) => m.status === "skipped").length).toBeGreaterThan(0);
  });
  it("40 concurrent runNext calls on one game cannot overspend or run the same job twice", async () => {
    const g = await newGame({ start: true, host: "sp-2" });
    await mutate(g.code, (r) => { r.media = Array.from({ length: 20 }, (_, i) => mk(`c${i}`, 0.25)); r.budget.capUsd = 1; r.budget.spentUsd = 0; r.budget.reservedUsd = 0; r.budget.plan.paused = false; });
    const results = await Promise.allSettled(Array.from({ length: 40 }, () => runNext(g.code)));
    const r = await loadRoom(g.code);
    const done = r.media.filter((m) => m.status === "done");
    expect(r.budget.spentUsd).toBeLessThanOrEqual(1 + 1e-9);
    expect(done.length).toBeLessThanOrEqual(4);
    expect(new Set(done.map((m) => m.key)).size).toBe(done.length);
    // contention surfaces as 409 "Busy" at worst, never as a double charge
    for (const x of results) if (x.status === "rejected") expect((x.reason as { status?: number }).status).toBe(409);
  }, 30_000);
  it("a paused plan spends nothing", async () => {
    const g = await newGame({ start: true, host: "sp-3" });
    await mutate(g.code, (r) => { r.media = [mk("p1", 0.1)]; r.budget.capUsd = 5; r.budget.plan.paused = true; });
    expect((await runNext(g.code)).ran).toBe(false);
    expect((await loadRoom(g.code)).budget.spentUsd).toBe(0);
  });
  it("capUsd cannot be lowered below what is spent, and setPlan is host only", async () => {
    const g = await newGame({ start: true, host: "sp-4" });
    await mutate(g.code, (r) => { r.budget.spentUsd = 3; });
    hostSession.id = g.hostId;
    const { POST } = await routes.action();
    const res = await POST(mkReq("POST", "/a", { json: { type: "setPlan", capUsd: 1 } }), ctx(g.code));
    expect(res.status).toBe(400);
  });
  knownDefect("[T3-035] a full game's queued media stays within the per game item quota (maxMediaItemsPerGame)", async () => {
    const g = await newGame({ host: "sp-5", mix: Array(40).fill("adult") });
    hostSession.id = g.hostId;
    const { POST } = await routes.action();
    await POST(mkReq("POST", "/a", { json: { type: "setPlan", plan: { avatars: true, scenesPerAct: 3, videoClips: 4, quality: "premium" }, capUsd: 500 } }), ctx(g.code));
    await POST(mkReq("POST", "/a", { json: { type: "start" } }), ctx(g.code));
    for (let i = 0; i < 8; i++) await POST(mkReq("POST", "/a", { json: { type: "advance" } }), ctx(g.code));
    const r = await loadRoom(g.code);
    // KNOWN-DEFECT T3-035: 40 avatars + 3 scenes x 6 phases + 4 clips = 62 jobs, over maxMediaItemsPerGame (60)
    expect(r.media.length).toBeLessThanOrEqual(LIMITS.maxMediaItemsPerGame);
  }, 60_000);
});

describe("GET /api/rooms/{code}/media/{id}", () => {
  let g: TestGame, other: TestGame;
  let idA: string, idB: string;
  beforeAll(async () => {
    g = await newGame({ start: true, host: "mg-host" }); other = await newGame({ start: true, host: "mg-host2", names: "O" });
    for (const [game, tag] of [[g, "A"], [other, "B"]] as const) {
      hostSession.id = game.hostId;
      await mutate(game.code, (r) => { r.media = [{ id: `art${tag}`, kind: "scene", phase: "act1", playerIds: [], caption: "c", prompt: "p", estCostUsd: 0, status: "queued", createdAt: 0 }]; });
      await mutate(game.code, (r) => { const m = r.media[0]; m.status = "done"; });
    }
    for (const [game, tag] of [[g, "A"], [other, "B"]] as const) {
      const key = `local-0/games/${game.gameId}/gen/art${tag}.svg`;
      await getMediaStore().put(key, Buffer.from(`<svg>ART-${tag}</svg>`), "image/svg+xml");
      await mutate(game.code, (r) => { r.media[0].key = key; r.media[0].mime = "image/svg+xml"; });
    }
    idA = "artA"; idB = "artB";
  });
  const fetchMedia = async (code: string, id: string) => (await routes.mediaGet()).GET(mkReq("GET", "/m"), ctx(code, { id }));

  it("serves a game's art under its own code", async () => {
    const res = await fetchMedia(g.code, idA);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ART-A");
  });
  it("game B's media id under game A's code is a 404 (and vice versa)", async () => {
    expect((await fetchMedia(g.code, idB)).status).toBe(404);
    expect((await fetchMedia(other.code, idA)).status).toBe(404);
  });
  it("ids that are not media ids (player ids, keys, traversal) are 404", async () => {
    for (const id of [g.players[0].id, "photos", "../" + idB, `..%2f${idB}`, idA + "/", idA + "\0", "", "*", `local-0/games/${other.gameId}/gen/artB.svg`, encodeURIComponent(`local-0/games/${other.gameId}/gen/artB.svg`)]) {
      const res = await fetchMedia(g.code, id);
      expect(res.status, JSON.stringify(id)).toBe(404);
    }
  });
  it("responses pin the content type and forbid script execution", async () => {
    const res = await fetchMedia(g.code, idA);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    expect(res.headers.get("content-security-policy")).not.toMatch(/script-src/);
  });
  it("[T3-021] per game art is not cacheable by shared caches", async () => {
    // KNOWN-DEFECT T3-021: media/[id]/route.ts:11 Cache-Control: public, max-age=3600, immutable
    const res = await fetchMedia(g.code, idA);
    expect(res.headers.get("cache-control")).not.toMatch(/\bpublic\b/);
  });
  knownDefect("[T3-023] a malformed code is a clean 404, not an unhandled exception", async () => {
    // KNOWN-DEFECT T3-023: media/[id]/route.ts has no handle(); KeyError from the store escapes as a 500
    const res = await fetchMedia("!!", idA).catch(() => new Response("", { status: 500 }));
    expect(res.status).toBe(404);
  });
  it("mock image generation neutralises markup in captions (SVG injection)", async () => {
    const evil = `</text><script>alert(1)</script><image href="javascript:alert(1)" onload="x()">&"'`;
    const out = await generateImage({ prompt: "p", caption: evil, refs: [], shape: "wide", quality: "standard" }, "mock");
    const svg = out.bytes.toString();
    const tags = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]));
    expect([...tags].sort()).toEqual(["defs", "linearGradient", "rect", "stop", "svg", "text"]);
    expect(svg).toContain("&lt;script&gt;");
  });
});
void bodyOf;
