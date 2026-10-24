# Capacity model

Owner: W10. Every number below is produced by `web/src/lib/security/capacity.ts` (`report()`, `firstBottleneck()`, `placeGame()`), tested in `web/test/unit/security/capacity.test.ts`. To change an assumption edit `DEFAULTS` there, rerun the tests, and regenerate this document's tables with:

```
cd web && npx tsx -e 'import {DEFAULTS,report} from "./src/lib/security/capacity"; console.log(report({...DEFAULTS,games:2000}))'
```

Assumptions are estimates until the `scale` project and k6 runs replace them with measurements. Inputs that are guesses are marked (guess).

## 1. Assumptions

| Name | Value | Note |
|---|---|---|
| Players per game | 16 | plus host console and big screen = 18 devices |
| Poll interval | 2 s | from CONTRACT |
| Unchanged response | 100 B | `{unchanged:true,version:n}` plus headers body |
| Changed response | 20 kB | full state |
| State changes per game per second | 0.1 (guess, conservative) | phase moves, ready taps, ballots, media done. Lobby and ballot windows are burstier |
| Writes per game per second | 0.15 (guess) | state changes plus job bookkeeping |
| Pod throughput | 1,500 rps at 50% target utilisation = 750 rps planned (guess) | Node serving small JSON with a read cache. Changed responses cost more, see sensitivity |
| Store row size | 40 kB (guess) | whole Room JSON, rewritten on each mutation (`store.ts`) |
| Game length | 2 h | |
| Cell capacity | 2,000 active games, soft fill 80% = 1,600 for new placements | |

## 2. Requests per second

Per game: 18 devices / 2 s = **9 rps**. Per cell at 2,000 games: **18,000 rps**. At 10,000 games: **90,000 rps** (fleet, over 7 to 8 cells).

This is the dominant cost of the whole platform, and it is mostly 100 byte answers. Levers, in order of value:
1. Version-only read in the state route: answer the poll from a per pod cache keyed by game (TTL 1 s) so the store sees at most one read per game per second per pod (ties to A4 in the threat model).
2. ETag / `If-None-Match` so unchanged answers are bodyless 304s (also cheaper at the ingress).
3. Client polling backoff: 2 s while the tab is visible and the phase is active, 5 s hidden, 10 s on 429 or for the big screen in idle phases. A 50/50 mix of 2 s and 5 s cuts rps by about 30%.
4. Server Sent Events (documented upgrade path): one open connection per device replaces polls; costs memory per connection (about 20 to 50 kB), so about 10 to 20 thousand connections per pod; reduces rps to near zero, increases pods held open. Keep polling until measurements justify it.

## 3. Per cell sizing (2,000 games)

| Quantity | Value | Calculation |
|---|---|---|
| Devices | 36,000 | 2,000 x 18 |
| Poll rps | 18,000 | 36,000 / 2 |
| Changed responses per second | 3,600 | 36,000 x 0.1 (20% of polls; high, see sensitivity) |
| Egress | 73 MB/s (about 590 Mbit/s) | 14,400 x 100 B + 3,600 x 20 kB |
| Web pods | 24 | 18,000 / (1,500 x 0.5), rounded to a multiple of 3 zones |
| Store reads per second, naive | 18,000 | one full row read per poll (what `state/route.ts` does today) |
| Store reads per second, with 1 s read cache | 2,000 | 1 per game per second |
| Store writes per second | 300 | 2,000 x 0.15 |
| Postgres connections | 120 | 24 pods x pool 5 (use PgBouncer in transaction mode in front) |
| Postgres WAL | 24 MB/s | 300 writes x 40 kB x 2 amplification. Too high: split hot state from the case file so rows are about 8 kB (then 5 MB/s). Request to W3 |
| Postgres data | 0.08 GB live | 2,000 x 40 kB; negligible, TTL keeps it small |
| Postgres instance | 8 vCPU, 32 GB, NVMe or provisioned 3,000+ IOPS, 1 synchronous replica | write IOPS about 600, sized for WAL and reads |
| Blob PUT per second | 7.8 | per game 8 photos + 20 generated items over 2 h |
| Blob GET per second | 104 | each device fetches each item once; put a CDN or a pod level cache in front for generated art |

