import type { Room } from "./types";

export interface Store {
  get(code: string): Promise<Room | null>;
  /** Writes only if the stored version equals `expected` (null = must not exist). */
  put(room: Room, expected: number | null): Promise<boolean>;
}

class MemoryStore implements Store {
  private rooms = new Map<string, Room>();
  async get(code: string) {
    const r = this.rooms.get(code);
    if (!r) return null;
    if (r.ttl * 1000 < Date.now()) { this.rooms.delete(code); return null; }
    return structuredClone(r);
  }
  async put(room: Room, expected: number | null) {
    const cur = this.rooms.get(room.code);
    if ((cur?.version ?? null) !== expected) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
}

class DynamoStore implements Store {
  constructor(private table: string) {}
  private async client() {
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    return DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  async get(code: string) {
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const out = await (await this.client()).send(new GetCommand({ TableName: this.table, Key: { pk: code } }));
    if (!out.Item) return null;
    const room = JSON.parse(out.Item.data as string) as Room;
    return room.ttl * 1000 < Date.now() ? null : room;
  }
  async put(room: Room, expected: number | null) {
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    try {
      await (await this.client()).send(new PutCommand({
        TableName: this.table,
        Item: { pk: room.code, ttl: room.ttl, version: room.version, data: JSON.stringify(room) },
        ConditionExpression: expected === null ? "attribute_not_exists(pk)" : "#v = :e",
        ExpressionAttributeNames: expected === null ? undefined : { "#v": "version" },
        ExpressionAttributeValues: expected === null ? undefined : { ":e": expected },
      }));
      return true;
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
      throw e;
    }
  }
}

const g = globalThis as unknown as { __mmStore?: Store };
export function getStore(): Store {
  if (!g.__mmStore) {
    g.__mmStore = process.env.ROOMS_TABLE ? new DynamoStore(process.env.ROOMS_TABLE) : new MemoryStore();
  }
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

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
