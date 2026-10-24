import { parseKey, gamePrefix, resolveBlobKey } from "./keys";
import type { QuotaPolicy } from "./limits";
import { gameUsage, type MediaStore } from "./ports";

/**
 * Decorates any MediaStore with a QuotaPolicy. The check is read-then-write, so concurrent
 * writers can overshoot by at most their own sizes (soft quota, documented in the README).
 */
export class QuotaMediaStore implements MediaStore {
  constructor(private inner: MediaStore, private policy: QuotaPolicy, private cell: string) {}
  async put(key: string, bytes: Buffer, mime: string) {
    const full = resolveBlobKey(this.cell, key);
    const { gameId } = parseKey(full);
    const [currentBytes, existing] = await Promise.all([
      gameUsage(this.inner, gamePrefix(this.cell, gameId)),
      this.inner.stat(full),
    ]);
    await this.policy.check({ cell: this.cell, gameId, key: full, addBytes: bytes.length, replacedBytes: existing?.size ?? 0, currentBytes });
    await this.inner.put(full, bytes, mime);
  }
  get(key: string) { return this.inner.get(key); }
  deletePrefix(prefix: string) { return this.inner.deletePrefix(prefix); }
  list(prefix: string, opts?: { limit?: number; cursor?: string | null }) { return this.inner.list(prefix, opts); }
  stat(key: string) { return this.inner.stat(key); }
}
