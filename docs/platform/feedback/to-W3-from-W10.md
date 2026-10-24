# W10 to W3 (storage)

Limits are in code: `import { LIMITS } from "@/lib/security/limits"`; rationale in `docs/platform/scale/limits.md`.

Names and values you consume:
- `joinCodeLength` 6 (alphabet 31 chars, no 0 O 1 I L U). Current 4 char code over 23 chars is enumerable.
- `gameTtlHours` 24, `maxGameTtlHours` 72, `photoRetentionHours` 24.
- `maxStateBytesPerGame` 262144: reject larger `Store.put` with 413. Whole Room rewrite at about 40 kB per mutation drives WAL; consider splitting hot state from the case file (target 8 kB rows).
- `maxStoredBytesPerGame` 67108864, `maxPhotosPerGame` 40, `maxMediaItemsPerGame` 60.
- `maxStoreWritesPerGamePerSec` 10 (per gameId token bucket in the adapter), `maxMutateRetries` 6 (add jitter).

Defects found in current code to fix in the new adapters (see `docs/platform/security/threat-model.md`):
1. `media-store.ts` `safe(".")` passes, so `deletePrefix(".")` wipes the local media root. Key builder must reject empty, `.`, anything not under `{cell}/games/{gameId}/`.
2. `media-store.ts` S3 `deletePrefix` lists one page (max 1000 keys) with no continuation, and prefixes without a trailing slash (`ABCD/photos` also matches `ABCD/photos2`). Paginate, append `/`, and verify with a final list.
3. Local single-file delete leaves the `.mime` sidecar.
4. `store.ts` expires lazily on read only. Add a per-cell sweeper (bounded batches) that deletes blobs by prefix, then rows, then the directory entry.
5. `store.ts` `getStore()` singleton in memory must refuse to run with several pods (fail at startup when `NODE_ENV=production` and adapter is `memory` and `CELL_ID != local-0`).
6. Please add the contract tests listed in `docs/platform/security/tenancy.md` section 7 (two-game canary isolation, exact prefix delete, 2,500 object pagination, whole-store scan after delete).
7. Poll path: provide a version-only read (`getVersion(gameId)`) and an in-process 1 s read cache so `state` costs at most 1 store read per game per second per pod (capacity-model.md section 2).
