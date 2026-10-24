import type { Room } from "../../../src/lib/types";
import type { ExpiredPage, Store } from "../../../src/lib/storage";

export interface FaultConfig {
  /** Added to every store call (models a network round trip to Postgres or a slow disk). */
  latencyMs: number;
  jitterMs: number;
  /** Probability that a call throws a generic error (what a dropped DB connection looks like to the route). */
  errorRate: number;
  down: boolean;
}

export class StoreDown extends Error {
  constructor(m = "store unavailable") { super(m); }
}

export interface StoreCounters {
  get: number; getById: number; put: number; putOk: number; putConflict: number; create: number;
  delete: number; listExpired: number; errors: number;
  /** Estimated bytes returned by get/getById (sampled). */
  bytesRead: number; bytesWritten: number;
  /** Reads where the returned room was non-null. */
  hits: number;
}

const zero = (): StoreCounters => ({
  get: 0, getById: 0, put: 0, putOk: 0, putConflict: 0, create: 0, delete: 0, listExpired: 0, errors: 0,
  bytesRead: 0, bytesWritten: 0, hits: 0,
});

/** Counting store wrapper with latency, error and outage injection. Wraps any real adapter. */
export class InstrumentedStore implements Store {
  c: StoreCounters = zero();
  fault: FaultConfig = { latencyMs: 0, jitterMs: 0, errorRate: 0, down: false };
  /** Measure bytes on every n-th read (JSON.stringify of a 40 kB room is not free). */
  sampleEvery = 1;
  private n = 0;
  private sampled = 0;
  private sampledBytes = 0;
  rng: () => number = Math.random;
  constructor(public inner: Store) {}

  reset() { this.c = zero(); this.n = 0; this.sampled = 0; this.sampledBytes = 0; }
  /** Average room size seen by reads, from the sampled reads. */
  avgReadBytes() { return this.sampled ? this.sampledBytes / this.sampled : 0; }
  estBytesRead() { return this.avgReadBytes() * this.c.hits; }

  private async gate() {
    const f = this.fault;
    if (f.down) { this.c.errors++; throw new StoreDown(); }
    if (f.latencyMs > 0 || f.jitterMs > 0) {
      await new Promise((r) => setTimeout(r, f.latencyMs + this.rng() * f.jitterMs));
    }
    if (f.errorRate > 0 && this.rng() < f.errorRate) { this.c.errors++; throw new StoreDown("injected store error"); }
  }
  private note(r: Room | null) {
    if (!r) return;
    this.c.hits++;
    if (this.n++ % this.sampleEvery === 0) { this.sampled++; this.sampledBytes += Buffer.byteLength(JSON.stringify(r)); }
  }

  async get(code: string) { this.c.get++; await this.gate(); const r = await this.inner.get(code); this.note(r); return r; }
  async getById(id: string) { this.c.getById++; await this.gate(); const r = await this.inner.getById(id); this.note(r); return r; }
  async put(room: Room, expected: number | null) {
    this.c.put++; if (expected === null) this.c.create++;
    await this.gate();
    const ok = await this.inner.put(room, expected);
    if (ok) this.c.putOk++; else this.c.putConflict++;
    return ok;
  }
  async listExpired(cell: string, limit: number, cursor?: string | null): Promise<ExpiredPage> {
    this.c.listExpired++; await this.gate(); return this.inner.listExpired(cell, limit, cursor);
  }
  async delete(id: string) { this.c.delete++; await this.gate(); return this.inner.delete(id); }
}
