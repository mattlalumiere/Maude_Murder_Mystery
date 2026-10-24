# Tenancy and isolation

Owner: W10. Binding inputs: CONTRACT.md "Isolation and scale rules". A **tenant** is a game. A **cell** is the failure and scaling unit.

## 1. Isolation model

### Identity
- `gameId`: 26 char ULID, internal, never shown. `code`: join code, 6 chars from a 31 char alphabet (no 0, O, 1, I, L, U), shown to users. Directory maps `code -> {gameId, cellId}` in O(1).
- Code space: 31^6 = 887 million. At 20,000 live games a random guess hits a live game with probability 2.3e-5. Today's 4 letter code over 23 chars (`engine.ts` `CODE_CHARS`) has 279,841 values and is 3.6% hit rate at 10,000 games, so it must change before scale (W3/W4). Codes are never reused within `GAME_TTL_HOURS` plus a day.
- Unknown, expired and deleted codes return the same 404 with the same body and similar latency.

### Keys
Every object is addressed `{cell}/games/{gameId}/{kind}/{name}` (CONTRACT). Rules for the W3 key builder:
1. One function `tenantKey(cell, gameId, kind, name)` is the only constructor. Inputs are validated: `cell` `^[a-z0-9-]{1,32}$`, `gameId` `^[0-9A-HJKMNP-TV-Z]{26}$`, `kind` from an enum (`state`, `photos`, `gen`, `export`), `name` `^[A-Za-z0-9._-]{1,128}$`, no leading dot.
2. A prefix operation (`deletePrefix`, `list`) always takes `(cell, gameId)` and appends a trailing `/`. It never accepts a free string. This also fixes `deletePrefix(".")` removing the whole local root (`media-store.ts` `safe()`) and S3 prefix collisions (`ABCD/photos` also matching `ABCD/photos2`).
3. Postgres: every table has `(game_id)` as the first column of the primary key; no query in a request path lacks `WHERE game_id = $1`. Row level security is optional, see section 3.
4. The app role cannot `SELECT` across games in a request path by construction: the only cross-game operations are `directory.lookup(code)` and the per cell sweeper, which uses a different role.

### Request scoping
- Every API handler resolves `code -> gameId` once, then passes only `gameId` down. Handlers do not accept a second game identifier.
- Rate limit and quota keys are `game:{code}` and `ip:{addr}` (middleware today uses the code from the path; after the migration switch to `gameId`).
- Logs carry `gameId` and `cellId` (never `code`, which is a join credential for the screen).

## 2. Per game quotas

Defined in `web/src/lib/security/limits.ts` (`LIMITS`, `RATE_LIMITS`), explained in `docs/platform/scale/limits.md`. Enforcement points:

| Quota | Enforced in | Failure behaviour |
|---|---|---|
| `maxPlayersPerGame` 40 | `addPlayer` (W4) | 409 "Room is full" |
| `maxStateBytesPerGame` 256 KiB | `Store.put` (W3) | 413, game keeps last good state |
| `maxStoredBytesPerGame` 64 MiB, `maxPhotosPerGame` 40, `maxMediaItemsPerGame` 60 | `MediaStore.put` accounting (W3) | 413, generation skipped with a note |
| `maxStoreWritesPerGamePerSec` 10 | adapter token bucket per gameId | 429 with Retry-After |
| `RATE_LIMITS.game.*` | middleware (W10) | 429 |
| `maxAiSpendUsdPerGame`, `maxAiTokensPerGame`, `maxCaseGenerationsPerGame` | `claim()` and gateway (W5) | sample case and mock media |
| `maxActiveGamesPerHost`, `maxGamesCreatedPerHostPerDay` | `createRoom` (W4) | 429 |

Quota state lives inside the game's own record so deleting the game deletes its accounting.

## 3. Per game encryption key derivation (option)

Goal: make deletion cryptographic and limit the damage of a read-only leak of a bucket or database dump. Not required for the first release; design is fixed so it can be added without changing callers.

- Cell master key (KMS/Key Vault/Cloud KMS, or a file secret locally) `K_cell`, never in the image.
- Per game data key: `K_game = HKDF-SHA256(K_cell, salt = gameId, info = "maude/v1/" + kind)`. Derived on demand, held in memory only, never stored.
- Photos and generated media: AES-256-GCM, random 96 bit nonce per object, additional data = the tenant key (so a ciphertext moved to another game fails to decrypt).
- State rows: the fields that are secrets (`overrideHash`, player tokens, `case`) are encrypted the same way; routing fields (`version`, `phase`, `ttl`) stay plain for indexing.
- Deletion guarantee upgrade: when `K_cell` rotates with a `rewrap` of games still alive, expired games' ciphertext becomes unreadable even if a backup resurrects it. For hard guarantees, use a per game random data key wrapped by KMS and stored on the row; deleting the row destroys the key (crypto-shredding). Choose this variant if backups of the state store are kept longer than 24 h.
- Cost: one HKDF per request is microseconds. The read cache holds plaintext rooms for at most 1 s.

## 4. Noisy neighbour controls

