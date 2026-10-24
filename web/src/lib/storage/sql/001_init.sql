-- Game state for the postgres Store adapter. One row per game, one directory row per join code.
-- Portable SQL: RDS, Azure Database for PostgreSQL, Cloud SQL, local container.
CREATE TABLE IF NOT EXISTS mm_games (
  game_id  text        PRIMARY KEY,
  cell_id  text        NOT NULL,
  code     text        NOT NULL,
  version  integer     NOT NULL,
  ttl      bigint      NOT NULL,           -- unix seconds
  data     jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mm_games_cell_ttl ON mm_games (cell_id, ttl, game_id);

-- code -> game_id, unique per cell. The only cross game read, a primary key lookup.
CREATE TABLE IF NOT EXISTS mm_directory (
  cell_id  text NOT NULL,
  code     text NOT NULL,
  game_id  text NOT NULL,
  PRIMARY KEY (cell_id, code)
);
CREATE INDEX IF NOT EXISTS mm_directory_game ON mm_directory (cell_id, game_id);
