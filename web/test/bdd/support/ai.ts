// A local OpenAI compatible fake model wired into the REAL gateway and REAL case pipeline.
// The only injected parts are the gateway's `sleep` and `random` (so retries never sleep) and the
// loopback address. The gateway is placed in the process wide holder that getTextModel() reads,
// which is the same object production code uses.
import { getAiConfig, resetAiState } from "../../../src/lib/ai/config";
import { createGateway, type Gateway } from "../../../src/lib/ai/gateway";
import { createOpenAiCompatible } from "../../../src/lib/ai/openai-compatible";
import { SAMPLE_CASE } from "../../../src/lib/sample-case";
import { startFakeServer, type Behaviour } from "./fake-server";
import type { MmWorld } from "./world";

export const sampleCaseJson = () => JSON.stringify(SAMPLE_CASE);

export interface ModelOptions {
  /** Where the model lives. "closed" = a port nobody listens on (connection refused). */
  server?: "fake" | "closed";
  fallback?: Behaviour;
  timeoutMs?: number;
  caseTimeoutMs?: number;
  env?: Record<string, string>;
}

export async function useModel(w: MmWorld, o: ModelOptions = {}): Promise<Gateway> {
  if (!w.fake) w.fake = await startFakeServer();
  const fake = w.fake;
  fake.fallback = o.fallback ?? { kind: "ok", content: sampleCaseJson() };
  const baseUrl = o.server === "closed" ? "http://127.0.0.1:1/v1" : fake.baseUrl;
  process.env.AI_TEXT_ADAPTER = "openai-compatible";
  process.env.AI_BASE_URL = baseUrl;
  process.env.AI_MODEL = "fake";
  process.env.AI_TIMEOUT_MS = String(o.timeoutMs ?? 5000);
  process.env.AI_CASE_TIMEOUT_MS = String(o.caseTimeoutMs ?? o.timeoutMs ?? 5000);
  for (const [k, v] of Object.entries(o.env ?? {})) process.env[k] = v;
  resetAiState();
  const cfg = getAiConfig();
  const ceiling = Math.max(cfg.timeoutMs, cfg.caseTimeoutMs);
  const inner = createOpenAiCompatible({ baseUrl, model: "fake", timeoutMs: ceiling, maxOutputTokens: Math.max(cfg.maxOutputTokens, cfg.caseMaxOutputTokens) });
  const gw = createGateway(inner, {
    maxConcurrent: cfg.maxConcurrent, maxQueue: cfg.maxQueue, maxRetries: cfg.maxRetries,
    backoffBaseMs: 1000, backoffMaxMs: 15_000, timeoutMs: cfg.timeoutMs,
    breakerFailures: cfg.breakerFailures, breakerCooldownMs: cfg.breakerCooldownMs,
    perGame: { maxRequests: cfg.gameRequestBudget, maxTokens: cfg.gameTokenBudget },
    global: { maxRequests: cfg.globalRequestsPerMin, maxTokens: cfg.globalTokensPerMin, windowMs: 60_000 },
    defaultMaxOutputTokens: cfg.maxOutputTokens,
    sleep: async () => {}, random: () => 0,
  });
  (globalThis as any).__mmAi.model = gw;
  w.s.gateway = gw;
  return gw;
}

export function gatewayOf(w: MmWorld): Gateway {
  const g = w.s.gateway as Gateway | undefined;
  if (!g) throw new Error("no text model configured in this scenario");
  return g;
}

export { resetAiState };
