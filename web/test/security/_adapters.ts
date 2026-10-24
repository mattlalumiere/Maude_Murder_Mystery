// Adapter rigs for the isolation suites. Postgres and S3 rigs run only when a throwaway instance is reachable:
//   DATABASE_URL=postgres://postgres:pw@localhost:54339/maude  S3_ENDPOINT=http://localhost:9091 S3_BUCKET=t3bucket
// (see docs/platform/testing/T3-security-report.md for the docker one-liners).
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Room } from "@/lib/types";
import type { MediaStore, Store } from "@/lib/storage/ports";
import { FileMediaStore } from "@/lib/storage/media-file";
import { S3MediaStore } from "@/lib/storage/media-s3";
import { FileStore } from "@/lib/storage/store-file";
import { MemoryStore } from "@/lib/storage/store-memory";
import { createPool, PostgresStore } from "@/lib/storage/store-postgres";
import { Gen, rmDir } from "./_support";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ulid = (g: Gen) => CROCKFORD[g.int(8)] + g.str(CROCKFORD, 25);
const CODE_ALPHA = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const joinCode = (g: Gen, n = 6) => g.str(CODE_ALPHA, n);
export const nowSec = () => Math.floor(Date.now() / 1000);

export function mkRoom(g: Gen, over: Partial<Room> & { gameId?: string; cellId?: string } = {}): Room {
  return {
    code: joinCode(g), gameId: ulid(g), cellId: "x", version: 1, createdAt: nowSec(), ttl: nowSec() + 3600,
    hostId: "h1", phase: "lobby", players: [], media: [], ...over,
  } as unknown as Room;
}
export const gidOf = (r: Room) => (r as Room & { gameId: string }).gameId;

export const cellName = (g: Gen) => `t3c-${g.str("abcdefghijklmnopqrstuvwxyz0123456789", 10)}`;

export async function fsIsCaseInsensitive(): Promise<boolean> {
  const d = await mkdtemp(join(tmpdir(), "t3-case-"));
  try {
    await writeFile(join(d, "aBc"), "x");
    return await stat(join(d, "AbC")).then(() => true, () => false);
  } finally { await rmDir(d); }
}

export interface StoreRig {
  name: string;
  /** A store bound to `cell`, over shared backing data when `shared`. */
  make(cell: string): Store;
  media(cell: string): MediaStore;
  teardown(): Promise<void>;
  /** Walks the backing data and returns every path or key (for "no stray objects" checks). Undefined when not available. */
  inventory?(): Promise<string[]>;
  fsBacked: boolean;
}

async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  let names: string[] = [];
  try { names = await readdir(join(dir, rel)); } catch { return out; }
  for (const n of names) {
    const r = rel ? `${rel}/${n}` : n;
    const st = await stat(join(dir, r));
    if (st.isDirectory()) out.push(...(await walk(dir, r))); else out.push(r);
  }
  return out;
}

export async function memoryRig(): Promise<StoreRig> {
  const dir = await mkdtemp(join(tmpdir(), "t3-mem-"));
  const stores = new Map<string, Store>();
  return {
    name: "memory", fsBacked: false,
    make: (cell) => { let s = stores.get(cell); if (!s) { s = new MemoryStore({ cellId: cell, media: new FileMediaStore(join(dir, "media"), cell) }); stores.set(cell, s); } return s; },
    media: (cell) => new FileMediaStore(join(dir, "media"), cell),
    teardown: () => rmDir(dir),
    inventory: () => walk(dir),
  };
}

export async function fileRig(): Promise<StoreRig> {
  const dir = await mkdtemp(join(tmpdir(), "t3-file-"));
  await mkdir(join(dir, "state"), { recursive: true });
  return {
    name: "file", fsBacked: true,
    make: (cell) => new FileStore({ dir: join(dir, "state"), cellId: cell, media: new FileMediaStore(join(dir, "media"), cell) }),
    media: (cell) => new FileMediaStore(join(dir, "media"), cell),
    teardown: () => rmDir(dir),
    inventory: () => walk(dir),
  };
}

export const PG_URL = process.env.DATABASE_URL;
export async function postgresRig(): Promise<StoreRig> {
  const pool = await createPool(PG_URL);
  const dir = await mkdtemp(join(tmpdir(), "t3-pg-"));
  return {
    name: "postgres", fsBacked: false,
    make: (cell) => new PostgresStore({ pool, cellId: cell, media: new FileMediaStore(join(dir, "media"), cell) }),
    media: (cell) => new FileMediaStore(join(dir, "media"), cell),
    teardown: async () => { await pool.end(); await rmDir(dir); },
  };
}

export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const S3_BUCKET = process.env.S3_BUCKET ?? "t3bucket";
export interface MediaRig {
  name: string;
  make(cell: string): MediaStore;
  teardown(): Promise<void>;
  /** Raw keys/paths under the backing root, independent of the adapter under test. */
  inventory(): Promise<string[]>;
  /** Writes an object outside the adapter's namespace and returns a checker that it is unchanged. */
  sentinel(): Promise<() => Promise<boolean>>;
  caseInsensitive?: boolean;
}

export async function fileMediaRig(): Promise<MediaRig> {
  const parent = await mkdtemp(join(tmpdir(), "t3-media-"));
  const root = join(parent, "root");
  await mkdir(root, { recursive: true });
  return {
    name: "media-file",
    make: (cell) => new FileMediaStore(root, cell),
    teardown: () => rmDir(parent),
    inventory: () => walk(parent),
    async sentinel() {
      await writeFile(join(parent, "SENTINEL"), "keep-me");
      await mkdir(join(parent, "rootx"), { recursive: true });
      await writeFile(join(parent, "rootx", "SIBLING"), "keep-me-too");
      return async () => (await stat(join(parent, "SENTINEL")).then(() => true, () => false)) && (await stat(join(parent, "rootx", "SIBLING")).then(() => true, () => false));
    },
  };
}

export async function s3MediaRig(): Promise<MediaRig> {
  process.env.AWS_ACCESS_KEY_ID ||= "x";
  process.env.AWS_SECRET_ACCESS_KEY ||= "y";
  const sdk = await import("@aws-sdk/client-s3");
  const client = new sdk.S3Client({ region: "us-east-1", endpoint: S3_ENDPOINT, forcePathStyle: true });
  const run = `t3run-${Math.random().toString(36).slice(2, 10)}`;
  const list = async (prefix: string) => {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const o = await client.send(new sdk.ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const c of o.Contents ?? []) keys.push(c.Key!);
      token = o.IsTruncated ? o.NextContinuationToken : undefined;
    } while (token);
    return keys;
  };
  const cells = new Set<string>();
  return {
    name: "media-s3",
    make: (cell) => { cells.add(cell); return new S3MediaStore({ bucket: S3_BUCKET, cell, endpoint: S3_ENDPOINT, region: "us-east-1", forcePathStyle: true }); },
    async teardown() {
      for (const k of await list(run)) await client.send(new sdk.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: k }));
      for (const c of cells) for (const k of await list(`${c}/`)) await client.send(new sdk.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: k }));
    },
    async inventory() { const all: string[] = []; for (const c of cells) all.push(...(await list(`${c}`))); return all; },
    async sentinel() {
      const key = `${run}/SENTINEL`;
      await client.send(new sdk.PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: "keep-me" }));
      return async () => (await list(key)).includes(key);
    },
  };
}

export const hasPostgres = !!PG_URL;
export const hasS3 = !!S3_ENDPOINT;
