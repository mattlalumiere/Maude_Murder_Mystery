// File state adapter. Layout under STORE_FILE_DIR:
//   {cell}/games/{gameId}/room.json     the Room (atomic temp file + rename)
//   {cell}/directory/{CODE}             text file holding the gameId (created with link(), exclusive)
//   {cell}/locks/*.lock                 lock files (exclusive create) for cross process safety
// Safety: an in-process mutex per key plus an O_EXCL lock file per game gives one winner per version
// across threads and processes. Readers never see torn data because writers only rename complete files.
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Room } from "../types";
import { HttpError, KeyError } from "./errors";
import { assertCell, assertCode, assertGameId } from "./keys";
import type { ExpiredPage, MediaStore, Store } from "./ports";
import { DEFAULT_LIMITS } from "./limits";
import { checkRoomIds, checkStateSize, clampLimit, isExpired } from "./store-common";

const STALE_LOCK_MS = 15_000;
const LOCK_TIMEOUT_MS = 10_000;
const SCAN_MAX = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FileStore implements Store {
  private root: string;
  private chains = new Map<string, Promise<unknown>>();
  constructor(private o: { dir: string; cellId: string; media?: MediaStore; maxStateBytes?: number }) {
    assertCell(o.cellId);
    this.root = resolve(o.dir);
  }
  private gameDir(id: string) { return join(this.root, this.o.cellId, "games", assertGameId(id)); }
  private roomFile(id: string) { return join(this.gameDir(id), "room.json"); }
  private dirFile(code: string) { return join(this.root, this.o.cellId, "directory", assertCode(code)); }
  private lockFile(name: string) { return join(this.root, this.o.cellId, "locks", `${name}.lock`); }

  /** In-process FIFO per key, then an exclusive lock file for other processes. */
  private async withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const path = this.lockFile(name);
    const prev = this.chains.get(path) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      await mkdir(join(path, ".."), { recursive: true });
      const start = Date.now();
      for (;;) {
        try { (await open(path, "wx")).close(); break; }
        catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          try { const s = await stat(path); if (Date.now() - s.mtimeMs > STALE_LOCK_MS) await unlink(path); } catch { /* raced */ }
          if (Date.now() - start > LOCK_TIMEOUT_MS) throw new HttpError(503, "Storage busy");
          await sleep(2 + Math.random() * 8);
        }
      }
      try { return await fn(); } finally { await unlink(path).catch(() => {}); }
    });
    this.chains.set(path, run);
    run.finally(() => { if (this.chains.get(path) === run) this.chains.delete(path); }).catch(() => {});
    return run;
  }

  private async atomicWrite(file: string, data: string) {
    await mkdir(join(file, ".."), { recursive: true });
    const tmp = `${file}.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }
  private async readRoom(id: string): Promise<Room | null> {
    try { return JSON.parse(await readFile(this.roomFile(id), "utf8")) as Room; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  private async readDir(code: string): Promise<string | null> {
    try { return (await readFile(this.dirFile(code), "utf8")).trim() || null; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }

  async get(code: string) {
    const id = await this.readDir(code);
    return id ? this.getById(id) : null;
  }
  async getById(gameId: string) {
    const r = await this.readRoom(gameId);
    return r && !isExpired(r.ttl) ? r : null;
  }

  async put(room: Room, expected: number | null): Promise<boolean> {
    const { gameId, code } = checkRoomIds(room);
    const json = JSON.stringify(room);
    checkStateSize(json, this.o.maxStateBytes ?? DEFAULT_LIMITS.maxStateBytes);
    if (expected !== null) {
      return this.withLock(`g-${gameId}`, async () => {
        const cur = await this.readRoom(gameId);
        if (!cur || isExpired(cur.ttl) || cur.version !== expected || cur.code !== code) return false;
        await this.atomicWrite(this.roomFile(gameId), json);
        return true;
      });
    }
    return this.withLock(`c-${code}`, () => this.withLock(`g-${gameId}`, async () => {
      const cur = await this.readRoom(gameId);
      if (cur && !isExpired(cur.ttl)) return false;
      const owner = await this.readDir(code);
      if (owner && owner !== gameId) {
        const o = await this.readRoom(owner);
        if (o && !isExpired(o.ttl)) return false;
        await this.removeState(owner, code);
      }
      await this.atomicWrite(this.roomFile(gameId), json);
      await this.atomicWrite(this.dirFile(code), gameId);
      return true;
    }));
  }

  private async removeState(gameId: string, code?: string) {
    const r = code ? { code } : await this.readRoom(gameId).catch(() => null);
    if (r?.code && (await this.readDir(r.code)) === gameId) await rm(this.dirFile(r.code), { force: true });
    await rm(this.gameDir(gameId), { recursive: true, force: true });
  }

  async delete(gameId: string) {
    assertGameId(gameId);
    await this.o.media?.deletePrefix(`${this.o.cellId}/games/${gameId}`);
    await this.withLock(`g-${gameId}`, () => this.removeState(gameId));
  }

  async listExpired(cellId: string, limit: number, cursor?: string | null): Promise<ExpiredPage> {
    if (cellId !== this.o.cellId) throw new KeyError("wrong cell");
    const n = clampLimit(limit);
    let names: string[];
    try { names = (await readdir(join(this.root, cellId, "games"))).sort(); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { gameIds: [], next: null }; throw e; }
    const start = cursor ? names.findIndex((x) => x > cursor) : 0;
    if (start < 0) return { gameIds: [], next: null };
    const out: string[] = [];
    let i = start, scanned = 0;
    for (; i < names.length && out.length < n && scanned < SCAN_MAX; i++, scanned++) {
      const r = await this.readRoom(names[i]).catch(() => null);
      if (r && isExpired(r.ttl)) out.push(names[i]);
    }
    return { gameIds: out, next: i < names.length ? names[i - 1] : null };
  }
}
