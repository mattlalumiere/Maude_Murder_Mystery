/**
 * Executable capacity model. Pure functions, no I/O. Every number in docs/platform/scale/capacity-model.md
 * comes from here; change an assumption in DEFAULTS and the doc's tables must be regenerated with `report()`.
 */
export interface Assumptions {
  games: number;
  playersPerGame: number;
  /** Host console plus big screen. */
  extraDevicesPerGame: number;
  pollIntervalSec: number;
  unchangedBytes: number;
  changedBytes: number;
  /** State changes per game per second (phase moves, ready, ballots, media completing). */
  stateChangesPerGamePerSec: number;
  /** Max store reads per game per second once pods keep a short read cache. Infinity means no cache. */
  readCacheReadsPerGamePerSec: number;
  /** Store writes per game per second (state changes plus media job bookkeeping). */
  writesPerGamePerSec: number;
  perPodRps: number;
  targetUtil: number;
  zones: number;
  minPods: number;
  poolPerPod: number;
  rowBytes: number;
  walAmplification: number;
  photoFraction: number;
  mediaItemsPerGame: number;
  avgGameHours: number;
  // Ceilings used by firstBottleneck (per cell)
  storeReadOpsCeiling: number;
  storeWriteOpsCeiling: number;
  pgConnectionsCeiling: number;
  maxPodsPerCell: number;
  egressCeilingMBps: number;
}

export const DEFAULTS: Assumptions = {
  games: 2000,
  playersPerGame: 16,
  extraDevicesPerGame: 2,
  pollIntervalSec: 2,
  unchangedBytes: 100,
  changedBytes: 20_000,
  stateChangesPerGamePerSec: 0.1,
  readCacheReadsPerGamePerSec: 1,
  writesPerGamePerSec: 0.15,
  perPodRps: 1500,
  targetUtil: 0.5,
  zones: 3,
  minPods: 3,
  poolPerPod: 5,
  rowBytes: 40_000,
  walAmplification: 2,
  photoFraction: 0.5,
  mediaItemsPerGame: 20,
  avgGameHours: 2,
  storeReadOpsCeiling: 50_000,
  storeWriteOpsCeiling: 5000,
  pgConnectionsCeiling: 500,
  maxPodsPerCell: 200,
  egressCeilingMBps: 1000,
};

const devices = (a: Assumptions) => a.playersPerGame + a.extraDevicesPerGame;

export const pollRequestsPerSec = (a: Assumptions) => (a.games * devices(a)) / a.pollIntervalSec;

/** Changed responses carry the full state; every other poll is the small unchanged reply. */
export function egressBytesPerSec(a: Assumptions): number {
  const total = pollRequestsPerSec(a);
  const changed = Math.min(total, a.games * devices(a) * a.stateChangesPerGamePerSec);
  return (total - changed) * a.unchangedBytes + changed * a.changedBytes;
}

export function podsNeeded(p: { rps: number; perPodRps: number; targetUtil: number; zones: number; minPods: number }): number {
  const raw = Math.ceil(p.rps / (p.perPodRps * p.targetUtil));
  const n = Math.max(raw, p.minPods);
  return Math.ceil(n / p.zones) * p.zones;
}

export function storeOps(a: Assumptions): { readsPerSec: number; writesPerSec: number } {
  const perGameReads = Math.min(devices(a) / a.pollIntervalSec, a.readCacheReadsPerGamePerSec);
  return { readsPerSec: a.games * perGameReads, writesPerSec: a.games * a.writesPerGamePerSec };
}

export function postgresSizing(a: Assumptions, pods: number) {
  const { writesPerSec } = storeOps(a);
  return {
    connections: pods * a.poolPerPod,
    walMBPerSec: (writesPerSec * a.rowBytes * a.walAmplification) / 1e6,
    activeDataGB: (a.games * a.rowBytes) / 1e9,
    writeIops: writesPerSec * 2,
  };
}

export function blobOps(a: Assumptions): { putsPerSec: number; getsPerSec: number } {
  const life = a.avgGameHours * 3600;
  const putsPerGame = a.playersPerGame * a.photoFraction + a.mediaItemsPerGame;
  // Each device fetches each generated item once (browser cache), the runner re-reads photo refs for avatars and scenes.
  const getsPerGame = devices(a) * a.mediaItemsPerGame + a.playersPerGame * a.photoFraction * 2;
  return { putsPerSec: (a.games * putsPerGame) / life, getsPerSec: (a.games * getsPerGame) / life };
}

export function caseGenerationsPerHourPerBox(p: { tokensPerSec: number; tokensPerCase: number; prefillSecPerCase: number; concurrencyGain: number }): number {
  const secs = p.tokensPerCase / p.tokensPerSec + p.prefillSecPerCase;
  return Math.floor((3600 * p.concurrencyGain) / secs);
}

export function aiBoxesNeeded(p: { games: number; avgGameHours: number; casesPerGame: number; perBoxPerHour: number }): number {
  const startsPerHour = (p.games * p.casesPerGame) / p.avgGameHours;
  return Math.ceil(startsPerHour / p.perBoxPerHour);
}

/** Little's law: average queue wait for an M/M/c-ish queue is bounded below by service time; this gives items in system. */
export const itemsInSystem = (arrivalPerSec: number, serviceSec: number) => arrivalPerSec * serviceSec;

export function cellsNeeded(p: { games: number; cellCapacity: number; softFill: number; spare: number }): number {
  return Math.ceil(p.games / (p.cellCapacity * p.softFill)) + p.spare;
}

export interface CellState { id: string; region: string; active: number; status: "open" | "draining" | "full" }
export interface PlaceOptions { region: string; cellCapacity: number; softFill: number; allowSpill?: boolean }

/** Least loaded open cell below the soft fill limit, home region first. Ties break on id so placement is deterministic. */
export function placeGame(cells: CellState[], o: PlaceOptions): CellState | null {
  const limit = o.cellCapacity * o.softFill;
  const ok = cells.filter((c) => c.status === "open" && c.active < limit);
  const best = (list: CellState[]) => [...list].sort((x, y) => x.active - y.active || x.id.localeCompare(y.id))[0] ?? null;
  return best(ok.filter((c) => c.region === o.region)) ?? (o.allowSpill === false ? null : best(ok));
}

export function report(a: Assumptions) {
  const rps = pollRequestsPerSec(a);
  const pods = podsNeeded({ rps, perPodRps: a.perPodRps, targetUtil: a.targetUtil, zones: a.zones, minPods: a.minPods });
  const ops = storeOps(a);
  return {
    rps,
    pods,
    egressMBps: egressBytesPerSec(a) / 1e6,
    storeReadsPerSec: ops.readsPerSec,
    storeWritesPerSec: ops.writesPerSec,
    postgres: postgresSizing(a, pods),
    blob: blobOps(a),
  };
}

/** Which per-cell ceiling is exceeded by the largest ratio. A ratio above 1 means that component breaks first. */
export function firstBottleneck(a: Assumptions): { name: string; ratio: number; ratios: Record<string, number> } {
  const r = report(a);
  const ratios: Record<string, number> = {
    "store-reads": r.storeReadsPerSec / a.storeReadOpsCeiling,
    "store-writes": r.storeWritesPerSec / a.storeWriteOpsCeiling,
    "pg-connections": r.postgres.connections / a.pgConnectionsCeiling,
    pods: r.pods / a.maxPodsPerCell,
    egress: r.egressMBps / a.egressCeilingMBps,
  };
  const [name, ratio] = Object.entries(ratios).sort((x, y) => y[1] - x[1])[0];
  return { name, ratio, ratios };
}
