// T3 part 1a: cross-game isolation of every Store adapter (memory, file, postgres when DATABASE_URL is set).
// Oracle: an operation given an id that is not EXACTLY a live game's id must neither read, list, overwrite nor delete that game.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Room } from "@/lib/types";
import type { Store } from "@/lib/storage/ports";
import { Gen, evilString, attempt, itFailsWhen, knownDefect } from "./_support";
import { cellName, fileRig, fsIsCaseInsensitive, gidOf, hasPostgres, joinCode, memoryRig, mkRoom, nowSec, postgresRig, ulid, type StoreRig } from "./_adapters";

const rigs: [string, () => Promise<StoreRig>, boolean][] = [
  ["memory", memoryRig, true],
  ["file", fileRig, true],
  ["postgres", postgresRig, hasPostgres],
];

let caseInsensitiveFs = false;
beforeAll(async () => { caseInsensitiveFs = await fsIsCaseInsensitive(); });

const idMutations = (id: string): string[] => {
  const out = [
    id + "\0", id + "\n", id + "\r\n", id + ".", id + "/", "/" + id, id + " ", " " + id, id + "%00", encodeURIComponent(id + "/"),
    "..%2f" + id, id + "/../" + id, id + "\\", ".." + id, id.slice(0, -1), id.slice(1), id + "X", id + id, id.toLowerCase(),
    id.normalize("NFD"), id.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)), id.replace(/[A-Z]/, "İ"),
    id + "‮", "﻿" + id, id + "​", id.replace(/./, (c) => c + "́"), "x".repeat(100_000) + id, id + "x".repeat(100_000),
    "constructor", "__proto__", "toString", "hasOwnProperty", "", " ", ".", "..", "*", "%", "\0",
  ];
  return out;
};

