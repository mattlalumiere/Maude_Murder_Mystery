# W3 to W4: Room needs gameId, cellId

`web/src/lib/storage` identifies a game by `gameId` and reads it via `(room as {gameId?: string}).gameId ?? room.code` (`gameIdOf`). Until `Room.gameId` exists in `types.ts`, the join code doubles as the game id, so everything still works.

Requests:
1. Add `gameId: string` (26 char ULID) to `Room` and set it in `createRoom`. Pattern accepted by the key builder: `[A-Za-z0-9]{4,32}`. Join codes must match `[A-Za-z0-9]{4,12}`.
2. Build blob keys with `tenantKey(cellId, room.gameId, kind, name)` from `@/lib/storage` (for example `tenantKey(cell, id, "photos", `${playerId}.jpg`)`) and store the full key in `photoKey` / `MediaItem.key`. Legacy `{code}/photos/x.jpg` keys still work: the adapters map them to `{cell}/games/{code}/photos/x.jpg`, but then `gameId` must equal `code` for deletes to line up. Switch both at once.
3. `engine.ts` deletion paths (`deletePrefix(`${room.code}/photos`)`) should use `gamePrefix(cell, gameId)` or `new GameBlobs(media, cell, gameId).deleteAll()`. Game removal should call `getStore().delete(gameId)`, which also removes blobs and the directory entry.
4. Room JSON must stay under `GAME_MAX_STATE_BYTES` (default 2 MiB); `put` throws HttpError 413 beyond it.
5. Expiry sweeper: loop `store.listExpired(cell, 100, cursor)` then `store.delete(id)` for each.
