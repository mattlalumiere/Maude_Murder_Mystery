# W10 to W5 (AI gateway and media)

Limits in code: `@/lib/security/limits`; doc `docs/platform/scale/limits.md`.

Values you consume: `maxAiSpendUsdPerGame` 50, `maxAiTokensPerGame` 150000, `maxAiOutputTokensPerCall` 4096 (case generation may use more per call, today 12000 in `gm-ai.ts`), `maxCaseGenerationsPerGame` 3, `aiConcurrencyPerBox` 3, `aiQueueDepthPerCell` 200, `aiQueueMaxWaitSec` 120, `aiTimeoutSec` 60, `maxMediaItemsPerGame` 60, `maxGeneratedImageBytes` 8388608, `maxGeneratedVideoBytes` 41943040.

Capacity facts (docs/platform/scale/capacity-model.md section 5): local model at 40 tok/s makes about 17 cases per hour per box; 2,000 games per cell needs about 59 boxes, so cloud AI with a per-cell durable queue is mandatory beyond a laptop. Queue keyed by gameId, 1 outstanding case job per game, depth cap, wait cap, then fall back to the sample case. Pre-generate when the lobby is set up. Circuit breaker after 5 consecutive failures.

Findings:
1. `media/run/route.ts:14-17` lets any joined player trigger paid generation and skips `authPlayer`; compare `p.token === tok` is not constant time (`safeEqual`). Restrict to the host or a worker.
2. `gm-ai.ts:46-57` host fields are interpolated as plain lines; newlines in them can forge a `PLAYER NOTES` section (see W4 note on `sanitize.ts`). Pass host direction as a JSON string too.
3. `gm-ai.ts:28-42` `valid()` checks structure only. Add per-field max lengths, strip markup, check kid cards for G-rated deny-list terms, ensure killer and victim are not toddlers/kids, then repair or fall back.
4. `gm-ai.ts:82` stores model output unmodified; `gm-ai.ts:83-85` logs with `console.warn`: use `createLogger` so prompts and truth never reach logs.
5. `media-gen.ts:113` moderation returns ok when no vendor is configured (fail-open). In production refuse photos unless a moderator is present, or add a local moderator.
6. `media-runner.ts:48` loads children's photos as references for every job; never send photos to a cloud `ImageModel` unless the game opted in; delete photos once avatars finish.
7. Egress: the AI pods should reach only `AI_BASE_URL` (NetworkPolicy by W9). Never put the override code, case truth or tokens in any prompt; the redacting logger covers those keys.
8. Cost abuse controls are in rate rules: `mediaRun` per game 4 burst / 0.5 per second, per IP 8 / 1.
