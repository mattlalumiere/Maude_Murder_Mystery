import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { Room } from "../types";
import { KeyError } from "./errors";
import { assertCell, assertCode, assertGameId } from "./keys";
import { DEFAULT_LIMITS } from "./limits";
import type { ExpiredPage, MediaStore, Store } from "./ports";
import { checkRoomIds, checkStateSize, clampLimit } from "./store-common";

export function sqlDir(): string {
  return process.env.STORE_SQL_DIR || join(process.cwd(), "src", "lib", "storage", "sql");
}

/** Applies sql/*.sql in name order, once each, under an advisory lock. */
export async function migrate(pool: Pool, dir = sqlDir()): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("SELECT pg_advisory_lock(727001)");
    await c.query("CREATE TABLE IF NOT EXISTS mm_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const done = await c.query("SELECT 1 FROM mm_migrations WHERE name=$1", [f]);
      if (done.rowCount) continue;
      await c.query("BEGIN");
      try {
        await c.query(await readFile(join(dir, f), "utf8"));
        await c.query("INSERT INTO mm_migrations(name) VALUES ($1)", [f]);
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK"); throw e; }
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    c.release();
  }
}

export async function createPool(url = process.env.DATABASE_URL): Promise<Pool> {
  if (!url) throw new Error("DATABASE_URL is required for STORE_ADAPTER=postgres");
  const { Pool: P } = await import("pg");
  return new P({ connectionString: url, max: Number(process.env.PG_POOL_MAX) || 10, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
}

export class PostgresStore implements Store {
  private ready?: Promise<void>;
  constructor(private o: { pool: Pool; cellId: string; media?: MediaStore; maxStateBytes?: number; migrations?: boolean }) { assertCell(o.cellId); }
  private init() { return (this.ready ??= this.o.migrations === false ? Promise.resolve() : migrate(this.o.pool)); }
  private get cell() { return this.o.cellId; }
  private now() { return Math.floor(Date.now() / 1000); }

  async get(code: string) {
    await this.init();
    const r = await this.o.pool.query(
      `SELECT g.data FROM mm_directory d JOIN mm_games g ON g.cell_id=d.cell_id AND g.game_id=d.game_id
       WHERE d.cell_id=$1 AND d.code=$2 AND g.ttl >= $3`, [this.cell, assertCode(code), this.now()]);
    return r.rows[0] ? (r.rows[0].data as Room) : null;
  }
  async getById(gameId: string) {
    await this.init();
    const r = await this.o.pool.query("SELECT data FROM mm_games WHERE cell_id=$1 AND game_id=$2 AND ttl >= $3", [this.cell, assertGameId(gameId), this.now()]);
    return r.rows[0] ? (r.rows[0].data as Room) : null;
  }

  async put(room: Room, expected: number | null): Promise<boolean> {
    await this.init();
    const { gameId, code } = checkRoomIds(room);
    const json = JSON.stringify(room);
    checkStateSize(json, this.o.maxStateBytes ?? DEFAULT_LIMITS.maxStateBytes);
    if (expected !== null) {
      const r = await this.o.pool.query(
        `UPDATE mm_games SET version=$1, ttl=$2, data=$3::jsonb, updated_at=now()
         WHERE cell_id=$4 AND game_id=$5 AND code=$6 AND version=$7 AND ttl >= $8`,
        [room.version, room.ttl, json, this.cell, gameId, code, expected, this.now()]);
      return r.rowCount === 1;
    }
    const c = await this.o.pool.connect();
    try {
      await c.query("BEGIN");
      const ok = await this.create(c, room, gameId, code, json);
      await c.query(ok ? "COMMIT" : "ROLLBACK");
      return ok;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  }

  private async create(c: PoolClient, room: Room, gameId: string, code: string, json: string) {
    const now = this.now();
    // Directory row first: concurrent creators of one code serialise on this unique key.
    const ins = await c.query("INSERT INTO mm_directory(cell_id, code, game_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [this.cell, code, gameId]);
    if (!ins.rowCount) {
      const cur = await c.query("SELECT game_id FROM mm_directory WHERE cell_id=$1 AND code=$2 FOR UPDATE", [this.cell, code]);
      const owner: string | undefined = cur.rows[0]?.game_id;
      if (owner && owner !== gameId) {
        const alive = await c.query("SELECT 1 FROM mm_games WHERE cell_id=$1 AND game_id=$2 AND ttl >= $3", [this.cell, owner, now]);
        if (alive.rowCount) return false;
        await c.query("DELETE FROM mm_games WHERE cell_id=$1 AND game_id=$2", [this.cell, owner]);
      }
      await c.query("UPDATE mm_directory SET game_id=$3 WHERE cell_id=$1 AND code=$2", [this.cell, code, gameId]);
    }
    const g = await c.query(
      `INSERT INTO mm_games(game_id, cell_id, code, version, ttl, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (game_id) DO UPDATE SET cell_id=EXCLUDED.cell_id, code=EXCLUDED.code, version=EXCLUDED.version,
         ttl=EXCLUDED.ttl, data=EXCLUDED.data, updated_at=now()
       WHERE mm_games.ttl < $7 AND mm_games.cell_id=EXCLUDED.cell_id`,
      [gameId, this.cell, code, room.version, room.ttl, json, now]);
    return g.rowCount === 1;
  }

  async listExpired(cellId: string, limit: number, cursor?: string | null): Promise<ExpiredPage> {
    await this.init();
    if (cellId !== this.cell) throw new KeyError("wrong cell");
    const n = clampLimit(limit);
    const r = await this.o.pool.query(
      "SELECT game_id FROM mm_games WHERE cell_id=$1 AND ttl < $2 AND game_id > $3 ORDER BY game_id LIMIT $4",
      [this.cell, this.now(), cursor ?? "", n + 1]);
    const ids = r.rows.map((x) => x.game_id as string);
    const page = ids.slice(0, n);
    return { gameIds: page, next: ids.length > n ? page[page.length - 1] : null };
  }

  async delete(gameId: string) {
    await this.init();
    assertGameId(gameId);
    await this.o.media?.deletePrefix(`${this.cell}/games/${gameId}`);
    const c = await this.o.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("DELETE FROM mm_directory WHERE cell_id=$1 AND game_id=$2", [this.cell, gameId]);
      await c.query("DELETE FROM mm_games WHERE cell_id=$1 AND game_id=$2", [this.cell, gameId]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  }
}
