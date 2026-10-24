import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Constant-time string equality for tokens and secrets.
 * Both sides are hashed first so length differences do not leak through timing.
 * Missing or empty values never match, so an absent header cannot authenticate.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) return false;
  return timingSafeEqual(digest(a), digest(b));
}
