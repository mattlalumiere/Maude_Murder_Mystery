import { describe, expect, it } from "vitest";
import { estimate, imageCost, PRICES, pricesFor, profileFromEnv, videoCost, LOCAL_PRICES } from "@/lib/budget";
import { TIERS } from "@/lib/budget";

describe("local pricing profile", () => {
  it("is selected by AI_TEXT_ADAPTER=openai-compatible", () => {
    expect(profileFromEnv({ AI_TEXT_ADAPTER: "openai-compatible" })).toBe("local");
    expect(profileFromEnv({ AI_TEXT_ADAPTER: "bedrock" })).toBe("aws");
    expect(profileFromEnv({})).toBe("aws");
    expect(pricesFor("local")).toBe(LOCAL_PRICES);
  });
  it("prices everything at zero", () => {
    const local = pricesFor("local");
    expect(local.textPerGame).toBe(0);
    expect(imageCost("premium", local)).toBe(0);
    expect(videoCost(local)).toBe(0);
    for (const t of TIERS) expect(estimate(t.plan, 12, 12, local).total).toBe(0);
  });
  it("leaves the default aws table untouched", () => {
    expect(PRICES.textPerGame).toBe(0.4);
    expect(imageCost("standard")).toBe(0.04);
    expect(estimate(TIERS[3].plan, 10).total).toBeGreaterThan(1);
  });
  it("carries a per game token budget for the local profile", () => {
    expect(LOCAL_PRICES.gameTokenBudget).toBeGreaterThan(10_000);
  });
});
