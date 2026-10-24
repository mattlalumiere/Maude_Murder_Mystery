// S3 API adapter: AWS S3, MinIO, GCS interoperability. Only calls every S3 clone supports
// (PutObject, GetObject, HeadObject, ListObjectsV2, DeleteObject). No DeleteObjects batch (GCS lacks it).
import { KeyError } from "./errors";
import { resolveBlobKey, resolveBlobPrefix } from "./keys";
import type { BlobPage, MediaStore } from "./ports";

export interface S3Options {
  bucket: string;
  cell: string;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
}

export class S3MediaStore implements MediaStore {
  private clientP?: Promise<{ m: typeof import("@aws-sdk/client-s3"); c: import("@aws-sdk/client-s3").S3Client }>;
  constructor(private o: S3Options) {
    if (!o.bucket) throw new Error("S3 bucket is required (S3_BUCKET)");
  }
  private s3() {
    this.clientP ??= import("@aws-sdk/client-s3").then((m) => ({
      m,
      c: new m.S3Client({
        region: this.o.region || "us-east-1",
        ...(this.o.endpoint ? { endpoint: this.o.endpoint } : {}),
        forcePathStyle: this.o.forcePathStyle ?? !!this.o.endpoint,
      }),
    }));
    return this.clientP;
  }
  private key(k: string) { return resolveBlobKey(this.o.cell, k); }

  async put(key: string, bytes: Buffer, mime: string) {
    const { m, c } = await this.s3();
    await c.send(new m.PutObjectCommand({ Bucket: this.o.bucket, Key: this.key(key), Body: bytes, ContentType: mime }));
  }
  async get(key: string) {
    const { m, c } = await this.s3();
    try {
      const out = await c.send(new m.GetObjectCommand({ Bucket: this.o.bucket, Key: this.key(key) }));
      return { bytes: Buffer.from(await out.Body!.transformToByteArray()), mime: out.ContentType ?? "application/octet-stream" };
    } catch (e) {
      if (e instanceof KeyError) throw e;
      return null;
    }
  }
  async stat(key: string) {
    const { m, c } = await this.s3();
    const k = this.key(key);
    try {
      const out = await c.send(new m.HeadObjectCommand({ Bucket: this.o.bucket, Key: k }));
      return { size: out.ContentLength ?? 0 };
    } catch { return null; }
  }
  async list(prefix: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<BlobPage> {
    const { m, c } = await this.s3();
    const base = resolveBlobPrefix(this.o.cell, prefix);
    const limit = Math.max(1, Math.min(opts.limit ?? 1000, 1000));
    const entries: { key: string; size: number }[] = [];
    // The exact key (if it is an object) and everything under base + "/".
    if (!opts.cursor || opts.cursor < base + "/") {
      const head = await this.stat(base).catch(() => null);
      if (head) entries.push({ key: base, size: head.size });
    }
    const out = await c.send(new m.ListObjectsV2Command({
      Bucket: this.o.bucket, Prefix: base + "/", MaxKeys: limit - entries.length || 1,
      StartAfter: opts.cursor && opts.cursor >= base + "/" ? opts.cursor : undefined,
    }));
    for (const o of out.Contents ?? []) entries.push({ key: o.Key!, size: o.Size ?? 0 });
    const next = out.IsTruncated && entries.length ? entries[entries.length - 1].key : null;
    return { entries, next };
  }
  async deletePrefix(prefix: string) {
    const { m, c } = await this.s3();
    const base = resolveBlobPrefix(this.o.cell, prefix);
    const del = (Key: string) => c.send(new m.DeleteObjectCommand({ Bucket: this.o.bucket, Key }));
    await del(base);
    let cursor: string | null = null;
    do {
      const page = await this.listUnder(base + "/", cursor);
      for (let i = 0; i < page.keys.length; i += 16) await Promise.all(page.keys.slice(i, i + 16).map(del));
      cursor = page.next;
    } while (cursor);
  }
  private async listUnder(prefix: string, cursor: string | null) {
    const { m, c } = await this.s3();
    const out = await c.send(new m.ListObjectsV2Command({ Bucket: this.o.bucket, Prefix: prefix, MaxKeys: 1000, StartAfter: cursor ?? undefined }));
    const keys = (out.Contents ?? []).map((o) => o.Key!);
    return { keys, next: out.IsTruncated && keys.length ? keys[keys.length - 1] : null };
  }
}
