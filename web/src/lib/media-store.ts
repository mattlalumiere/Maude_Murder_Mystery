import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface MediaStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; mime: string } | null>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

const safe = (key: string) => {
  if (!/^[A-Za-z0-9_\-./]+$/.test(key) || key.includes("..")) throw new Error("bad media key");
  return key;
};

class LocalStore implements MediaStore {
  private root = join(process.cwd(), ".data", "media");
  async put(key: string, bytes: Buffer, mime: string) {
    const f = join(this.root, safe(key));
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, bytes);
    await writeFile(f + ".mime", mime);
  }
  async get(key: string) {
    try {
      const f = join(this.root, safe(key));
      return { bytes: await readFile(f), mime: await readFile(f + ".mime", "utf8") };
    } catch { return null; }
  }
  async deletePrefix(prefix: string) {
    await rm(join(this.root, safe(prefix)), { recursive: true, force: true });
  }
}

class S3Store implements MediaStore {
  constructor(private bucket: string) {}
  private async s3() {
    const m = await import("@aws-sdk/client-s3");
    return { m, c: new m.S3Client({}) };
  }
  async put(key: string, bytes: Buffer, mime: string) {
    const { m, c } = await this.s3();
    await c.send(new m.PutObjectCommand({ Bucket: this.bucket, Key: safe(key), Body: bytes, ContentType: mime }));
  }
  async get(key: string) {
    const { m, c } = await this.s3();
    try {
      const out = await c.send(new m.GetObjectCommand({ Bucket: this.bucket, Key: safe(key) }));
      return { bytes: Buffer.from(await out.Body!.transformToByteArray()), mime: out.ContentType ?? "application/octet-stream" };
    } catch { return null; }
  }
  async deletePrefix(prefix: string) {
    const { m, c } = await this.s3();
    const list = await c.send(new m.ListObjectsV2Command({ Bucket: this.bucket, Prefix: safe(prefix) }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await c.send(new m.DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
  }
}

const g = globalThis as unknown as { __mmMedia?: MediaStore };
export function getMediaStore(): MediaStore {
  if (!g.__mmMedia) g.__mmMedia = process.env.MEDIA_BUCKET ? new S3Store(process.env.MEDIA_BUCKET) : new LocalStore();
  return g.__mmMedia;
}