describe.each(rigs)("store isolation: %s", (name, makeRig, enabled) => {
  const d = enabled ? describe : describe.skip;
  d("", () => {
    let rig: StoreRig;
    let cell: string;
    let cell2: string;
    let store: Store;
    let store2: Store;
    const g = new Gen(20260101);
    const games: Record<string, Room> = {};
    const LEGACY = [["ABCD", "WXYZ"], ["ABCDE", "WXYZ2"], ["ABCDEF", "WXYZ23"]] as const;

    beforeAll(async () => {
      rig = await makeRig();
      cell = cellName(g); cell2 = cellName(g);
      store = rig.make(cell); store2 = rig.make(cell2);
      for (const label of ["A", "B"]) {
        const r = mkRoom(g, { hostId: `canary-host-${label}` });
        expect(await store.put(r, null)).toBe(true);
        games[label] = r;
      }
      for (const [gid, code] of LEGACY) {
        const r = mkRoom(g, { gameId: gid, code, hostId: `canary-host-${gid}` });
        expect(await store.put(r, null)).toBe(true);
        games[gid] = r;
      }
    });
    afterAll(async () => { await rig?.teardown(); });

    /** Every game still resolves, byte for byte, through both lookups. */
    const assertAllIntact = async (where: string) => {
      for (const [label, r] of Object.entries(games)) {
        const byCode = await store.get(r.code);
        const byId = await store.getById(gidOf(r));
        expect(byCode?.hostId, `${where}: ${label} by code`).toBe(r.hostId);
        expect(byId?.hostId, `${where}: ${label} by id`).toBe(r.hostId);
        expect(byCode?.version, `${where}: ${label} version`).toBe(r.version);
        expect(gidOf(byCode!), `${where}: ${label} directory points at itself`).toBe(gidOf(r));
      }
    };

    it("baseline: each game and each prefix sibling resolves only to itself", async () => {
      for (const [label, r] of Object.entries(games)) {
        expect((await store.get(r.code))?.hostId, label).toBe(r.hostId);
        expect((await store.getById(gidOf(r)))?.code, label).toBe(r.code);
      }
      // the join code of one game is not the game id of another and vice versa
      expect(await store.getById("WXYZ")).toBeNull();
      expect(await store.getById("WXYZ2")).toBeNull();
    });

    it("join code and game id are different namespaces (code cannot be used as an id, id cannot be used as a code)", async () => {
      for (const label of ["A", "B"]) {
        const r = games[label];
        expect(await store.getById(r.code)).toBeNull();
        const viaId = await attempt(() => store.get(gidOf(r)));
        if (viaId.ok) expect(viaId.value).toBeNull();
        else expect((viaId.error as { status?: number }).status).toBe(400);
      }
      // a room whose game id equals another game's join code must not shadow that game's directory entry
      const evil = mkRoom(g, { gameId: games.A.code.length >= 4 ? games.A.code : "ZZZZ", code: joinCode(g), hostId: "attacker" });
      await attempt(() => store.put(evil, null));
      expect((await store.get(games.A.code))?.hostId).toBe(games.A.hostId);
      await store.delete(gidOf(evil)).catch(() => {});
      await assertAllIntact("after id/code confusion");
    });

    for (const seed of [11, 22, 33]) {
      it(`fuzz seed ${seed}: hostile get/getById/delete/put derived from live ids never touch another game`, async () => {
        const gen = new Gen(seed);
        const live = Object.values(games);
        const purelyCase = (v: string, id: string) => v !== id && v.toLowerCase() === id.toLowerCase();
        for (let i = 0; i < 160; i++) {
          const victim = gen.pick(live);
          const useCode = gen.bool();
          const base = useCode ? victim.code : gidOf(victim);
          const v = gen.bool(0.5) ? gen.pick(idMutations(base)) : evilString(gen, base);
          if (purelyCase(v, base)) continue; // covered by the dedicated case folding tests
          const exact = live.find((r) => (useCode ? r.code : gidOf(r)) === v);

          const got = await attempt(() => (useCode ? store.get(v) : store.getById(v)));
          if (got.ok && got.value) {
            const r = got.value as Room;
            expect(useCode ? r.code : gidOf(r), `lookup of ${JSON.stringify(v.slice(0, 40))} returned a different game`).toBe(v);
          } else if (!got.ok) {
            expect((got.error as { status?: number }).status, `unexpected error type for ${JSON.stringify(v.slice(0, 40))}`).toBe(400);
          }

          if (!exact) {
            const del = await attempt(() => store.delete(v));
            if (!del.ok) expect((del.error as { status?: number }).status).toBe(400);
            // hostile put: new room whose ids derive from the victim. Must not overwrite or hijack.
            const hostileCode = useCode ? v : joinCode(gen);
            const hostileId = useCode ? ulid(gen) : v;
            const room = mkRoom(gen, { code: hostileCode, gameId: hostileId, hostId: "attacker" });
            const put = await attempt(() => store.put(room, gen.bool() ? null : victim.version));
            if (put.ok && put.value === true) await store.delete(hostileId).catch(() => {});
          }
        }
        await assertAllIntact(`after fuzz seed ${seed}`);
      }, 60_000);
    }

    it("put refuses every way of claiming or rewriting a live game's identity", async () => {
      const B = games.B;
      const A = games.A;
      // new game, B's join code
      expect(await store.put(mkRoom(g, { code: B.code, hostId: "attacker" }), null)).toBe(false);
      // A tries to move itself onto B's join code, with and without the right version
      expect(await store.put({ ...A, code: B.code } as Room, A.version)).toBe(false);
      expect(await store.put({ ...A, code: B.code, version: A.version + 1 } as Room, A.version)).toBe(false);
      // B's game id with a wrong, stale and null expected version
      for (const exp of [null, 0, B.version + 5, B.version - 1]) {
        expect(await store.put({ ...B, hostId: "attacker", version: B.version + 1 } as Room, exp), `expected=${exp}`).toBe(false);
      }
      // expired room that squats B's code (the "owner is expired, steal the directory" path must not fire for a live owner)
      expect(await store.put(mkRoom(g, { code: B.code, ttl: nowSec() - 10, hostId: "attacker" }), null)).toBe(false);
      await assertAllIntact("after identity claims");
    });

    it("concurrent creators of one join code: exactly one wins and the directory names the winner", async () => {
      const code = joinCode(g);
      const rooms = Array.from({ length: 20 }, (_, i) => mkRoom(g, { code, hostId: `racer-${i}` }));
      const res = await Promise.all(rooms.map((r) => store.put(r, null)));
      expect(res.filter(Boolean)).toHaveLength(1);
      const winner = rooms[res.indexOf(true)];
      expect((await store.get(code))?.hostId).toBe(winner.hostId);
      for (const r of rooms) await store.delete(gidOf(r)).catch(() => {});
    });

    it("deleting one game leaves prefix siblings (ABCD vs ABCDE vs ABCDEF), their blobs and their directory entries alone", async () => {
      const media = rig.media(cell);
      for (const gid of ["ABCD", "ABCDE", "ABCDEF"]) await media.put(`${cell}/games/${gid}/photos/p.jpg`, Buffer.from(`canary-${gid}`), "image/jpeg");
      await store.delete("ABCD");
      expect(await store.getById("ABCD")).toBeNull();
      expect(await store.get("WXYZ")).toBeNull();
      expect((await store.get("WXYZ2"))?.hostId).toBe("canary-host-ABCDE");
      expect((await store.get("WXYZ23"))?.hostId).toBe("canary-host-ABCDEF");
      expect((await media.get(`${cell}/games/ABCDE/photos/p.jpg`))?.bytes.toString()).toBe("canary-ABCDE");
      expect((await media.get(`${cell}/games/ABCDEF/photos/p.jpg`))?.bytes.toString()).toBe("canary-ABCDEF");
      expect(await media.get(`${cell}/games/ABCD/photos/p.jpg`)).toBeNull();
      // restore for later tests
      await store.put(games.ABCD, null);
      await store.delete("ABCDE"); await store.delete("ABCDEF"); await store.put(games.ABCDE, null); await store.put(games.ABCDEF, null);
    });

    it("deleting game A removes all of A's blobs and none of B's", async () => {
      const mediaA = rig.media(cell);
      const A = gidOf(games.A), B = gidOf(games.B);
      await mediaA.put(`${cell}/games/${A}/photos/a.jpg`, Buffer.from("A-photo"), "image/jpeg");
      await mediaA.put(`${cell}/games/${B}/photos/b.jpg`, Buffer.from("B-photo"), "image/jpeg");
      await store.delete(A);
      expect(await mediaA.get(`${cell}/games/${A}/photos/a.jpg`)).toBeNull();
      expect((await mediaA.get(`${cell}/games/${B}/photos/b.jpg`))?.bytes.toString()).toBe("B-photo");
      await store.put(games.A, null);
    });

    it("cell scoping: another cell can neither read, list nor delete this cell's games; hostile cell ids are rejected", async () => {
      // same join code, different game id: independent games in independent cells
      const codeTwin = mkRoom(g, { code: games.B.code, hostId: "other-cell-host" });
      expect(await store2.put(codeTwin, null)).toBe(true);
      expect((await store.get(games.B.code))?.hostId).toBe("canary-host-B");
      expect((await store2.get(games.B.code))?.hostId).toBe("other-cell-host");
      // same game id in another cell: allowed (separate trees) or refused (global primary key), never an overwrite
      const idTwin = mkRoom(g, { gameId: gidOf(games.B), hostId: "other-cell-host-2" });
      const put = await store2.put(idTwin, null);
      expect(put === true || put === false).toBe(true);
      expect((await store.getById(gidOf(games.B)))?.hostId).toBe("canary-host-B");
      // cell 2 cannot see or delete cell 1's games by id
      expect((await store2.getById(gidOf(games.A)))?.hostId ?? null).not.toBe("canary-host-A");
      await store2.delete(gidOf(games.A));
      await store2.delete(gidOf(games.B));
      await store2.delete(gidOf(codeTwin));
      expect((await store.getById(gidOf(games.A)))?.hostId).toBe("canary-host-A");
      expect((await store.getById(gidOf(games.B)))?.hostId).toBe("canary-host-B");
      for (const bad of ["../" + cell, cell + "/", cell + "\0", "", ".", "a/b", "a\\b", "x".repeat(200), cell + "%2f"]) {
        expect(() => rig.make(bad), JSON.stringify(bad.slice(0, 30))).toThrow();
      }
      // listing another cell is refused, not answered
      const r = await attempt(() => store.listExpired(cell2, 10));
      expect(r.ok).toBe(false);
    });

    it("listExpired returns only this cell's expired games, for hostile cursors too", async () => {
      const old = [mkRoom(g, { ttl: nowSec() - 100 }), mkRoom(g, { ttl: nowSec() - 100 })];
      const foreign = mkRoom(g, { ttl: nowSec() - 100 });
      for (const r of old) await store.put(r, null);
      await store2.put(foreign, null);
      const ids = new Set<string>();
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const p: { gameIds: string[]; next: string | null } = await store.listExpired(cell, 2, cursor);
        p.gameIds.forEach((x) => ids.add(x));
        cursor = p.next;
        if (!cursor) break;
      }
      for (const r of old) expect(ids.has(gidOf(r))).toBe(true);
      expect(ids.has(gidOf(foreign))).toBe(false);
      for (const id of ids) expect(Object.values(games).some((r) => gidOf(r) === id), "a live game was listed as expired").toBe(false);
      for (const bad of ["../", "\0", "%", "*", "x".repeat(10_000), "'; DROP TABLE mm_games;--"]) {
        const r = await attempt(() => store.listExpired(cell, 5, bad));
        if (r.ok) for (const id of r.value.gameIds) expect(id).not.toBe(gidOf(foreign));
      }
      for (const r of old) await store.delete(gidOf(r));
      await store2.delete(gidOf(foreign));
      await assertAllIntact("after listExpired");
    });

    it("SQL and path metacharacters in ids are inert (nothing leaves the game table or the state directory)", async () => {
      const payloads = ["' OR '1'='1", "ABCD'; DELETE FROM mm_games;--", "%", "_", "ABC%", "A\\' OR 1=1 --", "$1", "{{7*7}}", "../../etc/passwd"];
      for (const p of payloads) {
        for (const op of [() => store.get(p), () => store.getById(p), () => store.delete(p), () => store.put(mkRoom(g, { code: p }), null), () => store.put(mkRoom(g, { gameId: p }), null)]) {
          const r = await attempt(op);
          if (!r.ok) expect((r.error as { status?: number }).status, p).toBe(400);
        }
      }
      await assertAllIntact("after metacharacter payloads");
      if (rig.inventory) {
        for (const f of await rig.inventory()) expect(f, "stray path in the state tree").not.toMatch(/passwd|\.\.|DELETE|OR '1'/);
      }
    });

    it("hostile ids are rejected quickly, even 1 MB long (bounded work per request)", async () => {
      const huge = "A".repeat(1_000_000);
      const t = Date.now();
      for (let i = 0; i < 20; i++) {
        await attempt(() => store.get(huge)); await attempt(() => store.getById(huge)); await attempt(() => store.delete(huge));
      }
      expect(Date.now() - t).toBeLessThan(3000);
    });

    itFailsWhen(() => rig.fsBacked && caseInsensitiveFs, "case variants of a live id never resolve to that game (case insensitive filesystems alias them)", async () => {
      // KNOWN-DEFECT T3-004 (file adapter on case insensitive filesystems, for example macOS APFS in local dev)
      for (const label of ["A", "B"]) {
        const r = games[label];
        const lowerId = gidOf(r).toLowerCase();
        const viaId = await attempt(() => store.getById(lowerId));
        if (viaId.ok) expect(viaId.value, "getById(lowercase gameId) returned the game").toBeNull();
        const viaCode = await attempt(() => store.get(r.code.toLowerCase()));
        if (viaCode.ok) expect(viaCode.value, "get(lowercase code) returned the game").toBeNull();
      }
      // and a lowercase delete must not remove the upper case game
      await attempt(() => store.delete(gidOf(games.B).toLowerCase()));
      expect(await store.getById(gidOf(games.B)), "lowercase delete removed game B").not.toBeNull();
    });

    // Adapters accept any [A-Za-z0-9]{4,32}; canonical ids are uppercase (ULID, join alphabet). Non canonical case should be a KeyError.
    knownDefect("rejects non-canonical (lowercase) game ids and join codes at the adapter boundary", async () => {
      // KNOWN-DEFECT T3-004: keys.ts GAME_RE and CODE_RE accept lowercase, so 'abcd' and 'ABCD' are two tenants that alias on case insensitive filesystems
      const lower = mkRoom(g, { gameId: ulid(g).toLowerCase(), code: joinCode(g).toLowerCase() });
      const r = await attempt(() => store.put(lower, null));
      if (r.ok && r.value) await store.delete(gidOf(lower)).catch(() => {});
      expect(r.ok, "lowercase ids were accepted").toBe(false);
    });

    // tenancy.md section 1: "the code is quarantined for the TTL" after deletion
    knownDefect("a deleted game's join code is not immediately reusable (quarantine)", async () => {
      // KNOWN-DEFECT T3-009: no adapter keeps a tombstone, so a stale TV/screen URL shows a stranger's game
      const victim = mkRoom(g, { hostId: "victim" });
      await store.put(victim, null);
      await store.delete(gidOf(victim));
      const squatter = mkRoom(g, { code: victim.code, hostId: "squatter" });
      const ok = await store.put(squatter, null);
      if (ok) await store.delete(gidOf(squatter));
      expect(ok, "code was reusable right after delete").toBe(false);
    });
  });
});
