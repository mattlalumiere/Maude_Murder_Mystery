// Constant memory latency histograms and counters for the scale simulations.
const GROWTH = 1.02;
const MIN_MS = 0.0005;
const LOG_G = Math.log(GROWTH);

export class Histogram {
  private buckets = new Map<number, number>();
  count = 0;
  sum = 0;
  max = 0;
  add(ms: number) {
    this.count++;
    this.sum += ms;
    if (ms > this.max) this.max = ms;
    const i = Math.max(0, Math.floor(Math.log(Math.max(ms, MIN_MS) / MIN_MS) / LOG_G));
    this.buckets.set(i, (this.buckets.get(i) ?? 0) + 1);
  }
  /** q in [0,1]. Accurate to about 2 percent. */
  quantile(q: number): number {
    if (!this.count) return 0;
    const target = Math.ceil(q * this.count);
    let seen = 0;
    for (const i of [...this.buckets.keys()].sort((a, b) => a - b)) {
      seen += this.buckets.get(i)!;
      if (seen >= target) return Math.min(this.max, MIN_MS * Math.pow(GROWTH, i + 1));
    }
    return this.max;
  }
  summary() {
    return {
      n: this.count, mean: this.count ? this.sum / this.count : 0,
      p50: this.quantile(0.5), p95: this.quantile(0.95), p99: this.quantile(0.99), max: this.max,
    };
  }
}

export class Recorder {
  private h = new Map<string, Histogram>();
  status = new Map<string, number>();
  hist(op: string): Histogram {
    let x = this.h.get(op);
    if (!x) { x = new Histogram(); this.h.set(op, x); }
    return x;
  }
  add(op: string, ms: number, status?: number) {
    this.hist(op).add(ms);
    if (status !== undefined) { const k = `${op}:${status}`; this.status.set(k, (this.status.get(k) ?? 0) + 1); }
  }
  ops() { return [...this.h.keys()].sort(); }
  table(): Record<string, ReturnType<Histogram["summary"]>> {
    return Object.fromEntries(this.ops().map((o) => [o, this.hist(o).summary()]));
  }
  statuses(): Record<string, number> { return Object.fromEntries([...this.status.entries()].sort()); }
}

export const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/** Where tests drop JSON results for the report. Override with SCALE_OUT. */
export const resultsDir = () => {
  const d = process.env.SCALE_OUT || join(tmpdir(), "maude-t4-results");
  mkdirSync(d, { recursive: true });
  return d;
};
export function saveResult(name: string, data: unknown) {
  writeFileSync(join(resultsDir(), `${name}.json`), JSON.stringify(data, null, 2));
}

import v8 from "node:v8";
import vm from "node:vm";
let gcFn: (() => void) | null = null;
export function gc(): boolean {
  const g = (globalThis as { gc?: () => void }).gc;
  if (g) { g(); return true; }
  try {
    if (!gcFn) { v8.setFlagsFromString("--expose-gc"); gcFn = vm.runInNewContext("gc") as () => void; }
    gcFn();
    return true;
  } catch { return false; }
}
