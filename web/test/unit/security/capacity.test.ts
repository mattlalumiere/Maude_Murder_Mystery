import { describe, expect, it } from "vitest";
import {
  DEFAULTS, aiBoxesNeeded, caseGenerationsPerHourPerBox, cellsNeeded, egressBytesPerSec, placeGame,
  pollRequestsPerSec, podsNeeded, postgresSizing, report, storeOps, firstBottleneck, blobOps, type CellState,
} from "@/lib/security/capacity";

describe("request rate", () => {
  it("one game: (16 players + host + screen) / 2 s = 9 rps", () => {
    expect(pollRequestsPerSec({ ...DEFAULTS, games: 1 })).toBe(9);
  });
  it("10,000 games is 90,000 rps", () => {
    expect(pollRequestsPerSec({ ...DEFAULTS, games: 10_000 })).toBe(90_000);
  });
  it("scales linearly with games and inversely with the poll interval", () => {
    const a = pollRequestsPerSec({ ...DEFAULTS, games: 100 });
    expect(pollRequestsPerSec({ ...DEFAULTS, games: 200 })).toBe(2 * a);
    expect(pollRequestsPerSec({ ...DEFAULTS, games: 100, pollIntervalSec: 4 })).toBe(a / 2);
  });
});

describe("egress", () => {
  it("is dominated by changed responses even when they are rare", () => {
    const a = { ...DEFAULTS, games: 2000 };
    const e = egressBytesPerSec(a);
    const unchangedOnly = (pollRequestsPerSec(a) - pollRequestsPerSec(a) * 0) * a.unchangedBytes;
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(unchangedOnly + a.games * (a.playersPerGame + 2) * a.stateChangesPerGamePerSec * a.changedBytes + 1);
  });
  it("is exactly unchanged*100B + changed*20kB", () => {
    const a = { ...DEFAULTS, games: 1, playersPerGame: 8, stateChangesPerGamePerSec: 0.1 };
    // 10 devices, 5 polls/s, 1 changed response/s
    expect(egressBytesPerSec(a)).toBeCloseTo(4 * 100 + 1 * 20_000, 5);
  });
});

describe("pods", () => {
  it("applies target utilisation, spreads over zones and keeps a floor", () => {
    expect(podsNeeded({ rps: 1500, perPodRps: 1500, targetUtil: 0.5, zones: 3, minPods: 3 })).toBe(3);
    expect(podsNeeded({ rps: 18_000, perPodRps: 1500, targetUtil: 0.5, zones: 3, minPods: 3 })).toBe(24);
    expect(podsNeeded({ rps: 100, perPodRps: 1500, targetUtil: 0.5, zones: 3, minPods: 3 })).toBe(3);
  });
  it("rounds up to a multiple of the zone count", () => {
    expect(podsNeeded({ rps: 20_000, perPodRps: 1500, targetUtil: 0.5, zones: 3, minPods: 3 }) % 3).toBe(0);
  });
});

describe("store ops", () => {
  it("a read cache caps reads per game, the naive path reads on every poll", () => {
    const naive = storeOps({ ...DEFAULTS, games: 2000, readCacheReadsPerGamePerSec: Infinity });
    const cached = storeOps({ ...DEFAULTS, games: 2000 });
    expect(naive.readsPerSec).toBe(18_000);
    expect(cached.readsPerSec).toBe(2000 * DEFAULTS.readCacheReadsPerGamePerSec);
    expect(cached.readsPerSec).toBeLessThan(naive.readsPerSec);
  });
  it("writes follow state changes plus a media factor", () => {
    const o = storeOps({ ...DEFAULTS, games: 1000 });
    expect(o.writesPerSec).toBeCloseTo(1000 * DEFAULTS.writesPerGamePerSec, 5);
  });
});

describe("postgres sizing", () => {
  it("sizes connections from pods and WAL from write bytes", () => {
    const s = postgresSizing({ ...DEFAULTS, games: 2000 }, 24);
    expect(s.connections).toBe(24 * DEFAULTS.poolPerPod);
    expect(s.walMBPerSec).toBeGreaterThan(0);
    expect(s.activeDataGB).toBeCloseTo((2000 * DEFAULTS.rowBytes) / 1e9, 6);
  });
});

