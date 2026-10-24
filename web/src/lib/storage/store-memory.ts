import type { Room } from "../types";
import { assertCell, assertGameId, assertCode } from "./keys";
import { KeyError } from "./errors";
import type { ExpiredPage, MediaStore, Store } from "./ports";
import { DEFAULT_LIMITS } from "./limits";
import { checkRoomIds, checkStateSize, clampLimit, isExpired } from "./store-common";

export class MemoryStore implements Store {
  private games = new Map<string, Room>();
  private dir = new Map<string, string>(); // code -> gameId
  constructor(private o: { cellId: string; media?: MediaStore; maxStateBytes?: number } = { cellId: "local-0" }) { assertCell(o.cellId); }

  private live(gameId: string): Room | null {
    const r = this.games.get(gameId);
    if (!r) return null;
    if (isExpired(r.ttl)) return null;
    return r;
  }
  async get(code: string) {
    assertCode(code);
    const id = this.dir.get(code);
    return id ? this.getById(id) : null;
  }
  async getById(gameId: string) {
    assertGameId(gameId);
    const r = this.live(gameId);
    if (!r) { this.games.delete(gameId); return null; }
    return structuredClone(r);
  }
  async put(room: Room, expected: number | null) {
    const { gameId, code } = checkRoomIds(room);
    checkStateSize(JSON.stringify(room), this.o.maxStateBytes ?? DEFAULT_LIMITS.maxStateBytes);
    const cur = this.live(gameId);
    if ((cur?.version ?? null) !== expected) return false;
    if (cur && cur.code !== code) return false;
    if (!cur) {
      const owner = this.dir.get(code);
      if (owner && owner !== gameId && this.live(owner)) return false;
      if (owner && owner !== gameId) this.games.delete(owner);
      this.dir.set(code, gameId);
    }
    this.games.set(gameId, structuredClone(room));
    return true;
  }
  async listExpired(cellId: string, limit: number, cursor?: string | null): Promise<ExpiredPage> {
    if (cellId !== this.o.cellId) throw new KeyError("wrong cell");
    const n = clampLimit(limit);
    const ids = [...this.games.entries()]
      .filter(([id, r]) => isExpired(r.ttl) && (!cursor || id > cursor))
      .map(([id]) => id).sort();
    const page = ids.slice(0, n);
    return { gameIds: page, next: ids.length > n ? page[page.length - 1] : null };
  }
  async delete(gameId: string) {
    assertGameId(gameId);
    await this.o.media?.deletePrefix(`${this.o.cellId}/games/${gameId}`);
    const r = this.games.get(gameId);
    if (r && this.dir.get(r.code) === gameId) this.dir.delete(r.code);
    this.games.delete(gameId);
  }
}
