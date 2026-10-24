import type { Clock } from "../../../src/lib/ids";

/** Virtual clock: starts at the real time so store TTL checks (real Date.now) stay consistent. */
export class VirtualClock implements Clock {
  private t: number;
  constructor(start = Date.now()) { this.t = start; }
  now() { return this.t; }
  set(ms: number) { this.t = ms; }
  advance(ms: number) { this.t += ms; }
}
