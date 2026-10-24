// Storage for scenarios: the real adapters (memory or file for state, file for blobs) in temp dirs,
// wrapped so steps can count operations, simulate an outage and peek without disturbing counters.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createMediaStore, createStore, type MediaStore, type Store } from "../../../src/lib/storage";
import type { Room } from "../../../src/lib/types";

export class SpyStore implements Store {
  gets = 0; puts = 0; deletes = 0; getByIds = 0;
  /** Codes of rooms created through put(room, null). */
  created: string[] = [];
  down: Error | null = null;
  constructor(public inner: Store) {}
  private check() { if (this.down) throw this.down; }
  async get(code: string) { this.check(); this.gets++; return this.inner.get(code); }
  async getById(id: string) { this.check(); this.getByIds++; return this.inner.getById(id); }
  async put(room: Room, expected: number | null) {
    this.check(); this.puts++;
    const ok = await this.inner.put(room, expected);
    if (ok && expected === null) this.created.push(room.code);
    return ok;
  }
  async listExpired(cell: string, limit: number, cursor?: string | null) { this.check(); return this.inner.listExpired(cell, limit, cursor); }
  async delete(id: string) { this.check(); this.deletes++; return this.inner.delete(id); }
  /** Read without counting and without the outage flag. */
  peek(code: string) { return this.inner.get(code); }
  peekById(id: string) { return this.inner.getById(id); }
  reset() { this.gets = 0; this.puts = 0; this.deletes = 0; this.getByIds = 0; }
}

export class SpyMedia implements MediaStore {
  keysRead: string[] = [];
  keysWritten: string[] = [];
  constructor(public inner: MediaStore) {}
  put(key: string, bytes: Buffer, mime: string) { this.keysWritten.push(key); return this.inner.put(key, bytes, mime); }
  get(key: string) { this.keysRead.push(key); return this.inner.get(key); }
  deletePrefix(p: string) { return this.inner.deletePrefix(p); }
  list(p: string, o?: { limit?: number; cursor?: string | null }) { return this.inner.list(p, o); }
  stat(k: string) { return this.inner.stat(k); }
}

/** Builds media + state stores from the current process.env and installs them as the app singletons. */
export function installStores(w: { mediaDir: string }): SpyStore {
  const media = new SpyMedia(createMediaStore(process.env));
  const store = new SpyStore(createStore(process.env, media));
  (globalThis as any).__mmMedia = media;
  (globalThis as any).__mmStore = store;
  return store;
}

/** Every blob under the media root as a tenant style relative key (sidecars and temp files hidden). */
export function listObjects(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names.sort()) {
      if (n.endsWith(".mime") || n.startsWith(".tmp-")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, rel ? `${rel}/${n}` : n); else out.push(rel ? `${rel}/${n}` : n);
    }
  };
  walk(root, "");
  return out;
}
