import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { KeyError } from "./errors";
import { resolveBlobKey, resolveBlobPrefix } from "./keys";
import type { BlobEntry, BlobPage, MediaStore } from "./ports";

const SIDE = ".mime";

/** Blobs as files under MEDIA_FILE_DIR/{cell}/games/{gameId}/{kind}/{name}, plus a `.mime` sidecar. */
export class FileMediaStore implements MediaStore {
  private root: string;
  constructor(root: string, private cell: string) { this.root = resolve(root); }

  private path(fullKey: string) {
    const f = resolve(this.root, fullKey);
    if (!f.startsWith(this.root + sep)) throw new KeyError("key escapes root"); // belt and braces
    return f;
  }
  async put(key: string, bytes: Buffer, mime: string) {
    const f = this.path(resolveBlobKey(this.cell, key));
    await mkdir(dirname(f), { recursive: true });
    const tmp = join(dirname(f), `.tmp-${randomBytes(6).toString("hex")}`);
    await writeFile(tmp, bytes);
    await writeFile(f + SIDE, mime);
    await rename(tmp, f);
  }
  async get(key: string) {
    const f = this.path(resolveBlobKey(this.cell, key));
    try {
      const bytes = await readFile(f);
      const mime = await readFile(f + SIDE, "utf8").catch(() => "application/octet-stream");
      return { bytes, mime };
    } catch { return null; }
  }
  async stat(key: string) {
    const f = this.path(resolveBlobKey(this.cell, key));
    try { const s = await stat(f); return s.isFile() ? { size: s.size } : null; } catch { return null; }
  }
  async deletePrefix(prefix: string) {
    const p = this.path(resolveBlobPrefix(this.cell, prefix));
    await rm(p + SIDE, { force: true });
    await rm(p, { recursive: true, force: true });
  }
  async list(prefix: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<BlobPage> {
    const limit = Math.max(1, Math.min(opts.limit ?? 1000, 1000));
    const base = resolveBlobPrefix(this.cell, prefix);
    const all: BlobEntry[] = [];
    const walk = async (rel: string) => {
      const abs = this.path(rel);
      let st;
      try { st = await stat(abs); } catch { return; }
      if (st.isFile()) { all.push({ key: rel, size: st.size }); return; }
      const names = (await readdir(abs)).filter((n) => !n.endsWith(SIDE) && !n.startsWith(".tmp-")).sort();
      for (const n of names) await walk(`${rel}/${n}`);
    };
    await walk(base);
    all.sort((a, b) => (a.key < b.key ? -1 : 1));
    const start = opts.cursor ? all.findIndex((e) => e.key > opts.cursor!) : 0;
    if (start < 0) return { entries: [], next: null };
    const entries = all.slice(start, start + limit);
    return { entries, next: start + limit < all.length ? entries[entries.length - 1].key : null };
  }
}
