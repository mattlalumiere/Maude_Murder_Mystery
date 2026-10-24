// Adapter harnesses for the shared contract suites. Add a harness here to put a new adapter under test.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Room } from "../../src/lib/types";
import type { MediaStore, Store } from "../../src/lib/storage/ports";
import { FileMediaStore } from "../../src/lib/storage/media-file";
import { S3MediaStore } from "../../src/lib/storage/media-s3";
import { ByteQuotaPolicy } from "../../src/lib/storage/limits";
import { QuotaMediaStore } from "../../src/lib/storage/quota";
import { FileStore } from "../../src/lib/storage/store-file";
import { MemoryStore } from "../../src/lib/storage/store-memory";
import { createPool, PostgresStore } from "../../src/lib/storage/store-postgres";

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const rnd = (n: number) => Array.from(randomBytes(n), (b) => ALNUM[b % ALNUM.length]).join("");
export const newGameId = () => rnd(26);
export const newCode = () => rnd(6);
export const nowSec = () => Math.floor(Date.now() / 1000);

export function makeRoom(over: Partial<Room> & { gameId?: string } = {}): Room {
  return {
    code: newCode(), gameId: newGameId(), version: 1, createdAt: nowSec(), ttl: nowSec() + 3600,
    hostId: "h1", phase: "lobby", players: [], media: [],
    ...over,
  } as unknown as Room;
}
export const idOf = (r: Room) => (r as Room & { gameId: string }).gameId;

export interface StoreCtx {
  store: Store;
  media: MediaStore;
  cellId: string;
  /** Another store instance over the SAME backing data but a different cell. Undefined if not meaningful. */
  otherCell?: Store;
}
export interface StoreHarness {
  name: string;
  skip?: string;
  setup(): Promise<{ make(cellId: string, media: MediaStore): Store; media: (cell: string) => MediaStore; shared: boolean; teardown(): Promise<void> }>;
}

const quota = new ByteQuotaPolicy({ maxGameBytes: 1024 * 1024, maxBlobBytes: 512 * 1024 });
const fileMedia = (dir: string) => (cell: string) => new QuotaMediaStore(new FileMediaStore(dir, cell), quota, cell);

export const storeHarnesses: StoreHarness[] = [
  {
    name: "memory",
    async setup() {
      const dir = await mkdtemp(join(tmpdir(), "mm-mem-"));
      return { make: (cell, media) => new MemoryStore({ cellId: cell, media }), media: fileMedia(dir), shared: false, teardown: () => rm(dir, { recursive: true, force: true }) };
    },
  },
  {
    name: "file",
    async setup() {
      const dir = await mkdtemp(join(tmpdir(), "mm-file-"));
      return { make: (cell, media) => new FileStore({ dir: join(dir, "state"), cellId: cell, media }), media: fileMedia(join(dir, "media")), shared: true, teardown: () => rm(dir, { recursive: true, force: true }) };
    },
  },
  {
    name: "postgres",
    skip: process.env.DATABASE_URL ? undefined : "DATABASE_URL not set: postgres contract tests skipped (see test/contract/README.md for a throwaway container)",
    async setup() {
      const pool = await createPool(process.env.DATABASE_URL);
      const dir = await mkdtemp(join(tmpdir(), "mm-pg-"));
      return {
        make: (cell, media) => new PostgresStore({ pool, cellId: cell, media }),
        media: fileMedia(dir),
        shared: true,
        teardown: async () => { await pool.end(); await rm(dir, { recursive: true, force: true }); },
      };
    },
  },
];

export interface MediaHarness {
  name: string;
  skip?: string;
  setup(): Promise<{ make(cell: string): { media: MediaStore; cell: string }; teardown(): Promise<void> }>;
}

export const mediaHarnesses: MediaHarness[] = [
  {
    name: "file",
    async setup() {
      const dir = await mkdtemp(join(tmpdir(), "mm-blob-"));
      return { make: (cell) => ({ cell, media: new QuotaMediaStore(new FileMediaStore(dir, cell), quota, cell) }), teardown: () => rm(dir, { recursive: true, force: true }) };
    },
  },
  {
    name: "s3",
    skip: process.env.S3_ENDPOINT ? undefined : "S3_ENDPOINT not set: s3 contract tests skipped (see test/contract/README.md)",
    async setup() {
      const o = { bucket: process.env.S3_BUCKET || "maude", endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" };
      // Fresh cell per run so reruns never see old objects.
      const run = `t${rnd(8).toLowerCase()}`;
      return { make: (cell) => { const c = `${cell}-${run}`; return { cell: c, media: new QuotaMediaStore(new S3MediaStore({ ...o, cell: c }), quota, c) }; }, teardown: async () => {} };
    },
  },
];
