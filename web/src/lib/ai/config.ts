// Reads the AI configuration from the environment and builds the guarded TextModel.
// Adapters are chosen by environment only. See docs/platform/CONTRACT.md for the variable table.
import { pricesFor, profileFromEnv } from "../budget";
import { createBedrockText } from "./bedrock-text";
import { createGateway, type Gateway } from "./gateway";
import { createOpenAiCompatible } from "./openai-compatible";

export type TextAdapterName = "sample" | "openai-compatible" | "bedrock";
type Env = Record<string, string | undefined>;

export interface AiConfig {
  adapter: TextAdapterName;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Case generation is much longer than a chat turn on local hardware, so it has its own ceilings. */
  caseTimeoutMs: number;
  caseMaxOutputTokens: number;
  maxConcurrent: number;
  maxQueue: number;
  maxRetries: number;
  breakerFailures: number;
  breakerCooldownMs: number;
  gameTokenBudget: number;
  gameRequestBudget: number;
  globalRequestsPerMin: number;
  globalTokensPerMin: number;
  /** Set when the adapter was asked for but cannot be built (for example no base URL). */
  misconfigured?: string;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

export function readAiConfig(env: Env): AiConfig {
  const asked = env.AI_TEXT_ADAPTER;
  const adapter: TextAdapterName =
    asked === "openai-compatible" || asked === "bedrock" || asked === "sample" ? asked
      : env.BEDROCK_MODEL_ID ? "bedrock" : "sample"; // legacy: BEDROCK_MODEL_ID alone still enables Bedrock
  const prices = pricesFor(profileFromEnv({ AI_TEXT_ADAPTER: adapter }));
  const cfg: AiConfig = {
    adapter,
    baseUrl: env.AI_BASE_URL || undefined,
    model: env.AI_MODEL || undefined,
    apiKey: env.AI_API_KEY || undefined,
    timeoutMs: num(env.AI_TIMEOUT_MS, 60_000),
    maxOutputTokens: num(env.AI_MAX_OUTPUT_TOKENS, 4096),
    caseTimeoutMs: num(env.AI_CASE_TIMEOUT_MS, 300_000),
    caseMaxOutputTokens: num(env.AI_CASE_MAX_OUTPUT_TOKENS, 9000),
    maxConcurrent: num(env.AI_MAX_CONCURRENCY, 2),
    maxQueue: num(env.AI_MAX_QUEUE, 8),
    maxRetries: num(env.AI_MAX_RETRIES, 1),
    breakerFailures: num(env.AI_BREAKER_FAILURES, 3),
    breakerCooldownMs: num(env.AI_BREAKER_COOLDOWN_MS, 30_000),
    gameTokenBudget: num(env.AI_GAME_TOKEN_BUDGET, prices.gameTokenBudget),
    gameRequestBudget: num(env.AI_GAME_REQUEST_BUDGET, 12),
    globalRequestsPerMin: num(env.AI_GLOBAL_REQUESTS_PER_MIN, 120),
    globalTokensPerMin: num(env.AI_GLOBAL_TOKENS_PER_MIN, 400_000),
  };
  if (adapter === "openai-compatible" && !cfg.baseUrl) cfg.misconfigured = "AI_BASE_URL is not set";
  if (adapter === "bedrock" && !env.BEDROCK_MODEL_ID && !cfg.model) cfg.misconfigured = "BEDROCK_MODEL_ID is not set";
  return cfg;
}

/** Builds the guarded text model, or null when the sample case should be used. */
export function resolveTextModel(cfg: AiConfig, env: Env = process.env): Gateway | null {
  if (cfg.adapter === "sample" || cfg.misconfigured) return null;
  const ceiling = Math.max(cfg.timeoutMs, cfg.caseTimeoutMs);
  const inner = cfg.adapter === "openai-compatible"
    ? createOpenAiCompatible({
        baseUrl: cfg.baseUrl!, model: cfg.model ?? "default", apiKey: cfg.apiKey,
        timeoutMs: ceiling, maxOutputTokens: Math.max(cfg.maxOutputTokens, cfg.caseMaxOutputTokens),
      })
    : createBedrockText({ modelId: (env.BEDROCK_MODEL_ID ?? cfg.model)!, region: env.AWS_REGION });
  return createGateway(inner, {
    maxConcurrent: cfg.maxConcurrent, maxQueue: cfg.maxQueue, maxRetries: cfg.maxRetries,
    backoffBaseMs: 1000, backoffMaxMs: 15_000, timeoutMs: cfg.timeoutMs,
    breakerFailures: cfg.breakerFailures, breakerCooldownMs: cfg.breakerCooldownMs,
    perGame: { maxRequests: cfg.gameRequestBudget, maxTokens: cfg.gameTokenBudget },
    global: { maxRequests: cfg.globalRequestsPerMin, maxTokens: cfg.globalTokensPerMin, windowMs: 60_000 },
    defaultMaxOutputTokens: cfg.maxOutputTokens,
  });
}

// ---------- process wide singleton and the visible "degraded" flag ----------
export interface DegradedRecord { reason: string; at: number; count: number }
interface Holder { cfgKey?: string; cfg?: AiConfig; model?: Gateway | null; degraded?: DegradedRecord }
const g = globalThis as unknown as { __mmAi?: Holder };
const holder = (): Holder => (g.__mmAi ??= {});

export function getAiConfig(): AiConfig {
  const h = holder();
  const key = JSON.stringify([process.env.AI_TEXT_ADAPTER, process.env.AI_BASE_URL, process.env.AI_MODEL, process.env.BEDROCK_MODEL_ID]);
  if (!h.cfg || h.cfgKey !== key) { h.cfg = readAiConfig(process.env); h.cfgKey = key; h.model = undefined; }
  return h.cfg;
}

export function getTextModel(): Gateway | null {
  const cfg = getAiConfig();
  const h = holder();
  if (h.model === undefined) h.model = resolveTextModel(cfg);
  return h.model;
}

/** Called by the case pipeline whenever it had to fall back. The host console reads this via getAiStatus(). */
export function noteDegraded(reason: string) {
  const h = holder();
  h.degraded = { reason, at: Date.now(), count: (h.degraded?.count ?? 0) + 1 };
}
export function noteHealthy() { delete holder().degraded; }
export function resetAiState() { delete g.__mmAi; }

export interface AiStatus {
  adapter: TextAdapterName;
  configured: boolean;
  degraded: boolean;
  degradedReason?: string;
  breaker?: string;
  inFlight?: number;
  queued?: number;
  misconfigured?: string;
}
/** Safe to show on the host console: no keys, no URLs, no prompts. */
export function getAiStatus(): AiStatus {
  const cfg = getAiConfig();
  const m = getTextModel();
  const s = m?.status();
  const d = holder().degraded;
  return {
    adapter: cfg.adapter, configured: !!m, degraded: !!d || !!cfg.misconfigured || s?.breaker === "open",
    degradedReason: d?.reason ?? cfg.misconfigured ?? (s?.breaker === "open" ? "AI circuit breaker is open" : undefined),
    breaker: s?.breaker, inFlight: s?.inFlight, queued: s?.queued, misconfigured: cfg.misconfigured,
  };
}
