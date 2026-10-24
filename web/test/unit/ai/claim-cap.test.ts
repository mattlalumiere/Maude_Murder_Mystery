import { beforeEach, describe, expect, it } from "vitest";
import { createRoom, addPlayer } from "@/lib/engine";
import { claim, runNext } from "@/lib/media-runner";
import { getStore, mutate } from "@/lib/store";
import type { MediaItem, Room } from "@/lib/types";

async function roomWithJobs(cap: number, n: number, cost: number) {
  const room = await createRoom("host", "override-code", {}, cap);
  const { room: r } = await mutate(room.code, (x) => {
    x.budget.plan = { avatars: true, scenesPerAct: 1, videoClips: 0, quality: "standard", paused: false };
    for (let i = 0; i < n; i++) {
      x.media.push({ id: `m${i}`, kind: "scene", phase: "act1", playerIds: [], prompt: "p", caption: `c${i}`, status: "queued", estCostUsd: cost, createdAt: Date.now() });
    }
  });
  return r;
}

describe("claim() hard spend cap", () => {
  beforeEach(() => { (globalThis as { __mmStore?: unknown }).__mmStore = undefined; });

  it("never reserves more than the cap in a single room snapshot", async () => {
    const r = await roomWithJobs(1, 10, 0.4);
    const claimed: (MediaItem | null)[] = [];
    for (let i = 0; i < 10; i++) claimed.push(claim(r));
    expect(claimed.filter(Boolean).length).toBe(2);
    expect(r.budget.reservedUsd).toBeCloseTo(0.8);
    expect(r.media.filter((m) => m.status === "skipped").length).toBe(8);
  });

  it("holds the cap when many runNext calls race on the same game", async () => {
    const r = await roomWithJobs(1, 12, 0.4);
    const results = await Promise.all(Array.from({ length: 12 }, () => runNext(r.code).catch(() => ({ ran: false }))));
    const room = (await getStore().get(r.code)) as Room;
    expect(room.budget.spentUsd).toBeLessThanOrEqual(1 + 1e-9);
    expect(room.budget.spentUsd + room.budget.reservedUsd).toBeLessThanOrEqual(1 + 1e-9);
    expect(room.media.filter((m) => m.status === "done").length).toBeLessThanOrEqual(2);
    expect(results.length).toBe(12);
  });

  it("drains sequentially to exactly the affordable number of jobs", async () => {
    const r = await roomWithJobs(1, 6, 0.3);
    for (let i = 0; i < 10; i++) await runNext(r.code);
    const room = (await getStore().get(r.code)) as Room;
    expect(room.media.filter((m) => m.status === "done").length).toBe(3);
    expect(room.budget.spentUsd).toBeCloseTo(0.9);
    expect(room.budget.reservedUsd).toBeCloseTo(0);
  });

  it("zero cost local jobs all run under the same accounting", async () => {
    const r = await roomWithJobs(1, 5, 0);
    for (let i = 0; i < 8; i++) await runNext(r.code);
    const room = (await getStore().get(r.code)) as Room;
    expect(room.media.filter((m) => m.status === "done").length).toBe(5);
    expect(room.budget.spentUsd).toBe(0);
  });

  void addPlayer;
});
