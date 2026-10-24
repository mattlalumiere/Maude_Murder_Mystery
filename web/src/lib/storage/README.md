# Storage ports and adapters

Two ports, one key builder.

| Port | File | Adapters (env) |
|---|---|---|
| `Store` (game state) | `ports.ts` | `memory`, `file`, `postgres`, `dynamo` (deprecated) via `STORE_ADAPTER` |
| `MediaStore` (blobs) | `ports.ts` | `file`, `s3`, `azureblob` (stub, throws NotImplemented) via `MEDIA_ADAPTER` |

Entry points: `web/src/lib/store.ts` (`getStore`, `mutate`, `HttpError`) and `web/src/lib/media-store.ts` (`getMediaStore`). Factories: `createStore(env, media)` and `createMediaStore(env)` in `index.ts`. Config and defaults: `limits.ts`.

## Tenant keys (`keys.ts`)

Every object is `{cell}/games/{gameId}/{kind}/{name}`. Only `keys.ts` builds or parses keys (`tenantKey`, `parseKey`, `gamePrefix`, `assertKeyInGame`, `resolveBlobKey`, `resolveBlobPrefix`). Adapters call it on every method; never concatenate keys elsewhere.

Rules: cell `[A-Za-z0-9_-]{1,64}`; gameId `[A-Za-z0-9]{4,32}` (ULID, or a legacy join code until W4 lands gameId); kind `[a-z][a-z0-9_-]{0,31}`; name up to 4 segments of `[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}`, no `..`, no leading dot, not ending in `.mime` (file adapter sidecar), total key under 512 chars.
Legacy keys `{code}/{kind}/{name}` are mapped into the tenant namespace by `resolveBlobKey`. `deletePrefix`/`list` match the exact key plus `key/`, never string siblings (game `AB12` never touches `AB123`). Code holding only one game should use `GameBlobs` (`game-blobs.ts`), which cannot address another game.

## Behaviour notes per adapter

- `file` store: `{STORE_FILE_DIR}/{cell}/games/{gameId}/room.json` (temp file + rename), `{cell}/directory/{CODE}`, lock files under `{cell}/locks`. In-process FIFO mutex plus an exclusive lock file per game (stale after 15 s), so one winner per version across threads and processes. Not for NFS or object-store mounts.
- `postgres`: tables `mm_games`, `mm_directory` (`sql/001_init.sql`, applied on first use, tracked in `mm_migrations`). Conditional `UPDATE ... WHERE version = $expected`. The SQL directory must be present at runtime (`STORE_SQL_DIR`, default `src/lib/storage/sql` under cwd).
- `s3`: configurable `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`. Uses PutObject, GetObject, HeadObject, ListObjectsV2, DeleteObject only (no batch delete, so GCS interop works). Legacy `MEDIA_BUCKET` alone selects it with the default AWS client.
- Quotas: `QuotaPolicy` (`limits.ts`), applied by `QuotaMediaStore`. Soft: concurrent writers may overshoot by their own sizes. Defaults: 200 MiB per game, 12 MiB per blob, 2 MiB per state record (`GAME_MAX_BYTES`, `GAME_MAX_BLOB_BYTES`, `GAME_MAX_STATE_BYTES`).
- `Store.delete(gameId)` deletes blobs first, then directory entry and state, so a crash leaves something `listExpired` can still find. Idempotent.

## How to add an adapter

1. Implement `Store` or `MediaStore` from `ports.ts` in `store-<name>.ts` / `media-<name>.ts`. Build every key through `keys.ts`; validate ids at the top of every public method (throw `KeyError`).
2. Register it in `index.ts` under its env value. Add env vars to `docs/platform/CONTRACT.md` via a feedback file.
3. Add a harness entry in `web/test/contract/harness.ts` (skip with a clear message if it needs external infrastructure).
4. Run `npm run test:contract`. Do not weaken tests to make an adapter pass.
5. Prove the suite bites: break your adapter on purpose (drop the version check, allow `..`) and watch a test fail, then restore.

## Checklist the contract suite enforces

Store (`test/contract/store.contract.test.ts`): create/get by code and id, copies not references; version rules; exactly one winner among N concurrent writers, creators of one id, creators of one code; TTL (past ttl and clock advance), code reuse after expiry; directory lookup; delete removes state, directory and blobs and leaves neighbours; idempotent delete; `listExpired` pagination without gaps or duplicates, even while deleting; traversal and malformed ids rejected; cross-game and cross-cell isolation; large payload round trip and 413 over the limit; 1,000 games created and read back.
MediaStore (`media.contract.test.ts`): exact bytes and mime; overwrite; large blobs and quota (per blob, per game, overwrite counted once); `deletePrefix` precision (no siblings), idempotent; stable pagination; traversal, odd characters, foreign cell rejected on every method; legacy keys; `GameBlobs` isolation; cross-cell isolation; concurrency.
Keys (`keys.test.ts`) and the file store across processes (`store-file.processes.test.ts`).
