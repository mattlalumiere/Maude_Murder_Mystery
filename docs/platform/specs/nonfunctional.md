# Non-functional targets

Numbers the scale and e2e tests assert. "Reference box" means one cell sized per the Helm default (2 web pods x 1 vCPU, 1 Postgres with 2 vCPU, local or S3-compatible object store) and the local AI model on the host. In-process simulations (`scale` project) use the memory store; times in them are ratios against budgets here, not wall clock for the reference box, so tests assert the algorithmic targets (request counts, bytes, no cross-game work) and e2e/k6 assert wall clock.

| Id | Target | Value | Measured by | Rationale |
|---|---|---|---|---|
| NF-1 | State poll latency (server side) | p95 <= 150 ms, p99 <= 400 ms at 2,000 active games | k6, scale | Polling every 2 s must feel live; 150 ms keeps total round trip under 400 ms on phones. |
| NF-2 | State poll cost, unchanged | body <= 100 bytes, 1 store read, 0 writes | scale (counting store) | Dominant traffic. 2,000 games x 20 clients / 2 s = 20,000 rps; must be a cheap version check. |
| NF-3 | State poll payload, changed | publicView <= 24 KB, playerView <= 32 KB, hostView <= 48 KB | unit | Mobile data and parse time; reject view bloat early. |
| NF-4 | Join time (tap Join to card lobby visible) | p95 <= 1.5 s server + render, server part <= 300 ms | e2e, k6 | Twelve people join within the first minute; slow joins feel broken. |
| NF-5 | Mutating action latency (advance, ballot, ready) | p95 <= 300 ms excluding start | k6 | Host taps must feel instant. |
| NF-6 | Start game latency with sample case | p95 <= 1.5 s | scale | Includes casting and queuing; no AI call. |
| NF-7 | Start game latency with AI | hard stop at `AI_TIMEOUT_MS` (60 s), then sample fallback; start returns within 62 s | unit with fake slow model | A host waiting longer than a minute will abandon the app. UI shows progress after 3 s. |
| NF-8 | AI text timeout | 60 s default, configurable; 1 retry only on connection error; breaker opens after 3 consecutive failures for 30 s | unit | Local models are slow and single-threaded; fail fast beats queue pile-up. |
| NF-9 | AI concurrency | max 3 in flight per cell, queue depth 50, then immediate fallback | unit | The contract's assumption for local models; protects the Mac. |
| NF-10 | Players per game | 40 hard max, 25 comfortable (p95 targets hold at 40) | scale | Party of 10 to 20 adults plus 5 to 10 kids; 40 leaves headroom. |
| NF-11 | Games per cell | 2,000 active (soft), 3,000 (hard, readyz stays ok, new games refused with 503 `UNAVAILABLE` above) | scale | Contract target. Scale by cells, never by growing one store. |
| NF-12 | Concurrent games in one simulated run | 1,000 games x 12 players for a 2-minute compressed party, zero cross-game leaks, zero 5xx | scale | Definition of done item 5; extrapolation to 10,000 in the report. |
| NF-13 | Per-game state size | <= 256 KB JSON | unit | Whole-game rewrite per action; keeps write cost bounded. Media bytes live outside state. |
| NF-14 | Write conflict retries | <= 6 per action (existing), conflict rate < 1% at 12 players polling+acting | scale | Optimistic locking must not thrash. |
| NF-15 | Recovery: process restart | new pod ready <= 20 s, no game state lost (state is in the store) | e2e (compose restart) | Pods are disposable. |
| NF-16 | Recovery: store restart | readyz fails within 5 s, requests return 503 not 500, recovers within 30 s of store return, no corrupted game | e2e/chaos | Clean degradation. |
| NF-17 | Recovery: AI down at any moment | game continues; zero failed player-facing requests attributable to AI | e2e | Contract rule: failures degrade, never block. |
| NF-18 | Recovery objective | RPO 0 for acknowledged writes in postgres, RTO <= 5 minutes for a cell; games are 2 hours long so cell loss restarts at most the games in that cell | doc, drill | Party games are low value per game but high emotion; short outage must not lose the night. |
| NF-19 | Delete game | completes <= 5 s for a 200 MB game, leaves 0 objects under the prefix | contract | Privacy promise. |
| NF-20 | Expiry sweep | processes <= 500 games per run per cell, run every 10 minutes; any game expired > 30 minutes is gone | scale | Bounded, paginated cleanup. |
| NF-21 | Rate limits | 120 requests per minute per player for polls, 30 per minute for mutations, 3,000 per game per minute; 429 includes `Retry-After` | security | Blocks a runaway tab without hurting a family sharing one wifi IP. |
| NF-22 | Photo handling | <= 2 MB, JPEG only, accepted p95 <= 2 s including moderation (mock <= 100 ms), stored for <= 1 day, never in views | unit, e2e | Privacy and cost. |
| NF-23 | Memory per game (hot) | <= 1 MB per active game in process memory | scale | 2,000 games must fit in a 2 GB pod pair. |
| NF-24 | Cold start of web pod | <= 3 s to serve healthz | e2e | Autoscaling on game start spikes. |
| NF-25 | Availability | 99.5% monthly for state poll and join | doc | Realistic for hobby/family scale, one cell may fail. |
| NF-26 | Mobile UX | Largest contentful paint <= 2.5 s on a mid phone over 4G for the card screen; interaction targets >= 44 px; no horizontal scroll at 360 px | e2e (mobile-small) | Contract UI constraints. |
| NF-27 | Secrecy test cost | secrecy suite over all phases and roles runs <= 30 s | security | Keeps the suite in every PR. |

## Scale test assertions (concrete)

- 1,000 games, each 12 players (3 kids, 1 little, 8 adults), joined in a 60 second ramp, then all phases advanced, all ballots cast, reveal reached.
- At every phase for every game: no view for game X contains any string unique to game Y (names, clue text, tokens).
- Store operation counts per unchanged poll: 1 get, 0 put.
- p95 of in-process action handler time <= 20 ms (memory store); the e2e k6 run asserts NF-1 and NF-4 against the real stack.
- With the AI adapter set to a 100% failure fake, 1,000 games still reach reveal with `caseSource = sample`.
- Killing the process mid-game (file store) and restarting loses no acknowledged action.
