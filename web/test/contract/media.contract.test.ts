// One parameterised suite, run against every MediaStore adapter.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameBlobs, KeyError, QuotaExceededError, tenantKey, type MediaStore } from "../../src/lib/storage";
import { AzureBlobMediaStore } from "../../src/lib/storage/media-azure";
import { NotImplementedError } from "../../src/lib/storage";
import { newGameId, mediaHarnesses } from "./harness";

const bytes = (n: number, v = 1) => Buffer.alloc(n, v);

for (const h of mediaHarnesses) {
  if (h.skip) console.warn(`[contract] media ${h.name}: ${h.skip}`);
  describe.skipIf(!!h.skip)(`MediaStore contract: ${h.name}`, () => {
    let env: Awaited<ReturnType<typeof h.setup>>;
    let media: MediaStore;
    let cell: string;
    beforeAll(async () => { env = await h.setup(); ({ media, cell } = env.make("cell-a")); });
    afterAll(async () => { await env.teardown(); });
    const key = (g: string, kind: string, name: string) => tenantKey(cell, g, kind, name);

    it("round trips bytes and content type, exactly", async () => {
      const g = newGameId();
      const payload = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      await media.put(key(g, "photos", "a.bin"), payload, "application/x-test");
      const got = await media.get(key(g, "photos", "a.bin"));
      expect(got!.bytes.equals(payload)).toBe(true);
      expect(got!.mime).toBe("application/x-test");
      expect(await media.get(key(g, "photos", "missing.bin"))).toBeNull();
      expect(await media.stat(key(g, "photos", "a.bin"))).toEqual({ size: 256 });
      expect(await media.stat(key(g, "photos", "missing.bin"))).toBeNull();
    });

    it("overwrites in place", async () => {
      const g = newGameId(), k = key(g, "art", "x.png");
      await media.put(k, bytes(10, 1), "image/png");
      await media.put(k, bytes(20, 2), "image/jpeg");
      const got = await media.get(k);
      expect(got!.bytes.length).toBe(20);
      expect(got!.mime).toBe("image/jpeg");
    });

    it("handles large payloads under the blob limit and refuses ones over it", async () => {
      const g = newGameId(), k = key(g, "videos", "big.mp4");
      const big = Buffer.alloc(500 * 1024, 9);
      await media.put(k, big, "video/mp4");
      expect((await media.get(k))!.bytes.equals(big)).toBe(true);
      await expect(media.put(key(g, "videos", "huge.mp4"), bytes(600 * 1024), "video/mp4")).rejects.toBeInstanceOf(QuotaExceededError);
      expect(await media.get(key(g, "videos", "huge.mp4"))).toBeNull();
    });

    it("enforces the per game byte quota, counting an overwrite only once, and does not bill other games", async () => {
      const g = newGameId(), other = newGameId();
      await media.put(key(g, "photos", "1.jpg"), bytes(400 * 1024), "image/jpeg");
      await media.put(key(g, "photos", "2.jpg"), bytes(400 * 1024), "image/jpeg");
      await expect(media.put(key(g, "photos", "3.jpg"), bytes(400 * 1024), "image/jpeg")).rejects.toBeInstanceOf(QuotaExceededError);
      await media.put(key(g, "photos", "1.jpg"), bytes(450 * 1024), "image/jpeg"); // overwrite fits: 450 + 400 < 1024
      await media.put(key(other, "photos", "1.jpg"), bytes(400 * 1024), "image/jpeg");
    });

    it("deletePrefix removes a game, a kind or one object, and never matches siblings", async () => {
      const g = newGameId(), g2 = g + "X"; // g2 shares g as a string prefix
      for (const n of ["a.jpg", "a.jpg2", "b/c.jpg"]) await media.put(key(g, "photos", n), bytes(5), "image/jpeg");
      await media.put(key(g, "art", "z.png"), bytes(5), "image/png");
      await media.put(key(g2, "photos", "a.jpg"), bytes(5), "image/jpeg");

      await media.deletePrefix(key(g, "photos", "a.jpg"));
      expect(await media.get(key(g, "photos", "a.jpg"))).toBeNull();
      expect(await media.get(key(g, "photos", "a.jpg2"))).not.toBeNull(); // sibling with common string prefix survives
      await media.deletePrefix(`${cell}/games/${g}/photos`);
      expect(await media.get(key(g, "photos", "b/c.jpg"))).toBeNull();
      expect(await media.get(key(g, "art", "z.png"))).not.toBeNull();
      await media.deletePrefix(`${cell}/games/${g}`);
      expect((await media.list(`${cell}/games/${g}`)).entries).toHaveLength(0);
      expect(await media.get(key(g2, "photos", "a.jpg"))).not.toBeNull(); // game "g" does not delete game "gX"
    });

    it("delete is idempotent", async () => {
      const g = newGameId();
      await media.deletePrefix(`${cell}/games/${g}`);
      await media.put(key(g, "photos", "a.jpg"), bytes(3), "image/jpeg");
      await media.deletePrefix(`${cell}/games/${g}`);
      await media.deletePrefix(`${cell}/games/${g}`);
      expect(await media.get(key(g, "photos", "a.jpg"))).toBeNull();
    });

    it("lists with stable pagination", async () => {
      const g = newGameId();
      const names = Array.from({ length: 37 }, (_, i) => `n${String(i).padStart(3, "0")}.jpg`);
      for (let i = 0; i < names.length; i += 10) await Promise.all(names.slice(i, i + 10).map((n) => media.put(key(g, "photos", n), bytes(2), "image/jpeg")));
      const seen: string[] = [];
      let cursor: string | null = null, pages = 0;
      do {
        const p = await media.list(`${cell}/games/${g}`, { limit: 10, cursor });
        expect(p.entries.length).toBeLessThanOrEqual(10);
        seen.push(...p.entries.map((e) => e.key));
        cursor = p.next; pages++;
      } while (cursor && pages < 10);
      expect(pages).toBe(4);
      expect(seen).toEqual(names.map((n) => key(g, "photos", n)));
    });

    it("rejects traversal, odd characters and foreign cells on every method", async () => {
      const g = newGameId();
      const bad = [
        `${cell}/games/${g}/photos/../../${newGameId()}/photos/x`, `${g}/photos/../x`, `${cell}/games/${g}/photos/a b`,
        `${cell}/games/${g}/photos//x`, `/etc/passwd`, `${cell}/games/${g}/photos/%2e%2e/x`, ``, `${cell}/games/${g}/photos/x\0y`,
        `other-cell/games/${g}/photos/x`, `${cell}/games/${g}/photos/x.jpg.mime`,
      ];
      for (const k of bad) {
        await expect(media.put(k, bytes(1), "image/jpeg"), k).rejects.toBeInstanceOf(KeyError);
        await expect(media.get(k), k).rejects.toBeInstanceOf(KeyError);
        await expect(media.stat(k), k).rejects.toBeInstanceOf(KeyError);
      }
      for (const p of ["", "/", cell, `${cell}/games`, `${cell}/games/`, "..", `${g}/../${newGameId()}`, "other-cell/games/" + g]) {
        await expect(media.deletePrefix(p), p).rejects.toBeInstanceOf(KeyError);
        await expect(media.list(p), p).rejects.toBeInstanceOf(KeyError);
      }
    });

    it("keeps legacy callers working: keys like CODE/photos/x.jpg land inside the tenant namespace", async () => {
      const code = newGameId().slice(0, 4);
      await media.put(`${code}/photos/p1.jpg`, bytes(4), "image/jpeg");
      expect((await media.get(`${code}/photos/p1.jpg`))!.bytes.length).toBe(4);
      expect(await media.get(key(code, "photos", "p1.jpg"))).not.toBeNull();
      await media.deletePrefix(`${code}/photos`);
      expect(await media.get(`${code}/photos/p1.jpg`)).toBeNull();
    });

    it("isolates games: a GameBlobs handle cannot read, list, overwrite or delete another game", async () => {
      const a = new GameBlobs(media, cell, newGameId()), b = new GameBlobs(media, cell, newGameId());
      await b.put("photos", "secret.jpg", Buffer.from("B-DATA"), "image/jpeg");
      await a.put("photos", "mine.jpg", Buffer.from("A-DATA"), "image/jpeg");
      const bKey = b.key("photos", "secret.jpg");
      const attempts = [
        bKey, bKey.replace("/photos/", "/photos/./"), `${a.cell}/games/${a.gameId}/photos/../../${b.gameId}/photos/secret.jpg`,
        `${a.cell}/games/${a.gameId}x/photos/secret.jpg`, `${b.gameId}/photos/secret.jpg`, encodeURIComponent(bKey),
      ];
      for (const k of attempts) {
        await expect(a.getKey(k), k).rejects.toBeInstanceOf(KeyError);
        await expect(a.putKey(k, Buffer.from("EVIL"), "image/jpeg"), k).rejects.toBeInstanceOf(KeyError);
        await expect(a.deleteKey(k), k).rejects.toBeInstanceOf(KeyError);
      }
      await expect(a.listPrefix(`${cell}/games/${b.gameId}`)).rejects.toBeInstanceOf(KeyError);
      expect((await a.list()).entries.map((e) => e.key)).toEqual([a.key("photos", "mine.jpg")]);
      await a.deleteAll();
      expect((await b.get("photos", "secret.jpg"))!.bytes.toString()).toBe("B-DATA");
      expect((await a.list()).entries).toHaveLength(0);
    });

    it("isolates cells: another cell's adapter cannot address this cell's objects", async () => {
      const g = newGameId();
      await media.put(key(g, "photos", "a.jpg"), bytes(3), "image/jpeg");
      const other = env.make("cell-b");
      await expect(other.media.get(key(g, "photos", "a.jpg"))).rejects.toBeInstanceOf(KeyError);
      await expect(other.media.deletePrefix(`${cell}/games/${g}`)).rejects.toBeInstanceOf(KeyError);
      expect(await other.media.get(tenantKey(other.cell, g, "photos", "a.jpg"))).toBeNull();
      expect(await media.get(key(g, "photos", "a.jpg"))).not.toBeNull();
    });

    it("writes and reads 100 small objects concurrently", async () => {
      const g = newGameId();
      await Promise.all(Array.from({ length: 100 }, (_, i) => media.put(key(g, "photos", `${i}.jpg`), bytes(10, i), "image/jpeg")));
      const got = await Promise.all(Array.from({ length: 100 }, (_, i) => media.get(key(g, "photos", `${i}.jpg`))));
      got.forEach((o, i) => expect(o!.bytes[0]).toBe(i));
    });
  });
}

describe("azureblob adapter stub", () => {
  it("fails loudly with a pointer to the ADR", () => {
    expect(() => new AzureBlobMediaStore()).toThrow(NotImplementedError);
    expect(() => new AzureBlobMediaStore()).toThrow(/docs\/platform\/adr/);
  });
});
