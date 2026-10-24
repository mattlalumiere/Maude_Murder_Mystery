import { describe, expect, it } from "vitest";
import { readAiConfig, resolveTextModel } from "@/lib/ai/config";

describe("AI config", () => {
  it("defaults to the sample adapter with no configuration", () => {
    const c = readAiConfig({});
    expect(c.adapter).toBe("sample");
    expect(resolveTextModel(c)).toBeNull();
  });
  it("keeps legacy BEDROCK_MODEL_ID working when no adapter is set", () => {
    expect(readAiConfig({ BEDROCK_MODEL_ID: "x" }).adapter).toBe("bedrock");
  });
  it("reads the openai-compatible settings with contract defaults", () => {
    const c = readAiConfig({ AI_TEXT_ADAPTER: "openai-compatible", AI_BASE_URL: "http://h:8080/v1", AI_MODEL: "m" });
    expect(c).toMatchObject({ adapter: "openai-compatible", baseUrl: "http://h:8080/v1", model: "m", timeoutMs: 60000, maxOutputTokens: 4096, maxConcurrent: 2 });
  });
  it("ignores nonsense numbers", () => {
    expect(readAiConfig({ AI_TEXT_ADAPTER: "openai-compatible", AI_TIMEOUT_MS: "abc", AI_MAX_CONCURRENCY: "-3" })).toMatchObject({ timeoutMs: 60000, maxConcurrent: 2 });
  });
  it("treats openai-compatible without a base URL as unconfigured (sample, degraded)", () => {
    const c = readAiConfig({ AI_TEXT_ADAPTER: "openai-compatible" });
    expect(resolveTextModel(c)).toBeNull();
    expect(c.misconfigured).toMatch(/AI_BASE_URL/);
  });
  it("builds a guarded model for a configured endpoint", () => {
    const m = resolveTextModel(readAiConfig({ AI_TEXT_ADAPTER: "openai-compatible", AI_BASE_URL: "http://127.0.0.1:1/v1", AI_MODEL: "m" }));
    expect(m?.id).toBe("openai-compatible:m");
    expect(m?.status().breaker).toBe("closed");
  });
});

import { getAiStatus, noteDegraded, noteHealthy, resetAiState } from "@/lib/ai/config";
describe("degraded flag", () => {
  it("is visible in getAiStatus after a fallback and cleared on success", () => {
    resetAiState();
    expect(getAiStatus().degraded).toBe(false);
    noteDegraded("AI timed out");
    expect(getAiStatus()).toMatchObject({ degraded: true, degradedReason: "AI timed out" });
    noteHealthy();
    expect(getAiStatus().degraded).toBe(false);
    resetAiState();
  });
  it("never exposes keys or URLs", () => {
    resetAiState();
    expect(JSON.stringify(getAiStatus())).not.toMatch(/http|key/i);
  });
});
