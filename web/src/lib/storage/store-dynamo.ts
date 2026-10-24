import type { Room } from "../types";
import { NotImplementedError } from "./errors";
import type { ExpiredPage, MediaStore, Store } from "./ports";

/**
 * @deprecated Legacy AWS only adapter (ROOMS_TABLE). Kept so nothing regresses, not extended.
 * Key is the join code (pk), so gameId equals code here. Use the postgres adapter instead.
 */
export class DynamoStore implements Store {
  constructor(private table: string, private media?: MediaStore, private cellId = "local-0") {}
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
  getById(gameId: string) { return this.get(gameId); }
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
  async listExpired(): Promise<ExpiredPage> {
    throw new NotImplementedError("DynamoDB expires rows with its native TTL; listExpired is not supported by the legacy adapter");
  }
  async delete(gameId: string) {
    const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
    await this.media?.deletePrefix(`${this.cellId}/games/${gameId}`);
    await (await this.client()).send(new DeleteCommand({ TableName: this.table, Key: { pk: gameId } }));
  }
}
