import { AiBadOutputError } from "./ports";

/** Removes reasoning blocks some local models emit before the answer. */
export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "");

/**
 * Pulls the first top-level JSON object out of model text. Tolerates code fences, leading prose and
 * trailing text. Throws AiBadOutputError (truncated=true when the object never closes).
 */
export function extractJson(text: string): Record<string, unknown> {
  const s = stripThink(text);
  const start = s.indexOf("{");
  if (start < 0) throw new AiBadOutputError("No JSON object in model output");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const v: unknown = JSON.parse(s.slice(start, i + 1));
        if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
      } catch { /* fall through */ }
      throw new AiBadOutputError("Model output is not valid JSON");
    }
  }
  throw new AiBadOutputError("Model output was cut off before the JSON closed", true);
}
