// Adapter selection. Environment only; defaults work with zero configuration.
import { join } from "node:path";
import { FileMediaStore } from "./media-file";
import { AzureBlobMediaStore } from "./media-azure";
import { S3MediaStore } from "./media-s3";
import { loadStorageConfig, ByteQuotaPolicy, type QuotaPolicy } from "./limits";
import type { MediaStore, Store } from "./ports";
import { QuotaMediaStore } from "./quota";
import { DynamoStore } from "./store-dynamo";
import { FileStore } from "./store-file";
import { MemoryStore } from "./store-memory";
import { createPool, PostgresStore } from "./store-postgres";

type Env = Record<string, string | undefined>;

export function createMediaStore(env: Env = process.env, quota?: QuotaPolicy): MediaStore {
  const cfg = loadStorageConfig(env);
  let inner: MediaStore;
  switch (cfg.mediaAdapter) {
    case "file": inner = new FileMediaStore(cfg.mediaFileDir, cfg.cellId); break;
    case "s3": {
      // Legacy: MEDIA_BUCKET alone means plain AWS S3 with the default credential chain.
      const bucket = env.S3_BUCKET || env.MEDIA_BUCKET || "";
      inner = new S3MediaStore({
        bucket, cell: cfg.cellId, endpoint: env.S3_ENDPOINT, region: env.S3_REGION || env.AWS_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE === "true" : !!env.S3_ENDPOINT,
      });
      break;
    }
    case "azureblob": inner = new AzureBlobMediaStore(); break;
    default: throw new Error(`Unknown MEDIA_ADAPTER "${cfg.mediaAdapter}" (file, s3, azureblob)`);
  }
  return new QuotaMediaStore(inner, quota ?? new ByteQuotaPolicy(cfg.limits), cfg.cellId);
}

export function createStore(env: Env = process.env, media?: MediaStore): Store {
  const cfg = loadStorageConfig(env);
  switch (cfg.storeAdapter) {
    case "memory": return new MemoryStore({ cellId: cfg.cellId, media });
    case "file": return new FileStore({ dir: join(cfg.storeFileDir), cellId: cfg.cellId, media, maxStateBytes: cfg.limits.maxStateBytes });
    case "postgres": return new LazyPostgresStore(env, cfg.cellId, media, cfg.limits.maxStateBytes);
    case "dynamo": {
      if (!env.ROOMS_TABLE) throw new Error("ROOMS_TABLE is required for STORE_ADAPTER=dynamo");
      return new DynamoStore(env.ROOMS_TABLE, media, cfg.cellId);
    }
    default: throw new Error(`Unknown STORE_ADAPTER "${cfg.storeAdapter}" (memory, file, postgres, dynamo)`);
  }
}

/** Creates the pg pool on first use so building the store never blocks startup. */
class LazyPostgresStore implements Store {
  private p?: Promise<PostgresStore>;
  constructor(private env: Env, private cellId: string, private media: MediaStore | undefined, private maxStateBytes: number) {}
  private s() { return (this.p ??= createPool(this.env.DATABASE_URL).then((pool) => new PostgresStore({ pool, cellId: this.cellId, media: this.media, maxStateBytes: this.maxStateBytes }))); }
  async get(c: string) { return (await this.s()).get(c); }
  async getById(id: string) { return (await this.s()).getById(id); }
  async put(r: Parameters<Store["put"]>[0], e: number | null) { return (await this.s()).put(r, e); }
  async listExpired(c: string, l: number, cur?: string | null) { return (await this.s()).listExpired(c, l, cur); }
  async delete(id: string) { return (await this.s()).delete(id); }
}

export * from "./errors";
export * from "./keys";
export * from "./limits";
export * from "./ports";
export { GameBlobs } from "./game-blobs";
export { QuotaMediaStore } from "./quota";
export { gameIdOf } from "./store-common";