Sensitivity of pods to cost of a changed response (4x the cost of an unchanged one, 20% changed): blended capacity falls to about 940 rps per pod, so 38 pods per cell. With a realistic change rate of 0.03, blended cost is near 1.1 and 24 pods hold. Measure and set `perPodRps` from the k6 run.

## 4. Fleet at 10,000 games

| Quantity | Value |
|---|---|
| Poll rps | 90,000 |
| Web pods (all cells) | 120 at the baseline assumptions |
| Egress | 367 MB/s (about 2.9 Gbit/s) |
| Store reads / writes per second | 10,000 / 1,500 with cache (90,000 reads naive) |
| Postgres connections | 600 behind poolers |
| WAL | 120 MB/s fleet, 24 per cell |
| Blob PUT / GET per second | 39 / 522 |
| Cells | 8 = ceil(10,000 / (2,000 x 0.8)) + 1 spare |

## 5. AI throughput

Local model: 40 tokens/s, single threaded. One case is about 8,000 output tokens (limits: `maxAiOutputTokensPerCall` 4,096 means two calls, or raise per call for case generation) plus about 10 s prompt processing: 8,000 / 40 + 10 = 210 s. **17 case generations per hour per box** (one at a time; three concurrent requests share the memory bandwidth, so assume no throughput gain, `concurrencyGain` = 1; the 3 concurrent slot setting only hides latency).

| Scenario | Starts per hour | Local boxes |
|---|---|---|
| 1 laptop, a few parties | up to 17 | 1 |
| One cell, 2,000 games of 2 h, evenly spread | 1,000 | 59 |
| 10,000 games | 5,000 | 295 |
| Realistic evening peak: all games in a cell start within 15 minutes | 8,000 | 471 per cell |

Conclusion: local models serve a laptop or a small deployment. Any real fleet needs cloud AI (or a GPU pool) behind a queue:
- Demand: 5,000 cases per hour at 11k tokens each is 55 M tokens per hour, about 917k tokens per minute, which needs a provisioned quota well above default account limits. Little's law: arrival 1.4 per second x 100 s service = about 140 concurrent generations on average, about 560 at a 4x peak.
- Queue design (W5): one durable queue per cell (or per region), items keyed by gameId, per game share of 1 outstanding case job, depth limit `aiQueueDepthPerCell` 200, wait budget `aiQueueMaxWaitSec` 120, then fall back to the sample case so the party never stalls. Pre-generate: start generating as soon as the lobby has enough players expected (host-declared `expected`) rather than at Start, which moves the work off the critical path and flattens the peak.
- Media (avatars, scenes) is lower priority than cases and is paced by `aiConcurrencyPerBox` and spend caps.
- Circuit breaker: after 5 consecutive failures or 30 s of p95 above the timeout, open for 60 s, serve sample content.

## 6. Cell sizing, headroom, autoscaling

- Cell = 2,000 active games hard cap, 1,600 soft (stop placing new games). The 20% gap absorbs games already running that grow (late joiners, media jobs) and gives a cell drain room.
- Headroom: pods run at 50% target utilisation (planned), Postgres below 50% CPU and 60% connection pool, egress below 50% of the load balancer limit. Lose one zone (of 3): the remaining two carry 100% at 75% utilisation per pod, still under the 100% line.
- Autoscaling signals (HPA/KEDA), in order of preference:
  1. requests in flight per pod or rps per pod (custom metric) with target 750;
  2. CPU 55%;
  3. event loop lag p95 above 50 ms scales up fast, above 200 ms is an alert;
  4. AI queue depth and oldest item age scale AI workers, not web pods.
  Scale up fast (double within 60 s), scale down slow (5% per minute, 10 minute stabilisation) because games are bursty and the next party is minutes away. Pre-scale on a schedule for known peak windows (Friday and Saturday 18:00 to 22:00 local).
- Store autoscaling is vertical plus replicas; the way to add store capacity is a new cell, not a bigger database.

## 7. Failure propagation

