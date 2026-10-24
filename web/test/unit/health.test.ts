import { afterEach, describe, expect, it, vi } from "vitest";

const storeGet = vi.fn();
const mediaGet = vi.fn();
vi.mock("@/lib/store", () => ({ getStore: () => ({ get: storeGet }) }));
vi.mock("@/lib/media-store", () => ({ getMediaStore: () => ({ get: mediaGet }) }));

import { GET as healthz } from "@/app/api/healthz/route";
import { GET as readyz } from "@/app/api/readyz/route";

afterEach(() => {
  vi.unstubAllEnvs();
  storeGet.mockReset();
  mediaGet.mockReset();
});

describe("healthz", () => {
  it("is always 200 and does not touch the stores", async () => {
    storeGet.mockRejectedValue(new Error("down"));
    const res = await healthz();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(storeGet).not.toHaveBeenCalled();
    expect(mediaGet).not.toHaveBeenCalled();
  });
});

describe("readyz", () => {
  it("returns 200 with adapter names, cell and region when both stores answer", async () => {
    vi.stubEnv("STORE_ADAPTER", "file");
    vi.stubEnv("MEDIA_ADAPTER", "s3");
    vi.stubEnv("CELL_ID", "c-7");
    vi.stubEnv("REGION_ID", "r-1");
    storeGet.mockResolvedValue(null);
    mediaGet.mockResolvedValue(null);
    const res = await readyz();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.adapters).toMatchObject({ store: "file", media: "s3" });
    expect(body.cell).toBe("c-7");
    expect(body.region).toBe("r-1");
  });

  it("returns 503 when the store fails", async () => {
    storeGet.mockRejectedValue(new Error("boom"));
    mediaGet.mockResolvedValue(null);
    const res = await readyz();
    expect(res.status).toBe(503);
    expect((await res.json()).checks).toEqual({ store: "fail", media: "ok" });
  });

  it("returns 503 when the blob store fails", async () => {
    storeGet.mockResolvedValue(null);
    mediaGet.mockRejectedValue(new Error("boom"));
    const res = await readyz();
    expect(res.status).toBe(503);
    expect((await res.json()).checks).toEqual({ store: "ok", media: "fail" });
  });

  it("never leaks secrets or connection strings, even from error messages", async () => {
    vi.stubEnv("AUTH_SECRET", "super-secret-value");
    vi.stubEnv("DATABASE_URL", "postgres://user:hunter2@db/x");
    vi.stubEnv("AI_API_KEY", "sk-leak");
    storeGet.mockRejectedValue(new Error("connect postgres://user:hunter2@db/x"));
    mediaGet.mockResolvedValue(null);
    const text = JSON.stringify(await (await readyz()).json());
    for (const s of ["super-secret-value", "hunter2", "sk-leak", "postgres://"]) expect(text).not.toContain(s);
  });

  it("fails fast when a dependency hangs", async () => {
    vi.useFakeTimers();
    storeGet.mockReturnValue(new Promise(() => {}));
    mediaGet.mockResolvedValue(null);
    const p = readyz();
    await vi.advanceTimersByTimeAsync(2500);
    const res = await p;
    vi.useRealTimers();
    expect(res.status).toBe(503);
  });
});
