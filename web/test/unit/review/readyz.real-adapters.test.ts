// T1 review test. The developer test in test/unit/health.test.ts mocks getStore/getMediaStore, so it can
// never notice that the probe keys are rejected by the real key builder (KeyError), which makes
// /api/readyz answer 503 forever with the memory or file adapters. This test uses the REAL adapters.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const g = globalThis as unknown as { __mmStore?: unknown; __mmMedia?: unknown };
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "t1-readyz-"));
  delete g.__mmStore;
  delete g.__mmMedia;
  vi.stubEnv("MEDIA_ADAPTER", "file");
  vi.stubEnv("MEDIA_FILE_DIR", join(dir, "media"));
  vi.stubEnv("STORE_FILE_DIR", join(dir, "state"));
  vi.stubEnv("CELL_ID", "t1-cell");
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete g.__mmStore;
  delete g.__mmMedia;
  rmSync(dir, { recursive: true, force: true });
});

describe.each(["memory", "file"])("readyz against the real %s state adapter", (adapter) => {
  it("answers 200 ready when the store and the blob store are healthy", async () => {
    vi.stubEnv("STORE_ADAPTER", adapter);
    vi.resetModules();
    const { GET } = await import("@/app/api/readyz/route");
    const res = await GET();
    const body = await res.json();
    expect(body.checks).toEqual({ store: "ok", media: "ok" });
    expect(res.status).toBe(200);
  });
});