| Failure | Direct effect | Propagation | Containment |
|---|---|---|---|
| One web pod dies | its in-flight requests fail, clients retry in 2 s | none (stateless) | PDB, readiness gate, retries |
| Zone loss | 33% of pods gone | surviving pods take 1.5x load | headroom above; HPA scales up |
| Store primary fails (a cell) | 2,000 games cannot mutate; reads served from cache for up to the TTL | polls start failing, clients show last state and retry | failover to replica in under 60 s; clients tolerate; no other cell touched |
| Store slow (not down) | pods wait on DB, in-flight grows, event loop lag | retry storms amplify load | per call timeout 2 s, retry budget 10%, load shedding returning 503 + Retry-After on `state` before `action` |
| Blob store slow | photo and media routes fail | none for polling (state route does not touch blobs) | separate timeouts; media routes degrade to placeholders |
| AI endpoint down or slow | case generation stalls | queue grows, hosts waiting at Start | breaker, sample case fallback, bounded queue |
| Hot game (bug or abuse) | writes thrash one row | optimistic retries consume DB capacity | per game rate limit, retry cap with jitter |
| Directory down | cannot join new games | running games unaffected (token + cell URL cached) | directory is a replicated read-mostly table; cache in each pod 60 s |
| Bad deploy | cell wide errors | one cell only (progressive rollout) | canary one cell, auto rollback on error rate |
| Retry storm after a 429 | clients retry at 2 s | amplifies | `Retry-After` honoured, exponential backoff with jitter, cap 10 s |

## 8. Game placement and cell drain

Placement algorithm (`placeGame` in `capacity.ts`):
1. Choose the **home region** from the host's request (nearest region by edge geo header, overridden by an explicit choice). A game never moves region.
2. Candidates = cells in the home region with `status = open` and `active < capacity x softFill`.
3. Pick the **least loaded** candidate (ties broken by cell id so it is deterministic and testable). Optionally "power of two choices" between two random candidates when the control plane is sharded, to avoid herding on stale counts.
4. If none, spill to the least loaded open cell in the nearest other region (`allowSpill`), and raise an alert: the region is out of capacity.
5. Record `code -> {gameId, cellId}` in the directory in the same transaction that creates the game. A game lives in exactly that cell until it ends.

Active counts come from a per cell gauge reported every 10 s; they may be stale by that much, which the 20% soft limit absorbs.

Cell drain (maintenance, upgrade, incident):
1. Set cell `status = draining`: placement skips it. Existing games continue.
2. Wait for games to end (TTL 24 h at most; typical 2 h to 3 h). Hosts see nothing.
3. At T + 6 h (or on emergency) any remaining games get a banner "this game will move", the host can export state and restart in another cell (optional feature; not required for the first release).
4. When `active = 0`, run the sweeper, verify the prefix is empty (tenancy.md), then upgrade or remove the cell.
5. Capacity check before draining: remaining open cells must hold current load at no more than 80% soft fill, else add a cell first.

Adding a cell: apply the OpenTofu cell module, helm install, smoke test, set `open`. Time to add capacity is minutes, not a database migration.

## 9. What breaks first at 10x

10x of a cell is 20,000 games in one cell (the anti-pattern the cell design prevents). `firstBottleneck()` gives, at that load:

| Component | Load / ceiling | Ratio |
|---|---|---|
| Store reads, naive path | 180,000/s vs 50,000/s | 3.6 (breaks first) |
| Postgres connections | 1,200 vs 500 | 2.4 |
| Pods | 240 vs 200 per cell | 1.2 |
| Egress | 734 MB/s vs 1,000 MB/s | 0.73 |
| Store writes | 3,000/s vs 5,000/s | 0.6 |

With the read cache the order becomes Postgres connections (2.4, solved by a pooler), then pod count (1.2), then egress. Behind those, in order: node count and IP addresses per cluster, load balancer connection limits, log volume (90,000 rps of access logs; sample them), then AI, which breaks long before everything above (295 local boxes) and is the real ceiling for new games per hour.

10x of the fleet (100,000 games) is not a bigger cell; it is 80 cells in several regions plus a sharded directory and control plane. The first fleet level limit then is the control plane (placement counters, directory writes at about 1.4 per second at 5,000 starts per hour is small) and cloud AI quota.

## 10. Verification plan

1. `scale` project: in-process simulation of 1,000 games with the memory adapter measuring store ops per poll (should drop from 1 to about 0.06 with the cache).
2. k6 in a container against `make up` and kind: 200 games, 18 devices, 2 s polls, with unchanged/changed mix from this model; record rps per pod and p99.
3. Update `DEFAULTS.perPodRps`, `rowBytes`, `stateChangesPerGamePerSec` with measured values and rerun the test suite so the tables here stay in sync.
