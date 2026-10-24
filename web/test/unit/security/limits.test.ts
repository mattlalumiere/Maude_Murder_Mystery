import { describe, expect, it } from "vitest";
import { LIMITS, RATE_LIMITS } from "@/lib/security/limits";
import { ROUTE_CLASSES } from "@/lib/security/rate-limit";

describe("limits", () => {
  it("every quota is a positive finite number", () => {
    for (const [k, v] of Object.entries(LIMITS)) {
      expect(Number.isFinite(v) && v > 0, k).toBe(true);
    }
  });
  it("a rate rule exists for every route class, per scope", () => {
    for (const cls of ROUTE_CLASSES) {
      expect(RATE_LIMITS.game[cls], `game ${cls}`).toBeDefined();
      expect(RATE_LIMITS.ip[cls], `ip ${cls}`).toBeDefined();
    }
  });
  it("a full game's polling fits inside the per game state rule (16 players + host + screen, 2 s)", () => {
    const steady = (LIMITS.typicalPlayersPerGame + 2) / 2;
    expect(RATE_LIMITS.game.state.refillPerSec).toBeGreaterThan(steady * 1.5);
  });
  it("per ip rules are at least as permissive as per game for state (a party shares one NAT)", () => {
    expect(RATE_LIMITS.ip.state.capacity).toBeGreaterThanOrEqual(RATE_LIMITS.game.state.capacity);
  });
  it("photo limit never exceeds the body limit and join code space beats active game count", () => {
    expect(LIMITS.maxPhotoBytes).toBeLessThanOrEqual(LIMITS.maxPhotoBodyBytes);
    expect(31 ** LIMITS.joinCodeLength).toBeGreaterThan(LIMITS.activeGamesTarget * 10_000);
  });
});
