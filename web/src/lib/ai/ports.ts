// Ports for AI. The app depends on these interfaces only; adapters live in sibling files.
// No vendor SDK may be imported outside an adapter file.
import type { Generated, ImageRequest } from "../media-gen";

// ---------- typed errors ----------
export type AiErrorCode = "timeout" | "rate_limited" | "bad_output" | "unavailable";

export abstract class AiError extends Error {
  abstract readonly code: AiErrorCode;
  /** True when trying the same call again later may succeed. */
  abstract readonly retryable: boolean;
  /** True when this failure says something about the health of the model server (feeds the circuit breaker). */
  abstract readonly infrastructure: boolean;
}

export class AiTimeoutError extends AiError {
  readonly code = "timeout" as const;
  readonly retryable = true;
  readonly infrastructure = true;
  constructor(message = "AI call timed out") { super(message); this.name = "AiTimeoutError"; }
}

export type RateLimitReason = "upstream" | "queue_full" | "game_budget" | "global_budget";
/** Backpressure: the call was refused locally (queue or budget) or by the server (429). */
export class AiRateLimitedError extends AiError {
  readonly code = "rate_limited" as const;
  readonly infrastructure = false;
  constructor(public reason: RateLimitReason, message = "AI is busy, try again later", public retryAfterMs?: number) {
    super(message); this.name = "AiRateLimitedError";
  }
  get retryable() { return this.reason === "upstream"; }
}

/** The model replied, but the reply is unusable (not JSON, truncated, empty, wrong shape). */
export class AiBadOutputError extends AiError {
  readonly code = "bad_output" as const;
  readonly retryable = false;
  readonly infrastructure = false;
  constructor(message: string, public truncated = false) { super(message); this.name = "AiBadOutputError"; }
}

export type UnavailableReason = "network" | "http" | "circuit_open" | "not_configured";
export class AiUnavailableError extends AiError {
  readonly code = "unavailable" as const;
  constructor(public reason: UnavailableReason, message = "AI is unavailable") { super(message); this.name = "AiUnavailableError"; }
  get retryable() { return this.reason === "network" || this.reason === "http"; }
  get infrastructure() { return this.reason === "network" || this.reason === "http"; }
}

// ---------- TextModel ----------
export interface TextRequest {
  system?: string;
  user: string;
  maxOutputTokens?: number;
  /** Overrides the gateway's default total deadline for this call (case generation is slow). */
  timeoutMs?: number;
  temperature?: number;
  /** Per game accounting key (never user visible). */
  gameId?: string;
  /** Aborted by the gateway at the total deadline. Adapters should honour it. */
  signal?: AbortSignal;
}

export interface TextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  finishReason: "stop" | "length" | "other";
  latencyMs: number;
}

export interface TextModel {
  readonly id: string;
  generate(req: TextRequest): Promise<TextResult>;
}

// ---------- ImageModel and Moderator ----------
export type { ImageRequest, Generated };
export interface ImageModel {
  readonly id: string;
  generate(req: ImageRequest): Promise<Generated>;
}

export interface ModerationResult { ok: boolean; reason?: string }
export interface Moderator {
  readonly id: string;
  moderate(bytes: Buffer): Promise<ModerationResult>;
}

/** Rough token estimate, deliberately pessimistic for mixed English and JSON. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3);
