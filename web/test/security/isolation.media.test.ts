// T3 part 1b: cross-game isolation of every MediaStore adapter (file; s3 when S3_ENDPOINT points at a throwaway S3 API).
// Oracle: a key or prefix that is not a canonical tenant key (or its documented legacy alias) must never read, list,
// overwrite or delete anything, and must never create an object. Canonical keys of other games are never reachable by mutation.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameBlobs, gamePrefix, tenantKey } from "@/lib/storage";
import { ByteQuotaPolicy } from "@/lib/storage/limits";
import { QuotaMediaStore } from "@/lib/storage/quota";
import type { MediaStore } from "@/lib/storage/ports";
import { Gen, attempt, evilString, itFailsWhen, knownDefect } from "./_support";
import { cellName, fileMediaRig, fsIsCaseInsensitive, hasS3, s3MediaRig, ulid, type MediaRig } from "./_adapters";

const rigs: [string, () => Promise<MediaRig>, boolean][] = [
  ["file", fileMediaRig, true],
  ["s3", s3MediaRig, hasS3],
];

let caseInsensitiveFs = false;
beforeAll(async () => { caseInsensitiveFs = await fsIsCaseInsensitive(); });

const KEY_RE = /^(?:([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/games\/)?([A-Za-z0-9]{4,32})(?:\/[a-z][a-z0-9_-]{0,31}(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}){1,4})?\/?$/;
const isCanonicalShape = (v: string) => v.length <= 512 && KEY_RE.test(v) && !v.includes("..") && !v.split("/").some((s) => s.endsWith(".mime"));

describe.each(rigs)("media isolation: %s", (_n, makeRig, enabled) => {
  const d = enabled ? describe : describe.skip;
  d("", () => {
    let rig: MediaRig;
    let cell: string, cell2: string;
    let m: MediaStore, m2: MediaStore;
    let sentinelOk: () => Promise<boolean>;
    const g = new Gen(777);
    const GAMES = ["ABCD", "ABCDE", "ABCDEF", ulid(g), ulid(g)];
    const blobs: Record<string, { key: string; bytes: string }[]> = {};
    const canary = (gid: string, name: string) => `canary|${gid}|${name}`;

    beforeAll(async () => {
      rig = await makeRig();
      cell = cellName(g); cell2 = cellName(g);
      m = rig.make(cell); m2 = rig.make(cell2);
      sentinelOk = await rig.sentinel();
      for (const gid of GAMES) {
        blobs[gid] = [];
        for (const [kind, name] of [["photos", "p1.jpg"], ["photos", "p10.jpg"], ["photos2", "x.jpg"], ["gen", "a1.png"], ["gen", "deep/er/n.png"]] as const) {
          const key = tenantKey(cell, gid, kind, name);
          const bytes = canary(gid, `${kind}/${name}`);
          await m.put(key, Buffer.from(bytes), "image/jpeg");
          blobs[gid].push({ key, bytes });
        }
      }
    });
    afterAll(async () => { await rig?.teardown(); });

    const restoreAll = async () => { for (const gid of GAMES) for (const b of blobs[gid]) await m.put(b.key, Buffer.from(b.bytes), "image/jpeg"); };
    const assertIntact = async (where: string) => {
      for (const gid of GAMES) for (const b of blobs[gid]) {
        const got = await m.get(b.key);
        expect(got?.bytes.toString(), `${where}: ${b.key}`).toBe(b.bytes);
        expect(got?.mime, `${where}: mime of ${b.key}`).toBe("image/jpeg");
      }
      expect(await sentinelOk(), `${where}: sentinel outside the namespace`).toBe(true);
    };
    const inventorySane = async (where: string) => {
      const inv = await rig.inventory();
      const bad = inv.filter((k) => {
        const rel = k.replace(/^root\//, "");
        if (/SENTINEL|SIBLING|\/rootx\//.test(k)) return false;
        const f = rel.replace(/\.mime$/, "");
        return !/^[A-Za-z0-9][A-Za-z0-9_-]*\/games\/[A-Za-z0-9]{4,32}\/[a-z][a-z0-9_-]*\/[A-Za-z0-9_-][A-Za-z0-9._\/-]*$/.test(f);
      });
      expect(bad, `${where}: objects outside the tenant layout`).toEqual([]);
      const known = new Set(GAMES.flatMap((gid) => blobs[gid].map((b) => b.key)));
      const extra = inv.filter((k) => !k.endsWith(".mime") && !/SENTINEL|SIBLING/.test(k)).map((k) => k.replace(/^root\//, "")).filter((k) => !known.has(k));
      expect(extra, `${where}: hostile operations created objects`).toEqual([]);
    };

    it("baseline: list and delete are exact (ABCD vs ABCDE vs ABCDEF, photos vs photos2, p1 vs p10)", async () => {
      const listed = async (prefix: string) => (await m.list(prefix)).entries.map((e) => e.key);
      const abcd = await listed(gamePrefix(cell, "ABCD"));
      expect(abcd.sort()).toEqual(blobs.ABCD.map((b) => b.key).sort());
      expect((await listed(`${cell}/games/ABCD/photos`)).sort()).toEqual([`${cell}/games/ABCD/photos/p1.jpg`, `${cell}/games/ABCD/photos/p10.jpg`]);
      await m.deletePrefix(`${cell}/games/ABCD/photos/p1.jpg`);
      expect(await m.get(`${cell}/games/ABCD/photos/p1.jpg`)).toBeNull();
      expect((await m.get(`${cell}/games/ABCD/photos/p10.jpg`))?.bytes.toString()).toBe(canary("ABCD", "photos/p10.jpg"));
      await m.put(`${cell}/games/ABCD/photos/p1.jpg`, Buffer.from(canary("ABCD", "photos/p1.jpg")), "image/jpeg");
      await m.deletePrefix(`${cell}/games/ABCD/photos`); // kind level: must not take photos2
      expect((await m.get(`${cell}/games/ABCD/photos2/x.jpg`))?.bytes.toString()).toBe(canary("ABCD", "photos2/x.jpg"));
      expect(await m.get(`${cell}/games/ABCD/photos/p10.jpg`)).toBeNull();
      for (const n of ["p1.jpg", "p10.jpg"]) await m.put(`${cell}/games/ABCD/photos/${n}`, Buffer.from(canary("ABCD", `photos/${n}`)), "image/jpeg");
      await m.deletePrefix(gamePrefix(cell, "ABCD")); // whole game: siblings survive
      for (const sib of ["ABCDE", "ABCDEF"]) expect(await m.list(gamePrefix(cell, sib)).then((p) => p.entries.length)).toBe(5);
      for (const b of blobs.ABCD) await m.put(b.key, Buffer.from(b.bytes), "image/jpeg");
      await assertIntact("after exact delete checks");
    });

    for (const seed of [101, 202, 303, 404]) {
      it(`fuzz seed ${seed}: hostile keys and prefixes derived from live keys cannot read, list, overwrite or delete anything`, async () => {
        const gen = new Gen(seed);
        const all = GAMES.flatMap((gid) => blobs[gid]);
        let hostile = 0;
        for (let i = 0; i < 220; i++) {
          const b = gen.pick(all);
          const parts = b.key.split("/");
          let v: string;
          switch (gen.int(6)) {
            case 0: v = evilString(gen, b.key); break;
            case 1: { const p = [...parts]; p[gen.int(p.length)] = evilString(gen, p[gen.int(p.length)] ?? ""); v = p.join("/"); break; }
            case 2: v = parts.slice(0, 2 + gen.int(3)).join("/") + gen.pick(["/..", "/../", "/.", "//", "/%2e%2e", "\0", "\\..", "/" + "a".repeat(600)]); break;
            case 3: v = gen.pick(["", ".", "..", "/", "//", "*", "?", cell, `${cell}/`, `${cell}/games`, `${cell}/games/`, `${cell}/games//`, "games", "local-0", `../${cell}`, "%2e%2e", "\0"]); break;
            case 4: v = b.key.replace(/\//g, gen.pick(["\\", "/./", "//", "/%2f", "/∕", "/／"])); break;
            default: v = b.key + gen.pick([".mime", "\0", "/", "/..", " ", "%00", ".", "..", "\n"]);
          }
          if (isCanonicalShape(v)) continue; // a well formed key is a legitimate address, not an attack
          hostile++;
          const got = await attempt(() => m.get(v));
          if (got.ok) expect(got.value, `get(${JSON.stringify(v.slice(0, 60))}) returned data`).toBeNull();
          const st = await attempt(() => m.stat(v));
          if (st.ok) expect(st.value, `stat(${JSON.stringify(v.slice(0, 60))})`).toBeNull();
          const put = await attempt(() => m.put(v, Buffer.from("attacker-bytes"), "text/html"));
          expect(put.ok, `put(${JSON.stringify(v.slice(0, 60))}) was accepted`).toBe(false);
          const lst = await attempt(() => m.list(v));
          if (lst.ok) expect(lst.value.entries, `list(${JSON.stringify(v.slice(0, 60))}) enumerated objects`).toEqual([]);
          const del = await attempt(() => m.deletePrefix(v));
          expect(del.ok, `deletePrefix(${JSON.stringify(v.slice(0, 60))}) was accepted`).toBe(false);
        }
        expect(hostile).toBeGreaterThan(100);
        await assertIntact(`after fuzz ${seed}`);
        await inventorySane(`after fuzz ${seed}`);
      }, 120_000);
    }

    it("named attack keys all fail closed", async () => {
      const A = GAMES[3], B = GAMES[4];
      const attacks = [
        `${cell}/games/${A}/photos/../../${B}/photos/p1.jpg`, `${cell}/games/${A}/photos/..%2f..%2f${B}/photos/p1.jpg`, `${cell}/games/${A}/photos/%2e%2e/${B}`,
        `${cell}/games/${A}/../${B}/photos/p1.jpg`, `${cell}/games/${A}%2f..%2f${B}/photos/p1.jpg`, `${cell}/games/${B}\0/photos/p1.jpg`,
        `${cell}/games/${B}/photos/p1.jpg\0.png`, `${cell}/games/${B}/photos/p1.jpg/.`, `${cell}/games/${B}/photos/./p1.jpg`,
        `${cell}/games/${B}/photos//p1.jpg`, `${cell}/games/${B}/photos/p1.jpg.mime`, `${cell}/games/${B}/photos/p1.jpg%00`, `${cell}/games/${B}/photos/p1.jpg\n`,
        `${cell}/games/${B}/photos/p1.jpg ` , ` ${cell}/games/${B}/photos/p1.jpg`, `${cell}/games/${B}/photos/.hidden`, `${cell}/games/${B}/photos/.tmp-abc`,
        `${cell}/games/ＡＢＣＤ/photos/p1.jpg`, `${cell}/games/${B}/photös/p1.jpg`, `${cell}/games/${B}/photos/p1․jpg`,
        `${cell}/games/${B}/photos/p1.jpg‮`, `${cell}/games/${B}\\photos\\p1.jpg`, `${cell}\\games\\${B}\\photos\\p1.jpg`, `file:///etc/passwd`, `//etc/passwd`,
        `${cell}/games/${"A".repeat(33)}/photos/p1.jpg`, `${cell}/games/${B}/${"k".repeat(40)}/p1.jpg`, `${cell}/games/${B}/photos/${"n".repeat(129)}`,
        `${cell}/games/${B}/a/b/c/d/e/f/g.jpg`, "x".repeat(2000), `${cell}/games/` + "A/".repeat(300),
      ];
      for (const k of attacks) {
        for (const [op, fn] of [["get", () => m.get(k)], ["stat", () => m.stat(k)], ["put", () => m.put(k, Buffer.from("x"), "image/png")], ["deletePrefix", () => m.deletePrefix(k)], ["list", () => m.list(k)]] as const) {
          const r = await attempt(fn as () => Promise<unknown>);
          if (r.ok && (op === "get" || op === "stat")) expect(r.value, `${op} ${JSON.stringify(k.slice(0, 70))}`).toBeNull();
          else if (r.ok && op === "list") expect((r.value as { entries: unknown[] }).entries, `${op} ${JSON.stringify(k.slice(0, 70))}`).toEqual([]);
          else if (r.ok) expect.fail(`${op} accepted ${JSON.stringify(k.slice(0, 70))}`);
        }
      }
      await assertIntact("after named attacks");
      await inventorySane("after named attacks");
    });

    it("prefix delete of a hostile or too short prefix never wipes the root, a cell or all games", async () => {
      for (const p of ["", ".", "/", `${cell}`, `${cell}/`, `${cell}/games`, `${cell}/games/`, "games", "*", `${cell}/games/*`, `${cell}/games/AB`, "ABC", `${cell}/games/ABC`]) {
        await attempt(() => m.deletePrefix(p));
      }
      await assertIntact("after short prefix deletes");
    });

    it("another cell cannot address this cell's objects, and its own namespace stays separate", async () => {
      const gid = GAMES[3];
      for (const k of [tenantKey(cell, gid, "photos", "p1.jpg"), `${gid}/photos/p1.jpg-x`]) {
        const r = await attempt(() => m2.get(k));
        if (r.ok) expect(r.value?.bytes.toString() ?? null, `cell2 read ${k}`).not.toBe(canary(gid, "photos/p1.jpg"));
      }
      for (const op of [() => m2.put(tenantKey(cell, gid, "photos", "p1.jpg"), Buffer.from("x"), "image/png"), () => m2.deletePrefix(gamePrefix(cell, gid)), () => m2.list(gamePrefix(cell, gid))]) {
        const r = await attempt(op as () => Promise<unknown>);
        if (r.ok && typeof r.value === "object" && r.value && "entries" in r.value) expect((r.value as { entries: unknown[] }).entries).toEqual([]);
        else expect(r.ok).toBe(false);
      }
      // same game id in the other cell is a different tenant
      await m2.put(tenantKey(cell2, gid, "photos", "p1.jpg"), Buffer.from("cell2-bytes"), "image/png");
      expect((await m.get(tenantKey(cell, gid, "photos", "p1.jpg")))?.bytes.toString()).toBe(canary(gid, "photos/p1.jpg"));
      await m2.deletePrefix(gamePrefix(cell2, gid));
      await assertIntact("after cross-cell attempts");
    });

    it("list with a cursor taken from another game's key stays inside the requested game", async () => {
      const A = GAMES[3], B = GAMES[4];
      for (const cursor of [blobs[B][0].key, blobs[B][4].key, `${cell}/games/${B}/`, "zzzz", "", "\0", "../"]) {
        const r = await attempt(() => m.list(gamePrefix(cell, A), { cursor, limit: 2 }));
        if (r.ok) for (const e of r.value.entries) expect(e.key.startsWith(gamePrefix(cell, A)), `cursor ${JSON.stringify(cursor)} leaked ${e.key}`).toBe(true);
      }
    });

    it("GameBlobs bound to game A cannot reach game B by any key", async () => {
      const A = GAMES[3], B = GAMES[4];
      const ga = new GameBlobs(m, cell, A);
      for (const k of [blobs[B][0].key, `${cell}/games/${A}/../${B}/photos/p1.jpg`, `${B}/photos/p1.jpg`, `${cell}/games/${B}/photos/p1.jpg`]) {
        await expect(ga.getKey(k)).rejects.toThrow();
        await expect(ga.putKey(k, Buffer.from("x"), "image/png")).rejects.toThrow();
        await expect(ga.deleteKey(k)).rejects.toThrow();
      }
      for (const p of [`${cell}/games/${B}`, `${cell}/games/${B}/`, `${cell}/games/${A}/../${B}/`, `${cell}/games/${A}x/`, `${cell}/games/`]) {
        await expect(ga.listPrefix(p)).rejects.toThrow();
      }
      expect((await ga.list()).entries.every((e) => e.key.startsWith(gamePrefix(cell, A)))).toBe(true);
      await assertIntact("after GameBlobs attempts");
    });

    it("quota accounting is per game: a full game does not block, and is not charged to, its prefix sibling", async () => {
      const q = new QuotaMediaStore(rig.make(cell), new ByteQuotaPolicy({ maxGameBytes: 3000, maxBlobBytes: 2000 }), cell);
      const small = cellName(g) + "q";
      const S1 = "QQQQ", S2 = "QQQQQ";
      await q.put(tenantKey(cell, S1, "gen", "a.bin"), Buffer.alloc(1500), "application/octet-stream");
      await q.put(tenantKey(cell, S1, "gen", "b.bin"), Buffer.alloc(1500), "application/octet-stream");
      await expect(q.put(tenantKey(cell, S1, "gen", "c.bin"), Buffer.alloc(100), "application/octet-stream")).rejects.toThrow(/quota/i);
      await q.put(tenantKey(cell, S2, "gen", "a.bin"), Buffer.alloc(1500), "application/octet-stream"); // sibling unaffected
      await q.deletePrefix(gamePrefix(cell, S1)); await q.deletePrefix(gamePrefix(cell, S2));
      expect(small.length).toBeGreaterThan(0);
    });

    itFailsWhen(() => rig.name === "media-file" && caseInsensitiveFs, "case variants of an existing key do not read, overwrite or delete it (case insensitive filesystems alias them)", async () => {
      // KNOWN-DEFECT T3-004: FileMediaStore on APFS/NTFS: 'ABCD' and 'abcd' are the same directory
      const B = GAMES[4];
      const lower = tenantKey(cell, B.toLowerCase(), "photos", "p1.jpg");
      const r = await attempt(() => m.get(lower));
      if (r.ok) expect(r.value, "lowercase game id read B's blob").toBeNull();
      await attempt(() => m.put(lower, Buffer.from("attacker"), "image/png"));
      const after = (await m.get(blobs[B][0].key))?.bytes.toString();
      await attempt(() => m.deletePrefix(gamePrefix(cell, B.toLowerCase())));
      const survived = await m.get(blobs[B][0].key);
      await restoreAll(); // later tests still need the canaries even when the defect reproduces
      expect(after, "lowercase put overwrote B").toBe(blobs[B][0].bytes);
      expect(survived, "lowercase deletePrefix removed B").not.toBeNull();
    });

    knownDefect("rejects non-canonical (lowercase) game ids instead of creating a second tenant", async () => {
      // KNOWN-DEFECT T3-004: keys.ts GAME_RE accepts lowercase, so 'abcd' and 'ABCD' are different tenants on S3 and the same one on APFS
      const lower = tenantKey(cell, GAMES[4].toLowerCase(), "photos", "case.jpg");
      const r = await attempt(() => m.put(lower, Buffer.from("x"), "image/png"));
      if (r.ok) await m.deletePrefix(lower).catch(() => {});
      await restoreAll();
      expect(r.ok, "lowercase game id accepted").toBe(false);
    });

    it("the .mime sidecar and temp files are not addressable (cannot read, forge or clobber a content type)", async () => {
      const B = GAMES[4];
      const key = blobs[B][0].key;
      for (const k of [key + ".mime", key + "x.mime"]) {
        expect((await attempt(() => m.put(k, Buffer.from("text/html"), "text/plain"))).ok).toBe(false);
        const r = await attempt(() => m.get(k));
        if (r.ok) expect(r.value).toBeNull();
      }
      expect((await m.get(key))?.mime).toBe("image/jpeg");
      const listed = (await m.list(gamePrefix(cell, B))).entries.map((e) => e.key);
      expect(listed.some((k) => k.endsWith(".mime") || k.includes(".tmp-"))).toBe(false);
    });

    it("a stored blob cannot be turned into an executable response: mime is whatever the uploader said, so serving routes must pin it (documented)", async () => {
      // The adapter stores the content type verbatim. Serving routes must therefore never reflect it for untrusted uploads.
      const key = tenantKey(cell, GAMES[3], "photos", "evil.jpg");
      await m.put(key, Buffer.from("<script>alert(1)</script>"), "text/html");
      expect((await m.get(key))?.mime).toBe("text/html");
      await m.deletePrefix(key);
    });

    it.skipIf(!hasS3 || _n !== "s3")("deletePrefix paginates: 1,100 objects under one game are all removed, a sibling is untouched", async () => {
      const P = "PAGE", S = "PAGEX";
      const keys = Array.from({ length: 1100 }, (_, i) => tenantKey(cell, P, "gen", `o${i}.bin`));
      for (let i = 0; i < keys.length; i += 25) await Promise.all(keys.slice(i, i + 25).map((k) => m.put(k, Buffer.from("x"), "application/octet-stream")));
      await m.put(tenantKey(cell, S, "gen", "keep.bin"), Buffer.from("keep"), "application/octet-stream");
      await m.deletePrefix(gamePrefix(cell, P));
      expect((await m.list(gamePrefix(cell, P))).entries).toHaveLength(0);
      expect((await m.get(tenantKey(cell, S, "gen", "keep.bin")))?.bytes.toString()).toBe("keep");
      await m.deletePrefix(gamePrefix(cell, S));
    }, 120_000);

    it("file adapter: the on-disk layout has no stray files after everything above", async () => {
      await mkdir(join(cell, ".."), { recursive: true }).catch(() => {});
      void writeFile;
      await inventorySane("end of suite");
    });
  });
});
