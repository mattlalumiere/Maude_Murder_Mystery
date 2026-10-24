// Storage configuration and per game limits. One place for defaults.
// W10 may later own the shared quota config; this module is the storage consumer of it.
import { QuotaExceededError } from "./errors";

export interface StorageLimits {
  /** Max bytes stored under one game's blob prefix. Default 200 MiB (about 100 phone photos). */
  maxGameBytes: number;
  /** Max bytes for a single blob. Default 12 MiB (a phone photo or a short video clip). */
  maxBlobBytes: number;
  /** Max serialized Room JSON size. Default 2 MiB. */
  maxStateBytes: number;
}

export const DEFAULT_LIMITS: StorageLimits = {
  maxGameBytes: 200 * 1024 * 1024,
  maxBlobBytes: 12 * 1024 * 1024,
  maxStateBytes: 2 * 1024 * 1024,
};

type Env = Record<string, string | undefined>;
const num = (v: string | undefined, d: number) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };

export function loadLimits(env: Env = process.env): StorageLimits {
  return {
    maxGameBytes: num(env.GAME_MAX_BYTES, DEFAULT_LIMITS.maxGameBytes),
    maxBlobBytes: num(env.GAME_MAX_BLOB_BYTES, DEFAULT_LIMITS.maxBlobBytes),
    maxStateBytes: num(env.GAME_MAX_STATE_BYTES, DEFAULT_LIMITS.maxStateBytes),
  };
}

export interface StorageConfig {
  cellId: string;
  storeAdapter: string;
  storeFileDir: string;
  mediaAdapter: string;
  mediaFileDir: string;
  limits: StorageLimits;
}

export function loadStorageConfig(env: Env = process.env): StorageConfig {
  const mediaAdapter = env.MEDIA_ADAPTER ?? (env.MEDIA_BUCKET ? "s3" : "file");
  const storeAdapter = env.STORE_ADAPTER ?? (env.ROOMS_TABLE ? "dynamo" : "memory");
  return {
    cellId: env.CELL_ID || "local-0",
    storeAdapter,
    storeFileDir: env.STORE_FILE_DIR || "./.data/state",
    mediaAdapter,
    mediaFileDir: env.MEDIA_FILE_DIR || "./.data/media",
    limits: loadLimits(env),
  };
}

/** Pluggable per game byte quota. Throw QuotaExceededError to refuse a write. */
export interface QuotaContext {
  cell: string;
  gameId: string;
  key: string;
  /** Size of the blob being written. */
  addBytes: number;
  /** Size of the blob it replaces (0 if new). */
  replacedBytes: number;
  /** Bytes currently stored under the game prefix (including the replaced blob). */
  currentBytes: number;
}
export interface QuotaPolicy {
  check(ctx: QuotaContext): void | Promise<void>;
}

export class ByteQuotaPolicy implements QuotaPolicy {
  constructor(private limits: Pick<StorageLimits, "maxGameBytes" | "maxBlobBytes"> = DEFAULT_LIMITS) {}
  check(c: QuotaContext) {
    if (c.addBytes > this.limits.maxBlobBytes) throw new QuotaExceededError("File too large");
    if (c.currentBytes - c.replacedBytes + c.addBytes > this.limits.maxGameBytes) throw new QuotaExceededError("Game storage quota exceeded");
  }
}

export const unlimitedQuota: QuotaPolicy = { check() {} };
