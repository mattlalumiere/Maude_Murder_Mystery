// The ONE place tenant keys are built and checked. Every adapter goes through this file.
// Layout: {cell}/games/{gameId}/{kind}/{name}
import { KeyError } from "./errors";

const CELL_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const GAME_RE = /^[A-Za-z0-9]{4,32}$/; // 26 char ULID, or a legacy 4 to 6 char join code
const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const SEG_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/; // first char never "." (no dotfiles); base64url ids may start with - or _
const CODE_RE = /^[A-Za-z0-9]{4,12}$/;
const MAX_KEY = 512;
const MAX_DEPTH = 4;
/** Sidecar suffix used by the file adapter for the content type. Reserved so a name cannot collide. */
export const RESERVED_SUFFIXES = [".mime"] as const;

export interface KeyParts { cell: string; gameId: string; kind: string; name: string }

export function assertCell(cell: string): string {
  if (typeof cell !== "string" || !CELL_RE.test(cell)) throw new KeyError("bad cell id");
  return cell;
}
export function assertGameId(id: string): string {
  if (typeof id !== "string" || !GAME_RE.test(id)) throw new KeyError("bad game id");
  return id;
}
export function assertCode(code: string): string {
  if (typeof code !== "string" || !CODE_RE.test(code)) throw new KeyError("bad join code");
  return code;
}
function assertKind(kind: string): string {
  if (typeof kind !== "string" || !KIND_RE.test(kind)) throw new KeyError("bad kind");
  return kind;
}
function assertName(name: string): string {
  if (typeof name !== "string" || name.length === 0) throw new KeyError("empty name");
  const segs = name.split("/");
  if (segs.length > MAX_DEPTH) throw new KeyError("name too deep");
  for (const s of segs) {
    if (!SEG_RE.test(s) || s.includes("..")) throw new KeyError("bad name segment");
  }
  const last = segs[segs.length - 1];
  if (RESERVED_SUFFIXES.some((x) => last.endsWith(x))) throw new KeyError("reserved name suffix");
  return name;
}

/** `{cell}/games/{gameId}/` (trailing slash, so game "ABCD" never matches "ABCDE"). */
export function gamePrefix(cell: string, gameId: string): string {
  return `${assertCell(cell)}/games/${assertGameId(gameId)}/`;
}

export function tenantKey(cell: string, gameId: string, kind: string, name: string): string {
  const key = `${gamePrefix(cell, gameId)}${assertKind(kind)}/${assertName(name)}`;
  if (key.length > MAX_KEY) throw new KeyError("key too long");
  return key;
}

/** Strict parse of a full tenant key. */
export function parseKey(key: string): KeyParts {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY) throw new KeyError("bad key");
  const m = key.split("/");
  if (m.length < 5 || m[1] !== "games") throw new KeyError("not a tenant key");
  const [cell, , gameId, kind, ...rest] = m;
  const name = rest.join("/");
  const parts = { cell, gameId, kind, name };
  if (tenantKey(cell, gameId, kind, name) !== key) throw new KeyError("non canonical key");
  return parts;
}

/** Throws unless `key` is a valid tenant key inside the given game. */
export function assertKeyInGame(key: string, cell: string, gameId: string): KeyParts {
  const p = parseKey(key);
  if (p.cell !== cell || p.gameId !== gameId) throw new KeyError("key escapes its game");
  return p;
}

/**
 * Accepts a full tenant key for `cell`, or a legacy key `{gameId}/{kind}/{name}` (as written by
 * older callers) and returns the canonical tenant key. Anything else is rejected.
 */
export function resolveBlobKey(cell: string, key: string): string {
  assertCell(cell);
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY) throw new KeyError("bad key");
  const segs = key.split("/");
  if (segs[1] === "games") {
    const p = parseKey(key);
    if (p.cell !== cell) throw new KeyError("key belongs to another cell");
    return key;
  }
  const [gameId, kind, ...rest] = segs;
  if (!kind || rest.length === 0) throw new KeyError("bad key");
  return tenantKey(cell, gameId, kind, rest.join("/"));
}

/**
 * Resolves a deletion/list prefix. Must be inside one game: either the whole game
 * (`{cell}/games/{id}/` or legacy `{id}`) or `.../{kind}` or `.../{kind}/{name...}`.
 * Returns the canonical prefix WITHOUT a trailing slash; callers match exact key or key + "/".
 */
export function resolveBlobPrefix(cell: string, prefix: string): string {
  assertCell(cell);
  if (typeof prefix !== "string" || prefix.length === 0 || prefix.length > MAX_KEY) throw new KeyError("bad prefix");
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const segs = trimmed.split("/");
  let c = cell, rest: string[];
  if (segs[1] === "games") {
    c = segs[0]; rest = segs.slice(2);
    if (c !== cell) throw new KeyError("prefix belongs to another cell");
  } else {
    rest = segs;
  }
  if (rest.length === 0) throw new KeyError("prefix must name a game");
  const gameId = assertGameId(rest[0]);
  let out = `${c}/games/${gameId}`;
  if (rest.length >= 2) out += `/${assertKind(rest[1])}`;
  if (rest.length >= 3) out += `/${assertName(rest.slice(2).join("/"))}`;
  return out;
}

/** Scopes a key to a game: throws KeyError for any key outside it. */
export function belongsToGame(key: string, cell: string, gameId: string): boolean {
  try { assertKeyInGame(key, cell, gameId); return true; } catch { return false; }
}
