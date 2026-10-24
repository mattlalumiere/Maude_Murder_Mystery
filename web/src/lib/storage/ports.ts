import type { Room } from "../types";
import type { QuotaPolicy } from "./limits";

export interface ExpiredPage {
  gameIds: string[];
  /** Pass back as `cursor` for the next page; null when the scan is complete. A page may be short. */
  next: string | null;
}

export interface Store {
  /** Resolve a join code (directory lookup, O(1)) and return the live game, or null. */
  get(code: string): Promise<Room | null>;
  /** Writes only if the stored version equals `expected` (null = must not exist). */
  put(room: Room, expected: number | null): Promise<boolean>;
  /** Direct read by internal game id. Null if missing or expired. */
  getById(gameId: string): Promise<Room | null>;
  /** Expired games of this cell, bounded and paginated (keyset by gameId). */
  listExpired(cellId: string, limit: number, cursor?: string | null): Promise<ExpiredPage>;
  /** Removes blobs under the game prefix, the directory entry and the state record. Idempotent. */
  delete(gameId: string): Promise<void>;
}

export interface BlobEntry { key: string; size: number }
export interface BlobPage { entries: BlobEntry[]; next: string | null }

export interface MediaStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; mime: string } | null>;
  /** Deletes the object named exactly `prefix` and every object under `prefix/`. Never matches siblings. */
  deletePrefix(prefix: string): Promise<void>;
  /** Keys under a prefix (same matching rule as deletePrefix), paginated, sorted by key. */
  list(prefix: string, opts?: { limit?: number; cursor?: string | null }): Promise<BlobPage>;
  stat(key: string): Promise<{ size: number } | null>;
}

export interface MediaStoreOptions {
  cellId: string;
  quota?: QuotaPolicy;
}

/** Sum of blob bytes under a game prefix (walks list pages). */
export async function gameUsage(media: MediaStore, prefix: string): Promise<number> {
  let total = 0, cursor: string | null = null;
  do {
    const page: BlobPage = await media.list(prefix, { limit: 1000, cursor });
    for (const e of page.entries) total += e.size;
    cursor = page.next;
  } while (cursor);
  return total;
}
