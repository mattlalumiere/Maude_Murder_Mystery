# Limits (quotas and rate rules)

Owner: W10. Single source of truth in code: `web/src/lib/security/limits.ts` (`LIMITS`, `RATE_LIMITS`). This file explains each value. W3, W4 and W5 import `@/lib/security/limits` or copy the exact names below. If a value must change, change code and this file together; `web/test/unit/security/limits.test.ts` guards invariants.

## Quotas

| Name | Default | Rationale | Enforced by |
|---|---|---|---|
| `typicalPlayersPerGame` | 16 | planning figure for capacity and rate rules | n/a |
| `maxPlayersPerGame` | 40 | existing hard cap in `addPlayer`; keeps one row below 256 KiB | W4 |
| `maxPlayerNameChars` | 24 | existing | W4 |
| `maxBackstoryChars` | 600 | existing; bounds prompt size | W4 |
| `maxHostPromptChars` | 400 | existing per field | W4 |
| `joinCodeLength` | 6 | 31^6 = 887 M codes; 4 chars gives 3.6% hit rate at 10,000 live games | W3/W4 |
| `activeGamesTarget` | 20,000 | 2x the 10,000 goal, used to size code space | tests |
| `maxActiveGamesPerHost` | 3 | a host runs one party; 3 allows rehearsal | W4 |
| `maxGamesCreatedPerHostPerDay` | 10 | cost and abuse control | W4 |
| `gameTtlHours` | 24 | contract `GAME_TTL_HOURS` default | W3 |
| `maxGameTtlHours` | 72 | upper bound for the env var | W3 |
| `maxJsonBodyBytes` | 32 KiB | largest legitimate body is a setup config, under 4 KiB | W4 routes, middleware later |
| `maxPhotoBytes` | 2 MiB | existing | W4 |
| `maxPhotoBodyBytes` | 2 MiB + 4 KiB | multipart/headers slack; check `Content-Length` before reading | W4 |
| `maxStateBytesPerGame` | 256 KiB | DynamoDB items cap at 400 KB; bounds poll cost | W3 `put()` |
| `maxStoredBytesPerGame` | 64 MiB | 40 photos x 2 MiB = 80 MiB worst case, but photos are deleted after avatars; 64 MiB covers generated art and one video | W3 media accounting |
| `maxPhotosPerGame` | 40 | one per player | W3/W4 |
| `maxMediaItemsPerGame` | 60 | existing view window (`hostView` slices 60) | W5 |
| `maxGeneratedImageBytes` | 8 MiB | PNG at 1024 px | W5 |
| `maxGeneratedVideoBytes` | 40 MiB | short clip | W5 |
| `maxStoreWritesPerGamePerSec` | 10 | normal rate is 0.15 per second; 10 allows burst, stops thrash | W3 adapter |
| `maxMutateRetries` | 6 | existing in `mutate()`; add jitter | W3 |
| `minOverrideCodeChars` | 6 | existing 4 is too weak | W4 |
| `maxOverrideCodeChars` | 64 | matches W4 `engine-limits.ts` `overrideCodeMax`; bounds scrypt input | W4 |
| `maxFailedOverrides` | 3 | existing | W4 |
| `overrideLockMinutes` | 10 | existing | W4 |
| `maxAiSpendUsdPerGame` | 50 | existing sanitiser allows 500; default recommended cap input is 10 | W4 `money()`, W5 `claim()` |
| `maxAiTokensPerGame` | 150,000 | one case (about 11k) x 3 plus narration and retries | W5 |
| `maxAiOutputTokensPerCall` | 4,096 | contract `AI_MAX_OUTPUT_TOKENS` default; case generation may raise per call up to 12,000 as today (`gm-ai.ts`) | W5 |
| `maxCaseGenerationsPerGame` | 3 | first try plus two regenerations | W5 |
| `aiConcurrencyPerBox` | 3 | contract: local models at most 3 concurrent | W5 |
| `aiQueueDepthPerCell` | 200 | about 2 minutes of cloud throughput at peak; beyond it fall back to sample | W5 |
| `aiQueueMaxWaitSec` | 120 | longer than this a host will think the app is broken | W5 |
| `aiTimeoutSec` | 60 | contract `AI_TIMEOUT_MS` 60000 | W5 |
| `photoRetentionHours` | 24 | AGENTS.md: 1 day expiry | W3 |
| `auditRetentionDays` | 30 | enough for support, short for privacy | W9 |

## Rate rules (token buckets)

`capacity` is the burst, `refillPerSec` the sustained rate. A request must pass both its game bucket and its IP bucket.

| Class | Game: capacity / refill | IP: capacity / refill | Rationale |
|---|---|---|---|
| `state` | 60 / 24 | 120 / 40 | steady poll is 9 rps per game; 24 is 2.7x. IP is looser: a whole party can share one NAT, and carrier NAT is shared by strangers |
| `action` | 20 / 5 | 40 / 10 | taps are human speed |
| `join` | 24 / 1 | 30 / 2 | 16 guests arrive within a minute; sweeping codes is blocked per IP |
| `photo` | 8 / 0.2 | 12 / 0.3 | one per player; 1 per 5 s sustained |
| `mediaRun` | 4 / 0.5 | 8 / 1 | one job per 2 s is more than any adapter completes |
| `mediaGet` | 80 / 20 | 160 / 40 | 18 devices fetching 20 items at phase change |
| `create` | 10 / 1 | 3 / 1 per 60 s | game creation is rare and expensive |
| `auth` | 20 / 1 | 10 / 0.2 | login brute force and OAuth callbacks |
| `api` | 40 / 10 | 60 / 15 | any other API route |

Config knobs (environment): `RATE_LIMIT=off` disables, `TRUSTED_PROXY_HOPS` (default 1), `ENABLE_HSTS=true`. These need adding to CONTRACT.md's env table (request sent to W1).
