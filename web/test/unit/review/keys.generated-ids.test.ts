// T1 review test: ids produced by the engine (base64url, so they may start with "-" or "_") must be
// accepted by the tenant key builder, in every segment position the app uses. A previous version of the
// key regex rejected them about 3 percent of the time ("KeyError: bad name segment"), which showed up as an
// intermittent failure. This test is deterministic: it brute-forces every possible first character.
import { describe, expect, it } from "vitest";
import { parseKey, resolveBlobKey, tenantKey } from "@/lib/storage";
import { seededRandom } from "@/lib/ids";

const G = "01HZX3K9Q2M8N7P6R5T4V3W2YZ";
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

describe("tenant keys accept every base64url first character", () => {
  it.each([...B64URL])("name starting with %s", (ch) => {
    const name = `${ch}abcDEF123`;
    const key = tenantKey("local-0", G, "photos", name);
    expect(key).toBe(`local-0/games/${G}/photos/${name}`);
    expect(parseKey(key).name).toBe(name);
    expect(tenantKey("local-0", G, "photos", `${name}.jpg`)).toBe(`${key}.jpg`);
    expect(resolveBlobKey("local-0", `${G}/photos/${name}.jpg`)).toBe(`${key}.jpg`);
  });

  it("2000 seeded engine style ids (Buffer base64url of random bytes) all build and round trip", () => {
    const rnd = seededRandom(20260101);
    let dashOrUnderscoreStart = 0;
    for (let i = 0; i < 2000; i++) {
      const id = Buffer.from(rnd.bytes(6)).toString("base64url");
      if (/^[-_]/.test(id)) dashOrUnderscoreStart++;
      const k = tenantKey("local-0", G, "photos", `${id}.jpg`);
      expect(parseKey(k).name).toBe(`${id}.jpg`);
    }
    expect(dashOrUnderscoreStart).toBeGreaterThan(0); // the sample really exercises the risky case
  });
});

describe("tenant keys still refuse dot files and traversal", () => {
  it.each([".hidden", "..", "a/../b", "-/../x"])("rejects %s", (name) => {
    expect(() => tenantKey("local-0", G, "photos", name)).toThrow();
  });
});