1. Per game token buckets in the edge (middleware) and in the store adapter.
2. Per IP buckets so one party's NAT cannot starve others, and one attacker cannot sweep codes.
3. Optimistic lock retries capped at 6 (`store.ts` `mutate`), with jitter added in W3 so hot games do not thrash the DB.
4. AI: single shared queue per cell with a per game share (max 1 queued job per game per phase) and global depth `aiQueueDepthPerCell`. A game over its share gets the sample case.
5. Resource limits on every pod; Postgres `statement_timeout` 2 s, `idle_in_transaction_session_timeout` 5 s, per role connection limit.
6. Fairness: per cell workers pull from queues round robin by gameId, not FIFO, so one game queuing 60 media jobs cannot starve 100 others.

## 5. Deletion guarantees

Definition: after `deleteGame(gameId)` returns, no object under `{cell}/games/{gameId}/` exists in the state store or blob store, the directory entry is gone, the code is quarantined for the TTL, and caches evict within 5 s.

- Triggers: host delete, TTL expiry (`GAME_TTL_HOURS`, default 24, max 72), player "remove my photo", operator purge.
- Order: (1) mark `deleting` (writes refused), (2) delete blobs with paginated list-and-delete until a final list returns empty, (3) delete state rows, (4) delete directory entry, (5) emit audit event `game.deleted` with counts only.
- Sweeper per cell: scans by `ttl` index, bounded batch of 100 games per minute, idempotent, resumes after crash.
- Blob store lifecycle rule as a backstop: objects under `*/games/*/photos/` expire after 24 h at the bucket level, independent of the app.
- Backups: the state database backup retention must be at most the game TTL for point in time restore, or use crypto-shredding (section 3).
- Known gaps to fix: S3 `deletePrefix` has no pagination (`media-store.ts`), local single file delete leaves the `.mime` sidecar, nothing sweeps expired rows (`store.ts` expires lazily on read only).

## 6. Cell isolation and blast radius

- A cell is one Helm release: web pods, its own Postgres (or schema + dedicated instance), its own bucket prefix and IAM/Workload Identity, own NetworkPolicy, own secrets. No cross-cell network path except the directory service and the control plane.
- A game lives in exactly one cell. Cell identity is in every key and every log line.
- Blast radius by failure: pod crash = 0 games lost (state is in the store); a bad deploy = canary one cell first, at most 2,000 games; store failure = one cell, 2,000 games (about 1/N of the fleet; with 8 cells, 12.5%); region failure = that region's cells, games are lost unless the host restarts (game lifetimes are 2 hours, so no cross region replication of state: cost is higher than value). Directory failure = new joins fail, running games keep working (clients hold their token and the cell URL).
- Credentials: the cell's IAM role can touch only `{cell}/*` in the bucket and only its own database. A compromised pod therefore reads at most one cell.
- Release: deploy by cell, one at a time, with a soak; rollback is per cell.

## 7. How to prove it (tests)

All run under the existing vitest projects.

| Claim | Test | Project | Owner |
|---|---|---|---|
| Key builder rejects traversal, empty parts, wrong shapes | property test with fuzzed segments (`..`, `/`, `%2e`, unicode, NUL, `.`) never yields a key outside the prefix | contract | W3 |
| Game A cannot read or list game B | run every `Store` and `MediaStore` contract against two games; write distinct canaries; assert reads and lists with A's identity never return B's | contract | W3 |
| Prefix delete is exact | create `ABCD/photos` and `ABCD/photos2`, delete the first, assert the second remains; create 2,500 objects, delete, assert list empty (pagination) | contract | W3 |
| Deletion is complete | after `deleteGame`, scan the whole backing store for the gameId string and for the canary bytes; expect zero hits (file adapter: walk the volume; Postgres: dump and grep) | contract | W3 |
| Secrecy per tenant | existing secrecy tests over `publicView`, `playerView`, `hostView`, run with two games active; assert no id, name, or token from game B appears in game A's views | unit | W4 |
| Handlers never take a foreign id | static test: grep route files for `params` use beyond `code`, and for `getStore().get(` with a non-resolved key | security | W10 |
| Noisy neighbour | in-process simulation: game A sends 100x the allowed rate, game B behaves; assert B's p99 latency and acceptance rate unchanged | scale | W10 / T-team |
| Quotas bite | per limit in `limits.ts`: one test that exceeds it and expects 4xx not 5xx, plus assert state unchanged | security | W10 |
| Limiter fairness | token bucket tests (burst, refill, per key isolation, LRU bound): `web/test/unit/security/rate-limit.test.ts` | unit | W10 (done) |
| Log hygiene | redaction fuzz: `web/test/unit/security/logger.test.ts` (done); plus a test that greps captured logs of a full game run for the override code, every player token, the killer id and photo bytes | security | W10 / T-team |
| Cell drain moves nothing it should not | placement tests in `capacity.test.ts` (done): draining cells never receive games | unit | W10 (done) |
| Cross cell credential limits | `tofu validate` plus policy test that the bucket policy resource is scoped to `${cell}/*` | infra | W9 |

Mutation discipline: each of these tests must fail when the guarded line is removed (for example delete the `game_id` predicate, drop the trailing slash on a prefix, remove a redaction key).
