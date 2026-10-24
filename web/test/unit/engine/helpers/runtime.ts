import { afterEach, beforeEach } from "vitest";
import { seededRandom, setRuntime, type Clock } from "../../../../src/lib/ids";

export class ManualClock implements Clock {
  constructor(public t = Date.UTC(2026, 0, 1)) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

/** Installs a manual clock and a seeded random for the duration of each test. */
export function useDeterministicRuntime(seed = 1) {
  const state = { clock: new ManualClock(), restore: () => {} };
  beforeEach(() => {
    state.clock = new ManualClock();
    state.restore = setRuntime({ clock: state.clock, random: seededRandom(seed) });
  });
  afterEach(() => state.restore());
  return state;
}
