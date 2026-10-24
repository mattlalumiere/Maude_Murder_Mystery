// Public entry for state storage. Adapters live in ./storage; selected by STORE_ADAPTER.
import type { Room } from "./types";
import { getMediaStore } from "./media-store";
import { createStore, HttpError } from "./storage";
import type { Store } from "./storage";

export { HttpError };
export type { Store };

const g = globalThis as unknown as { __mmStore?: Store };
export function getStore(): Store {
  if (!g.__mmStore) g.__mmStore = createStore(process.env, getMediaStore());
  return g.__mmStore;
}

/** Read-modify-write with optimistic retry. `fn` mutates the room and may throw to abort. */
export async function mutate<T>(code: string, fn: (room: Room) => T | Promise<T>): Promise<{ room: Room; result: T }> {
  const store = getStore();
  for (let i = 0; i < 6; i++) {
    const room = await store.get(code);
    if (!room) throw new HttpError(404, "Room not found");
    const before = room.version;
    const result = await fn(room);
    room.version = before + 1;
    if (await store.put(room, before)) return { room, result };
  }
  throw new HttpError(409, "Busy, please retry");
}