describe("blob ops", () => {
  it("puts scale with photos and generated media, gets with devices", () => {
    const b = blobOps({ ...DEFAULTS, games: 2000 });
    expect(b.putsPerSec).toBeGreaterThan(0);
    expect(b.getsPerSec).toBeGreaterThan(b.putsPerSec);
  });
});

describe("AI throughput", () => {
  it("40 tokens/s and 8,000 tokens per case is 18 cases per hour per box", () => {
    expect(caseGenerationsPerHourPerBox({ tokensPerSec: 40, tokensPerCase: 8000, prefillSecPerCase: 10, concurrencyGain: 1 })).toBe(17);
  });
  it("10,000 concurrent 2 hour games need thousands of local boxes, so cloud AI is required", () => {
    const boxes = aiBoxesNeeded({ games: 10_000, avgGameHours: 2, casesPerGame: 1, perBoxPerHour: 17 });
    expect(boxes).toBeGreaterThan(250);
  });
  it("more boxes never lowers capacity", () => {
    expect(aiBoxesNeeded({ games: 100, avgGameHours: 2, casesPerGame: 1, perBoxPerHour: 17 })).toBeLessThanOrEqual(
      aiBoxesNeeded({ games: 200, avgGameHours: 2, casesPerGame: 1, perBoxPerHour: 17 }));
  });
});

describe("cells", () => {
  it("needs cells for soft fill plus one spare for drain", () => {
    expect(cellsNeeded({ games: 10_000, cellCapacity: 2000, softFill: 0.8, spare: 1 })).toBe(8);
    expect(cellsNeeded({ games: 1, cellCapacity: 2000, softFill: 0.8, spare: 1 })).toBe(2);
  });
});

describe("placement", () => {
  const cells: CellState[] = [
    { id: "eu-1", region: "eu", active: 100, status: "open" },
    { id: "eu-2", region: "eu", active: 50, status: "open" },
    { id: "eu-3", region: "eu", active: 10, status: "draining" },
    { id: "eu-4", region: "eu", active: 1600, status: "open" },
    { id: "us-1", region: "us", active: 5, status: "open" },
  ];
  it("picks the least loaded open cell in the home region below the soft limit", () => {
    expect(placeGame(cells, { region: "eu", cellCapacity: 2000, softFill: 0.8 })?.id).toBe("eu-2");
  });
  it("never places into draining or full cells", () => {
    const only = cells.filter((c) => c.id === "eu-3" || c.id === "eu-4");
    expect(placeGame(only, { region: "eu", cellCapacity: 2000, softFill: 0.8 })).toBeNull();
  });
  it("spills to another region only when the home region has no room", () => {
    const home = cells.filter((c) => c.region === "eu").map((c) => ({ ...c, status: "draining" as const }));
    expect(placeGame([...home, ...cells.filter((c) => c.region === "us")], { region: "eu", cellCapacity: 2000, softFill: 0.8 })?.id).toBe("us-1");
    expect(placeGame(cells, { region: "eu", cellCapacity: 2000, softFill: 0.8, allowSpill: false })?.id).toBe("eu-2");
  });
  it("is deterministic on ties", () => {
    const tie: CellState[] = [{ id: "b", region: "eu", active: 5, status: "open" }, { id: "a", region: "eu", active: 5, status: "open" }];
    expect(placeGame(tie, { region: "eu", cellCapacity: 2000, softFill: 0.8 })?.id).toBe("a");
  });
});

describe("report and first bottleneck", () => {
  it("reports a 2,000 game cell", () => {
    const r = report({ ...DEFAULTS, games: 2000 });
    expect(r.rps).toBe(18_000);
    expect(r.pods).toBe(24);
    expect(r.egressMBps).toBeGreaterThan(0);
  });
  it("at 10x the first thing to break is the in-cell store read path without a cache, then pods", () => {
    const b = firstBottleneck({ ...DEFAULTS, games: 20_000, readCacheReadsPerGamePerSec: Infinity });
    expect(b.name).toBe("store-reads");
    const c = firstBottleneck({ ...DEFAULTS, games: 20_000 });
    expect(c.name).not.toBe("store-reads");
  });
});
