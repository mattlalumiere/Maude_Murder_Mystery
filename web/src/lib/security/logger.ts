export const REDACTED = "[redacted]";

export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Key names whose values are never logged. Matched case-insensitively after removing - and _. */
const SENSITIVE = [
  "token", "authorization", "cookie", "password", "passwd", "secret", "apikey", "privatekey", "credential",
  "override", "photo", "bytes", "buffer", "base64", "refs",
  "killerid", "truth", "nudges", "advanced", "backstory", "card", "databaseurl",
];

const COUNTER = /^(ai|input|output|total|prompt|completion|max)*tokens(used|count|per\w+)?$/;

const isSensitiveKey = (k: string) => {
  const n = k.toLowerCase().replace(/[-_]/g, "");
  if (COUNTER.test(n)) return false; // AI usage counters are not credentials
  return SENSITIVE.some((s) => n.includes(s));
};

/** Secret-looking fragments inside free text (messages, error strings, URLs). */
const TEXT_PATTERNS: [RegExp, string][] = [
  [/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;"']+/gi, `$1${REDACTED}`],
  [/(x-player-token\s*[:=]\s*)[^\s,;"']+/gi, `$1${REDACTED}`],
  [/(x-player-id\s*[:=]\s*)[^\s,;"']+/gi, `$1${REDACTED}`],
  [/(cookie\s*[:=]\s*)[^\n]+/gi, `$1${REDACTED}`],
  [/\b(bearer)\s+[A-Za-z0-9._~+\/-]+=*/gi, `$1 ${REDACTED}`],
  [/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, `$1${REDACTED}@`],
  [/((?:token|secret|password|api[_-]?key|override[_-]?code)\s*[=:]\s*)[^\s,;"'&]+/gi, `$1${REDACTED}`],
];

export const scrubText = (s: string) => TEXT_PATTERNS.reduce((acc, [re, to]) => acc.replace(re, to), s);

const MAX_DEPTH = 8;
const MAX_STRING = 2000;
const MAX_KEYS = 100;

function walk(v: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return scrubText(v.length > MAX_STRING ? v.slice(0, MAX_STRING) + "...[truncated]" : v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return String(v);
  if (typeof v === "function" || typeof v === "symbol") return undefined;
  if (typeof v !== "object") return undefined;
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return `[${(v as { byteLength: number }).byteLength} bytes]`;
  if (depth >= MAX_DEPTH) return "[depth]";
  if (seen.has(v)) return "[cycle]";
  seen.add(v);
  if (v instanceof Error) {
    return { name: v.name, message: scrubText(v.message), stack: v.stack ? scrubText(v.stack).split("\n").slice(0, 8).join("\n") : undefined };
  }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.slice(0, MAX_KEYS).map((x) => walk(x, depth + 1, seen));
  const o = v as Record<string, unknown>;
  const overrideShape = typeof o.cmd === "string" || o.type === "override";
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const k of Object.keys(o)) {
    if (++n > MAX_KEYS) { out["..."] = "[truncated]"; break; }
    if (isSensitiveKey(k) || (k === "code" && overrideShape)) { out[k] = REDACTED; continue; }
    try { out[k] = walk(o[k], depth + 1, seen); } catch { out[k] = "[unreadable]"; }
  }
  return out;
}

/** Deep, bounded, cycle safe redaction. Never throws. */
export function redact(v: unknown): unknown {
  try { return walk(v, 0, new WeakSet()); } catch { return "[unloggable]"; }
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level?: Level;
  sink?: (line: string) => void;
  now?: () => number;
  base?: Record<string, unknown>;
}

const envLevel = (): Level => {
  const l = (typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined) as Level | undefined;
  return l && l in ORDER ? l : "info";
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? envLevel();
  const sink = opts.sink ?? ((l: string) => { console.log(l); });
  const now = opts.now ?? Date.now;
  const base = opts.base ?? {};
  const emit = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return;
    try {
      const rec = { time: new Date(now()).toISOString(), level: lvl, msg: scrubText(String(msg)), ...(redact({ ...base, ...fields }) as object) };
      sink(JSON.stringify(rec));
    } catch { /* logging must never break a request */ }
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => createLogger({ ...opts, level, sink, now, base: { ...base, ...fields } }),
  };
}
