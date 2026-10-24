import { describe, expect, it } from "vitest";
import {
  assertKeyInGame, belongsToGame, gamePrefix, KeyError, parseKey, resolveBlobKey, resolveBlobPrefix, tenantKey,
} from "../../src/lib/storage";

const G = "01HZX3K9Q2M8N7P6R5T4V3W2YZ";
const H = "01HZX3K9Q2M8N7P6R5T4V3W2YA";

describe("tenant key builder", () => {
  it("builds {cell}/games/{gameId}/{kind}/{name}", () => {
    expect(tenantKey("local-0", G, "photos", "p1.jpg")).toBe(`local-0/games/${G}/photos/p1.jpg`);
    expect(tenantKey("local-0", G, "art", "scene/3/a.png")).toBe(`local-0/games/${G}/art/scene/3/a.png`);
    expect(gamePrefix("local-0", G)).toBe(`local-0/games/${G}/`);
  });
  it.each([
    ["traversal in name", ["c", G, "photos", "../x"]],
    ["traversal segment", ["c", G, "photos", "a/../x"]],
    ["dotdot inside", ["c", G, "photos", "a..b"]],
    ["leading dot", ["c", G, "photos", ".hidden"]],
    ["empty name", ["c", G, "photos", ""]],
    ["empty segment", ["c", G, "photos", "a//b"]],
    ["absolute", ["c", G, "photos", "/etc/passwd"]],
    ["backslash", ["c", G, "photos", "a\\b"]],
    ["space", ["c", G, "photos", "a b"]],
    ["unicode", ["c", G, "photos", "café.jpg"]],
    ["null byte", ["c", G, "photos", "a\0b"]],
    ["percent", ["c", G, "photos", "%2e%2e"]],
    ["reserved suffix", ["c", G, "photos", "a.jpg.mime"]],
    ["empty kind", ["c", G, "", "a"]],
    ["slash in kind", ["c", G, "a/b", "a"]],
    ["upper kind", ["c", G, "Photos", "a"]],
    ["empty cell", ["", G, "photos", "a"]],
    ["slash in cell", ["a/b", G, "photos", "a"]],
    ["dotdot cell", ["..", G, "photos", "a"]],
    ["empty game", ["c", "", "photos", "a"]],
    ["short game", ["c", "ab", "photos", "a"]],
    ["slash in game", ["c", "AB/CD", "photos", "a"]],
    ["too deep", ["c", G, "photos", "a/b/c/d/e"]],
    ["too long", ["c", G, "photos", "a".repeat(600)]],
  ] as const)("rejects %s", (_n, [cell, game, kind, name]) => {
    expect(() => tenantKey(cell, game, kind, name)).toThrow(KeyError);
  });

  it("parseKey round trips and rejects non canonical keys", () => {
    const k = tenantKey("c1", G, "photos", "a.jpg");
    expect(parseKey(k)).toEqual({ cell: "c1", gameId: G, kind: "photos", name: "a.jpg" });
    for (const bad of ["", "c1/games/x", `c1/games/${G}/photos`, `c1/other/${G}/photos/a`, `c1/games/${G}/photos/../b`, `c1/games/${G}/photos//b`]) {
      expect(() => parseKey(bad)).toThrow(KeyError);
    }
  });

  it("assertKeyInGame rejects other games, other cells and prefix lookalikes", () => {
    const own = tenantKey("c1", G, "photos", "a.jpg");
    expect(assertKeyInGame(own, "c1", G).gameId).toBe(G);
    expect(() => assertKeyInGame(tenantKey("c1", H, "photos", "a.jpg"), "c1", G)).toThrow(KeyError);
    expect(() => assertKeyInGame(tenantKey("c2", G, "photos", "a.jpg"), "c1", G)).toThrow(KeyError);
    expect(() => assertKeyInGame(`c1/games/${G}x/photos/a`, "c1", G)).toThrow(KeyError);
    expect(belongsToGame(own, "c1", G)).toBe(true);
    expect(belongsToGame(`c1/games/${G}/photos/../../${H}/photos/a`, "c1", G)).toBe(false);
  });

  it("resolveBlobKey maps legacy keys into the cell and rejects foreign cells", () => {
    expect(resolveBlobKey("c1", "ABCD/photos/p.jpg")).toBe("c1/games/ABCD/photos/p.jpg");
    expect(resolveBlobKey("c1", "c1/games/ABCD/photos/p.jpg")).toBe("c1/games/ABCD/photos/p.jpg");
    expect(() => resolveBlobKey("c1", "c2/games/ABCD/photos/p.jpg")).toThrow(KeyError);
    expect(() => resolveBlobKey("c1", "ABCD")).toThrow(KeyError);
    expect(() => resolveBlobKey("c1", "ABCD/photos/../../EFGH/photos/x")).toThrow(KeyError);
  });

  it("resolveBlobPrefix stays inside one game and never above it", () => {
    expect(resolveBlobPrefix("c1", "ABCD")).toBe("c1/games/ABCD");
    expect(resolveBlobPrefix("c1", "ABCD/photos")).toBe("c1/games/ABCD/photos");
    expect(resolveBlobPrefix("c1", "c1/games/ABCD/")).toBe("c1/games/ABCD");
    for (const bad of ["", "/", "c1", "c1/games", "c1/games/", "c2/games/ABCD", "..", "ABCD/../EFGH", "AB"]) {
      expect(() => resolveBlobPrefix("c1", bad)).toThrow(KeyError);
    }
  });
});
