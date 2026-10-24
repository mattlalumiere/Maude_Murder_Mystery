import type { Room } from "../types";
import { assertCode, assertGameId } from "./keys";
import type { ExpiredPage } from "./ports";
import { HttpError } from "./errors";

/** Internal game id. Rooms get a ULID `gameId` from W4; until then the join code doubles as the id. */
export function gameIdOf(room: Room): string {
  return (room as Room & { gameId?: string }).gameId ?? room.code;
}

/** Validates the ids a Room carries before any adapter touches storage. */
export function checkRoomIds(room: Room): { gameId: string; code: string } {
  return { gameId: assertGameId(gameIdOf(room)), code: assertCode(room.code) };
}

export const isExpired = (ttlSeconds: number, nowMs = Date.now()) => ttlSeconds * 1000 < nowMs;

export function clampLimit(limit: number): number {
  return Math.max(1, Math.min(Math.floor(limit) || 1, 1000));
}

export function checkStateSize(json: string, max: number) {
  if (Buffer.byteLength(json) > max) throw new HttpError(413, "Game state too large");
}

export const emptyPage: ExpiredPage = { gameIds: [], next: null };
