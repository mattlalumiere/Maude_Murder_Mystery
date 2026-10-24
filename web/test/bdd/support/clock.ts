import type { Clock } from "../../../src/lib/ids";

/** A clock that only moves when a step says so. Scenarios never sleep. */
export class ManualClock implements Clock {
  constructor(public t = Date.now()) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
