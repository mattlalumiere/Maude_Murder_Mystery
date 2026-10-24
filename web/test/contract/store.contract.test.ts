// One parameterised suite, run against every Store adapter. See src/lib/storage/README.md for the checklist.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { KeyError, tenantKey, type MediaStore, type Store } from "../../src/lib/storage";
import { idOf, makeRoom, newCode, newGameId, nowSec, storeHarnesses } from "./harness";

const CELL = "cell-a";
const OTHER = "cell-b";

for (const h of storeHarnesses) {
  if (h.skip) console.warn(`[contract] ${h.name}: ${h.skip}`);
  describe.skipIf(!!h.skip)(`Store contract: ${h.name}`, () => {
    let env: Awaited<ReturnType<StoreHarness["setup"]>>;
    let media: MediaStore;
    let store: Store;
    beforeAll(async () => {
      env = await h.setup();
      media = env.media(CELL);
      store = env.make(CELL, media);
    });
    afterAll(async () => { await env.teardown(); });
    type StoreHarness = typeof h;

    const blob = async (gameId: string, name = "a.jpg", size = 10) =>
      media.put(tenantKey(CELL, gameId, "photos", name), Buffer.alloc(size, 7), "image/jpeg");

    it("creates, reads by code and by id, and returns copies", async () => {
      const r = makeRoom();
      expect(await store.put(r, null)).toBe(true);
      const byCode = await store.get(r.code);
      expect(byCode).toEqual(r);
      expect(await store.getById(idOf(r))).toEqual(r);
      byCode!.hostId = "mutated";
      expect((await store.get(r.code))!.hostId).toBe("h1");
      expect(await store.get(newCode())).toBeNull();
      expect(await store.getById(newGameId())).toBeNull();
    });

    it("enforces versions: create twice fails, stale expected fails, correct expected wins", async () => {
      const r = makeRoom();
      expect(await store.put(r, null)).toBe(true);
      expect(await store.put(r, null)).toBe(false);
      expect(await store.put({ ...r, version: 2 }, 1)).toBe(true);
      expect(await store.put({ ...r, version: 2, hostId: "late" }, 1)).toBe(false);
      expect(await store.put({ ...r, version: 5 }, 4)).toBe(false);
      expect(await store.put(makeRoom({ code: newCode(), gameId: newGameId() }), 1)).toBe(false); // update of a game that does not exist
      const cur = await store.get(r.code);
      expect(cur!.version).toBe(2);
      expect(cur!.hostId).toBe("h1");
    });

    it("exactly one of N concurrent writers wins each version", async () => {
      const r = makeRoom();
      await store.put(r, null);
      for (let v = 1; v <= 5; v++) {
        const results = await Promise.all(Array.from({ length: 16 }, (_, i) => store.put({ ...r, version: v + 1, hostId: `w${v}-${i}` }, v)));
        expect(results.filter(Boolean)).toHaveLength(1);
        const cur = await store.get(r.code);
        expect(cur!.version).toBe(v + 1);
        expect(cur!.hostId).toBe(`w${v}-${results.findIndex(Boolean)}`);
      }
    });

    it("exactly one of N concurrent creators wins a game id, and a join code", async () => {
      const r = makeRoom();
      const sameId = await Promise.all(Array.from({ length: 12 }, () => store.put({ ...r }, null)));
      expect(sameId.filter(Boolean)).toHaveLength(1);
      const code = newCode();
      const sameCode = await Promise.all(Array.from({ length: 12 }, () => store.put(makeRoom({ code }), null)));
      expect(sameCode.filter(Boolean)).toHaveLength(1);
      const winner = await store.get(code);
      expect(winner).not.toBeNull();
    });

    it("honours TTL: expired games read as missing and their code can be reused", async () => {
      const r = makeRoom({ ttl: nowSec() - 5 });
      expect(await store.put(r, null)).toBe(true);
      expect(await store.get(r.code)).toBeNull();
      expect(await store.getById(idOf(r))).toBeNull();
      const reuse = makeRoom({ code: r.code });
      expect(await store.put(reuse, null)).toBe(true);
      expect(idOf((await store.get(r.code))!)).toBe(idOf(reuse));
    });

    it("expires with the clock, not only at write time", async () => {
      const r = makeRoom({ ttl: nowSec() + 60 });
      await store.put(r, null);
      expect(await store.get(r.code)).not.toBeNull();
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(Date.now() + 120_000);
        expect(await store.get(r.code)).toBeNull();
        expect(await store.getById(idOf(r))).toBeNull();
      } finally { vi.useRealTimers(); }
    });

    it("directory lookup resolves each code to its own game among many", async () => {
      const rooms = Array.from({ length: 30 }, () => makeRoom());
      await Promise.all(rooms.map((r) => store.put(r, null)));
      for (const r of rooms) expect(idOf((await store.get(r.code))!)).toBe(idOf(r));
    });

    it("delete removes state, directory entry and every blob under the game prefix; neighbours survive", async () => {
      const a = makeRoom(), b = makeRoom();
      await store.put(a, null); await store.put(b, null);
      for (const n of ["1.jpg", "2.jpg", "3.jpg"]) await blob(idOf(a), n);
      await media.put(tenantKey(CELL, idOf(a), "art", "x/y/z.png"), Buffer.from("png"), "image/png");
      await blob(idOf(b), "keep.jpg");
      await store.delete(idOf(a));
      expect(await store.get(a.code)).toBeNull();
      expect(await store.getById(idOf(a))).toBeNull();
      expect((await media.list(`${CELL}/games/${idOf(a)}`)).entries).toHaveLength(0);
      expect(await media.get(tenantKey(CELL, idOf(a), "photos", "1.jpg"))).toBeNull();
      expect(await store.put(makeRoom({ code: a.code }), null)).toBe(true); // code is free again
      expect(await store.get(b.code)).toEqual(b);
      expect(await media.get(tenantKey(CELL, idOf(b), "photos", "keep.jpg"))).not.toBeNull();
    });

    it("delete is idempotent and tolerates unknown games", async () => {
      const r = makeRoom();
      await store.put(r, null);
      await store.delete(idOf(r));
      await store.delete(idOf(r));
      await store.delete(newGameId());
      expect(await store.get(r.code)).toBeNull();
    });

    it("listExpired pages without duplicates or misses, skips live games, and survives deletes mid scan", async () => {
      const cell = `lx${newGameId().slice(0, 6).toLowerCase()}`;
      const m = env.media(cell);
      const s = env.make(cell, m);
      const expired = Array.from({ length: 23 }, () => makeRoom({ ttl: nowSec() - 10 }));
      const live = Array.from({ length: 5 }, () => makeRoom());
      await Promise.all([...expired, ...live].map((r) => s.put(r, null)));
      const seen: string[] = [], deleted = new Set<string>();
      let cursor: string | null = null, pages = 0;
      do {
        const p = await s.listExpired(cell, 10, cursor);
        expect(p.gameIds.length).toBeLessThanOrEqual(10);
        seen.push(...p.gameIds);
        for (const id of p.gameIds.slice(0, 2)) { await s.delete(id); deleted.add(id); } // deleting while paging must not skip entries
        cursor = p.next; pages++;
      } while (cursor && pages < 20);
      expect(cursor).toBeNull();
      expect(new Set(seen).size).toBe(seen.length);
      expect(new Set(seen)).toEqual(new Set(expired.map(idOf)));
      for (const r of live) expect(await s.get(r.code)).not.toBeNull();
      const rest = (await s.listExpired(cell, 100)).gameIds;
      expect(new Set(rest)).toEqual(new Set(expired.map(idOf).filter((id) => !deleted.has(id))));
      await expect(s.listExpired("some-other-cell", 10)).rejects.toThrow();
    });

    it("rejects traversal and malformed ids before touching storage", async () => {
      for (const bad of ["../x", "a/b", "AB", "x".repeat(40), "a b", "", "A\0B1"]) {
        await expect(store.get(bad)).rejects.toThrow(KeyError);
        await expect(store.getById(bad)).rejects.toThrow(KeyError);
        await expect(store.delete(bad)).rejects.toThrow(KeyError);
        await expect(store.put(makeRoom({ code: bad }), null)).rejects.toThrow(KeyError);
        await expect(store.put(makeRoom({ gameId: bad }), null)).rejects.toThrow(KeyError);
      }
    });

    it("isolates games: a clashing code or foreign version cannot touch another game", async () => {
      const a = makeRoom({ hostId: "A" }), b = makeRoom({ hostId: "B" });
      await store.put(a, null); await store.put(b, null);
      expect(await store.put(makeRoom({ code: a.code, hostId: "evil" }), null)).toBe(false);
      expect(await store.put({ ...b, gameId: idOf(a), version: 2, code: b.code } as typeof b, 1)).toBe(false); // wrong code for that game
      expect(await store.put({ ...a, version: 2, hostId: "A2" }, 1)).toBe(true);
      expect((await store.get(b.code))!.hostId).toBe("B");
      await store.delete(idOf(a));
      expect((await store.get(b.code))!.hostId).toBe("B");
    });

    it("isolates cells that share one backend", async () => {
      if (!env.shared) return;
      const other = env.make(OTHER, env.media(OTHER));
      const r = makeRoom();
      await store.put(r, null);
      expect(await other.get(r.code)).toBeNull();
      expect(await other.getById(idOf(r))).toBeNull();
      expect(await other.put({ ...r, version: 2, hostId: "x" }, 1)).toBe(false);
      await other.delete(idOf(r));
      expect(await store.get(r.code)).toEqual(r);
      expect(await other.put(makeRoom({ code: r.code }), null)).toBe(true); // same code is fine in another cell
      expect(await store.get(r.code)).toEqual(r);
    });

    it("stores large payloads intact and refuses oversize ones", async () => {
      const big = makeRoom();
      (big as unknown as { blob: string }).blob = "xé\u{1F575}".repeat(150_000);
      expect(await store.put(big, null)).toBe(true);
      expect(await store.get(big.code)).toEqual(big);
      const huge = makeRoom();
      (huge as unknown as { blob: string }).blob = "y".repeat(3 * 1024 * 1024);
      await expect(store.put(huge, null)).rejects.toMatchObject({ status: 413 });
      expect(await store.get(huge.code)).toBeNull();
    });

    it("creates and reads back 1,000 games quickly", async () => {
      const cell = `bulk${newGameId().slice(0, 6).toLowerCase()}`;
      const s = env.make(cell, env.media(cell));
      const rooms = Array.from({ length: 1000 }, (_, i) => makeRoom({ hostId: `h${i}` }));
      const t0 = Date.now();
      for (let i = 0; i < rooms.length; i += 50) {
        expect((await Promise.all(rooms.slice(i, i + 50).map((r) => s.put(r, null)))).every(Boolean)).toBe(true);
      }
      for (let i = 0; i < rooms.length; i += 50) {
        const got = await Promise.all(rooms.slice(i, i + 50).map((r) => s.get(r.code)));
        got.forEach((g, j) => expect(g!.hostId).toBe(rooms[i + j].hostId));
      }
      const ms = Date.now() - t0;
      console.log(`[contract] ${h.name}: 1000 games created and read in ${ms} ms`);
      expect(ms).toBeLessThan(30_000);
    }, 60_000);
  });
}
