import { KeyError } from "./errors";
import { assertKeyInGame, gamePrefix, tenantKey } from "./keys";
import type { BlobPage, MediaStore } from "./ports";

/**
 * A handle bound to ONE game. Every key it touches is built by the key builder or asserted to be
 * inside the game prefix, so code holding a GameBlobs cannot reach another game's objects.
 */
export class GameBlobs {
  constructor(private media: MediaStore, readonly cell: string, readonly gameId: string) {
    gamePrefix(cell, gameId); // validates both
  }
  key(kind: string, name: string) { return tenantKey(this.cell, this.gameId, kind, name); }
  private own(key: string): string {
    assertKeyInGame(key, this.cell, this.gameId);
    return key;
  }
  async put(kind: string, name: string, bytes: Buffer, mime: string) { return this.media.put(this.key(kind, name), bytes, mime); }
  async get(kind: string, name: string) { return this.media.get(this.key(kind, name)); }
  /** For callers that already hold a full key (for example one stored in a Room). */
  async putKey(key: string, bytes: Buffer, mime: string) { return this.media.put(this.own(key), bytes, mime); }
  async getKey(key: string) { return this.media.get(this.own(key)); }
  async deleteKey(key: string) { return this.media.deletePrefix(this.own(key)); }
  async list(opts?: { limit?: number; cursor?: string | null }): Promise<BlobPage> { return this.media.list(gamePrefix(this.cell, this.gameId), opts); }
  async listPrefix(prefix: string, opts?: { limit?: number; cursor?: string | null }): Promise<BlobPage> {
    const p = prefix.endsWith("/") ? prefix : prefix + "/";
    if (!p.startsWith(gamePrefix(this.cell, this.gameId))) throw new KeyError("prefix escapes its game");
    return this.media.list(prefix, opts);
  }
  async deleteAll() { return this.media.deletePrefix(gamePrefix(this.cell, this.gameId)); }
}
