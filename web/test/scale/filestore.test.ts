import { execSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", async () => await import("./sim/auth-mock"));
import { makeUlid, JOIN_ALPHABET, seededRandom } from "../../src/lib/ids";
import { mutate } from "../../src/lib/store";
import type { Room } from "../../src/lib/types";
import { api } from "./sim/api";
import { setupEnv, type SimEnv } from "./sim/env";
import { seedGame } from "./sim/seed-games";
import { Histogram, saveResult, fmt } from "./sim/stats";

// The file store (the local default and the compose default) with SCALE_FILE_GAMES live games (default 3000;
// the report uses 10000). Rooms are clones of one real, fully played 16 player game so sizes are realistic.
const N = Number(process.env.SCALE_FILE_GAMES ?? 3000);
const EXPIRED = Math.floor(N / 10);
const result: Record<string, unknown> = { games: N, expired: EXPIRED };

let env: SimEnv;
let template: Room;
const codes: string[] = [];
const ids: string[] = [];

beforeAll(async () => {
  const mem = setupEnv({ store: "memory" });
  const g = await seedGame(0, { advanceTo: 7 });
  template = (await mem.raw.get(g.code))!;
  mem.teardown();
  env = setupEnv({ store: "file", keepDir: false });
}, 60_000);
afterAll(() => { saveResult(`filestore-${N}`, result); env?.teardown(); });

const rnd = seededRandom(11);
const randCode = () => Array.from({ length: 6 }, () => JOIN_ALPHABET[rnd.int(JOIN_ALPHABET.length)]).join("");

describe(`file store with ${N} games`, () => {
  it("creates the games (put with expected=null) and reports latency and disk use", async () => {
    const h = new Histogram();
    const now = Date.now();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const room = structuredClone(template);
      const expired = i < EXPIRED;
      room.gameId = makeUlid(now - (N - i) * 1000 - (expired ? 26 * 3600_000 : 0), rnd);
      room.code = randCode();
      room.hostId = `host-${i}`;
      room.version = 1;
      room.ttl = Math.floor(now / 1000) + (expired ? -3600 : 86_400);
      const t = performance.now();
      const ok = await env.store.put(room, null);
      h.add(performance.now() - t);
      if (!ok) { i--; continue; }
      codes.push(room.code); ids.push(room.gameId!);
    }
    const sec = (performance.now() - t0) / 1000;
    const du = Number(execSync(`du -sk ${JSON.stringify(env.dir)}`).toString().split("\t")[0]);
    const files = Number(execSync(`find ${JSON.stringify(env.dir)} -type f | wc -l`).toString().trim());
    const dirs = Number(execSync(`find ${JSON.stringify(env.dir)} -type d | wc -l`).toString().trim());
    result.create = { ...h.summary(), perSec: N / sec, duKB: du, files, dirs, roomBytes: Buffer.byteLength(JSON.stringify(template)) };
    expect(files).toBeLessThanOrEqual(N * 3 + 10);
  }, 600_000);

  it("directory lookups: hit and miss by code stay fast (p99 <= 20 ms)", async () => {
    const hit = new Histogram(), miss = new Histogram();
    for (let i = 0; i < 3000; i++) {
      const c = codes[Math.floor(rnd.float() * codes.length)];
      let t = performance.now(); await env.raw.get(c); hit.add(performance.now() - t);
      t = performance.now(); await env.raw.get(randCode()); miss.add(performance.now() - t);
    }
    result.lookupHit = hit.summary(); result.lookupMiss = miss.summary();
    expect(hit.quantile(0.99)).toBeLessThanOrEqual(20);
    expect(miss.quantile(0.99)).toBeLessThanOrEqual(20);
  }, 120_000);

  it("polls: serial unchanged poll through the route costs and concurrency 32", async () => {
    const live = codes.filter((_, i) => i >= EXPIRED);
    const h = new Histogram();
    const t0 = performance.now(); let n = 0;
    for (let i = 0; i < 3000; i++) {
      const c = live[Math.floor(rnd.float() * live.length)];
      const r = await api.state(c, { role: "screen", v: template.version + 99 });
      h.add(r.ms); n++;
    }
    const serialSec = (performance.now() - t0) / 1000;
    const hc = new Histogram();
    const t1 = performance.now(); let done = 0;
    const worker = async () => {
      for (let k = 0; k < 250; k++) {
        const c = live[Math.floor(rnd.float() * live.length)];
        const r = await api.state(c, { role: "screen", v: 1 });
        hc.add(r.ms); done++;
      }
    };
    await Promise.all(Array.from({ length: 32 }, worker));
    const concSec = (performance.now() - t1) / 1000;
    result.pollSerial = { ...h.summary(), perSec: n / serialSec };
    result.pollConc32 = { ...hc.summary(), perSec: done / concSec };
    // NF-1 style budget for the server side of a poll on the file store.
    expect(hc.quantile(0.95)).toBeLessThanOrEqual(150);
  }, 300_000);

  it("mutate (read, change, lock, write) latency on the file store", async () => {
    const live = codes.filter((_, i) => i >= EXPIRED);
    const h = new Histogram();
    for (let i = 0; i < 1500; i++) {
      const c = live[Math.floor(rnd.float() * live.length)];
      const t = performance.now();
      await mutate(c, (room) => { room.paused = !room.paused; });
      h.add(performance.now() - t);
    }
    result.mutate = h.summary();
    expect(h.quantile(0.95)).toBeLessThanOrEqual(300);
  }, 300_000);

  it("expiry sweep: listExpired pages of 500 find every expired game; cost per page", async () => {
    const pages = new Histogram();
    const found: string[] = [];
    let cursor: string | null = null, calls = 0;
    const t0 = performance.now();
    do {
      const t = performance.now();
      const page = await env.raw.listExpired("local-0", 500, cursor);
      pages.add(performance.now() - t); calls++;
      expect(page.gameIds.length).toBeLessThanOrEqual(500);
      found.push(...page.gameIds);
      cursor = page.next;
    } while (cursor && calls < 200);
    result.listExpired = { ...pages.summary(), calls, totalMs: performance.now() - t0, found: found.length };
    expect(new Set(found).size).toBe(EXPIRED);
    // NF-20: a page must be cheap enough to run inside a 10 minute cadence without starving polls.
    expect(pages.quantile(0.95)).toBeLessThanOrEqual(1500);
  }, 300_000);

  it("deleting the expired games: per-delete cost, nothing left behind", async () => {
    const page = await env.raw.listExpired("local-0", 1000);
    const h = new Histogram();
    for (const id of page.gameIds) { const t = performance.now(); await env.raw.delete(id); h.add(performance.now() - t); }
    const left = (readdirSync(join(env.dir, "state", "local-0", "games"))).length;
    result.delete = { ...h.summary(), deleted: page.gameIds.length, gamesLeft: left };
    expect(left).toBe(N - EXPIRED);
    expect(h.quantile(0.99)).toBeLessThanOrEqual(100);
    const again = await env.raw.listExpired("local-0", 1000);
    expect(again.gameIds).toEqual([]);
  }, 300_000);

  it("durability cost: write+rename (what the adapter does) vs write+fsync+rename+dir fsync", () => {
    const d = join(env.dir, "fsync-bench"); mkdirSync(d, { recursive: true });
    const body = JSON.stringify(template);
    const run = (sync: boolean, n = 500) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        const f = join(d, `r${i % 50}.json`), tmp = `${f}.tmp`;
        const fd = openSync(tmp, "w"); writeFileSync(fd, body); if (sync) fsyncSync(fd); closeSync(fd);
        renameSync(tmp, f);
        if (sync) { const dd = openSync(d, "r"); fsyncSync(dd); closeSync(dd); }
      }
      return (performance.now() - t0) / n;
    };
    const plain = run(false), synced = run(true);
    rmSync(d, { recursive: true, force: true });
    result.fsync = { plainMsPerWrite: plain, fsyncMsPerWrite: synced, ratio: synced / plain, note: "macOS APFS: node fsync does not issue F_FULLFSYNC, so Linux ext4/xfs/overlay numbers will be higher" };
    console.log(`fsync bench: plain ${fmt(plain, 3)} ms, fsync ${fmt(synced, 3)} ms per write`);
    expect(synced).toBeGreaterThan(0);
  });

  // SCALE-DEFECT X1 (documented: to-W3-from-W10 item 4, NF-20): nothing in the application calls listExpired/delete,
  // so expired games on file and postgres stores are hidden on read but never removed. Disk and rows grow forever.
  it.fails("the app has a sweeper that calls listExpired and delete (NF-20)", () => {
    const hits = execSync(`grep -rln "listExpired" ${JSON.stringify(join(__dirname, "../../src"))} || true`).toString().split("\n").filter(Boolean)
      .filter((f) => !f.includes("/lib/storage/"));
    expect(hits.length).toBeGreaterThan(0);
  });
});
