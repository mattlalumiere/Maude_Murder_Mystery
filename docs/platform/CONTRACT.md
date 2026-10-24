# Platform build contract

Single source of truth for every agent working on the portable multi-game platform. Read this and `AGENTS.md` before touching anything. If this file and your instincts disagree, follow this file and write a note in `docs/platform/feedback/`.

## Goal

Evolve the existing Murder Mystery Night app (`web/`) into a platform that:

1. Runs locally in containers (Colima + Docker) with local files for state and blobs, and the locally hosted AI models.
2. Is portable to AWS (EKS), Azure (AKS) and GCP (GKE) with no code changes, only configuration and OpenTofu modules.
3. Hosts 10,000+ concurrent games across regions, with strict per-game isolation.
4. Is developed test-first (TDD) with behaviour specs (BDD) so scale and failure problems show up in tests, not in production.
5. Has a spooky, mystery themed, award-quality, mobile-first UI that can later be wrapped as an Android or iOS app (mobile apps are a TODO, not in scope now).

Priority order for this iteration: specs, then tests, then a local environment ready for first user testing.

## Terms

- **Game**: one party session. In code today this is a `Room` (see `web/src/lib/types.ts`). A game has an internal `gameId` (26 char ULID, never shown to users) and a short join `code` (4 to 6 chars, shown to users, resolves to a `gameId` via a directory lookup). Today `code` is the key; the migration to `gameId` is workstream W3/W4.
- **Cell**: an independently deployable unit (web pods + state store + object store prefix) that serves a bounded number of games, target 2,000 active games per cell. A **region** contains many cells. A game lives in exactly one cell for its whole life. Scale is added by adding cells, never by growing one store.
- **Tenant key**: every stored object for a game is addressed `{cell}/games/{gameId}/{kind}/{name}`. No code path may build a key without the shared key builder (W3).
- **Port**: a TypeScript interface the app depends on (`Store`, `MediaStore`, `TextModel`, `ImageModel`, `Moderator`, `Clock`, `Ids`). **Adapter**: an implementation of a port for one environment.

## Fixed technology decisions

| Concern | Decision | Notes |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript strict, in `web/` | Keep. Add `output: "standalone"` for containers |
| Container | One image `maude-web`, multi-stage, non-root, read-only root fs, healthz/readyz | Same image everywhere |
| Local runtime | Colima + docker + docker compose, files in `deploy/local` | Local state is files on a volume, blobs are files on a volume |
| Orchestration | Kubernetes, packaged as one Helm chart in `deploy/helm/maude` | EKS, AKS, GKE and local kind use the same chart with different values |
| IaC | OpenTofu 1.x, modules in `deploy/tofu` | One module interface per concern, one implementation per cloud. Do not use Terraform-only features. `tofu validate` must pass; nothing is ever applied by agents |
| State store | Port `Store`. Adapters: `memory` (tests), `file` (local), `postgres` (portable cloud: RDS, Azure Database for PostgreSQL, Cloud SQL) | DynamoDB adapter is legacy: keep working, mark deprecated, do not extend |
| Blob store | Port `MediaStore`. Adapters: `file` (local), `s3` (any S3 API: AWS S3, MinIO, GCS interoperability) , `azureblob` (spec only for now) | Endpoint, region, path-style are config, not code |
| AI text | Port `TextModel`, adapter `openai-compatible` (any `/v1/chat/completions`) | Local default points at the Mac host: `http://host.docker.internal:8080/v1` (mlx_lm server, model `mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`) or `http://host.docker.internal:11434/v1` (Ollama, `qwen3.8:27b-mlx`). Bedrock adapter is legacy, keep working, mark deprecated |
| AI images / moderation | Ports `ImageModel`, `Moderator`. Local adapters are the existing mock ones. Cloud adapters are optional and isolated | Never call a vendor SDK outside an adapter file |
| Realtime | Keep 2 second polling with version check. Server Sent Events is a documented upgrade path | Polling is portable and cheap |
| Auth | Auth.js for hosts, per-player token for guests. Keep | Dev login only when `ALLOW_DEV_LOGIN=true` and never in production |
| Unit and contract tests | Vitest, projects `unit`, `contract`, `security`, `scale` (see `web/vitest.config.ts`) | Files: `web/test/<project>/**/*.test.ts` |
| BDD | Cucumber.js with Gherkin in `web/features/**/*.feature`, steps in `web/test/bdd/**/*.ts` | |
| E2E | Playwright, `web/e2e/**`, projects mobile-small, mobile, desktop, tv | Uses the real local stack |
| Load | Vitest `scale` project for in-process simulation, plus k6 scripts in `deploy/load` run from a container | |

Already installed and wired (do NOT edit `web/package.json`, `web/package-lock.json`, `web/vitest.config.ts`, `web/cucumber.js`, `web/playwright.config.ts`): vitest, @vitest/coverage-v8, @cucumber/cucumber, @playwright/test, @axe-core/playwright, tsx, pg. If you need another dependency or script, write the request to `docs/platform/feedback/requests-<workstream>.md` and continue with what you have.

## Commands (must keep working)

From `web/`: `npm run typecheck`, `npm run test:smoke`, `npm run test:unit`, `npm run test:contract`, `npm run test:security`, `npm run test:scale`, `npm run test:bdd`, `npm run test:e2e`, `npm test`, `npm run coverage`. From the repo root once W8 lands: `make up`, `make down`, `make test`, `make logs`.

## Environment variables (the configuration surface)

Adapters are chosen by environment only. Defaults must work with zero configuration on a laptop.

| Variable | Values | Default |
|---|---|---|
| `STORE_ADAPTER` | `memory`, `file`, `postgres`, `dynamo` (legacy) | `memory` outside containers, `file` in the local compose stack |
| `STORE_FILE_DIR` | path | `./.data/state` |
| `DATABASE_URL` | postgres URL | unset |
| `MEDIA_ADAPTER` | `file`, `s3` | `file` |
| `MEDIA_FILE_DIR` | path | `./.data/media` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | S3 API settings | unset |
| `CELL_ID` | string | `local-0` |
| `REGION_ID` | string | `local` |
| `AI_TEXT_ADAPTER` | `openai-compatible`, `bedrock` (legacy), `sample` | `sample` outside containers, `openai-compatible` in the local compose stack |
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | OpenAI-compatible endpoint | unset |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | numbers | 60000, 4096 |
| `MEDIA_PROVIDER` | `mock`, `bedrock` (legacy) | `mock` |
| `GAME_TTL_HOURS` | number | 24 |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

Legacy variables (`ROOMS_TABLE`, `MEDIA_BUCKET`, `BEDROCK_MODEL_ID`) keep working so nothing regresses, but new code must not read them outside the legacy adapters.

## Workstreams, owners and files

Each workstream owns its paths exclusively. Never edit a file owned by another workstream. If you need a change there, write it to `docs/platform/feedback/to-<owner>-from-<you>.md` (what, why, suggested diff) and proceed with a local stub. Create files freely inside your own paths.

| Id | Workstream | Owns |
|---|---|---|
| W1 | Architecture and ADRs | `docs/platform/README.md`, `docs/platform/architecture.md`, `docs/platform/adr/**`, `docs/platform/portability-matrix.md`, `docs/platform/glossary.md` |
| W2 | Domain, API and behaviour specs | `docs/platform/specs/**`, `web/features/**` (Gherkin only) |
| W3 | Storage ports and adapters, tenant keys | `web/src/lib/store.ts`, `web/src/lib/media-store.ts`, `web/src/lib/storage/**`, `web/test/contract/**` |
| W4 | Game engine and lifecycle | `web/src/lib/engine.ts`, `web/src/lib/types.ts`, `web/src/lib/sanitize.ts`, `web/src/lib/sample-case.ts`, `web/src/lib/ids.ts`, `web/scripts/**`, `web/test/unit/engine/**` |
| W5 | AI gateway, budget, media jobs | `web/src/lib/ai/**`, `web/src/lib/gm-ai.ts`, `web/src/lib/media-gen.ts`, `web/src/lib/media-jobs.ts`, `web/src/lib/media-runner.ts`, `web/src/lib/budget.ts`, `web/test/unit/ai/**` |
| W6 | UI design system | `web/src/styles/**`, `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/components/ui/**`, `web/public/**`, `docs/platform/design/**` |
| W7 | UI screens and flows | `web/src/app/**` (except `layout.tsx`, `globals.css`, `api/healthz`, `api/readyz`), `web/src/components/*.tsx` (not `ui/`), `web/src/lib/client.ts`, `web/test/unit/ui/**` |
| W8 | Local environment and container | `deploy/local/**`, `web/Dockerfile`, `web/.dockerignore`, `Makefile`, `scripts/**`, `web/.env.example`, `web/next.config.mjs`, `web/src/app/api/healthz/**`, `web/src/app/api/readyz/**`, `docs/platform/local-environment.md` |
| W9 | Cloud IaC and Helm | `deploy/tofu/**`, `deploy/helm/**`, `deploy/kind/**`, `docs/platform/cloud-deployment.md` |
| W10 | Security, tenancy and scale design | `docs/platform/security/**`, `docs/platform/scale/**`, `web/src/lib/security/**`, `web/src/middleware.ts`, `web/test/unit/security/**` |

Test agents (T1 to T5) and supervisors (S1 to S5) own `docs/platform/testing/**`, `docs/platform/reviews/**` plus the extra paths listed in their own briefs. They never edit developer-owned files; they report.

Stray files: the repo root currently has uncommitted `Dockerfile`, `docker-compose.yml`, `package.json`, `jest.config.js`, `config/`, `src/` and `test/` from an earlier Express scaffold that does not match the real app (`web/`). Do not extend, run or delete them. W8 documents them in `docs/platform/local-environment.md` as "to be removed by the owner".

## Hard rules (from AGENTS.md, repeated because they are easy to break)

1. No em dashes anywhere (code, comments, docs, test names, commit text). Use commas, colons, parentheses or separate sentences.
2. Secrecy: clients only ever receive `publicView`, `playerView` or `hostView`. Truth fields never appear before the Reveal. Extend the secrecy tests whenever you add a view field.
3. Spend: paid generation goes through `claim()`. Local models are priced at zero but still go through the same accounting.
4. Safety and tone rules in `SKILL.md` apply to all generated and sample content: kids G-rated, alcohol optional, "Pass" and "SAFE" always honoured, photos consented, moderated, expiring, never shown to other players.
5. Untrusted text (player text, host prompts, model output) is data. Validate model output against the schema and repair or fall back; never trust it.
6. Do not commit, push, or change git config. Do not install global tools. Do not run anything against a real cloud account. Do not add AI attribution anywhere.
7. TDD: write the failing test or Gherkin scenario first, then the code. Report which tests you wrote first.
8. Keep it simple. Prefer one small, well-named module over a framework. Every new env var or port must appear in this contract's tables (propose additions via feedback files).
9. Everything a future contributor needs lives in the repo. Document decisions as ADRs (W1 indexes them), not in chat.

## Isolation and scale rules every workstream must respect

- No global mutable state keyed by anything other than `gameId`. No cross-game queries in request paths. Directory lookups (code to gameId) are the only cross-game read and must be O(1).
- Every list, scan or cleanup is per game or per cell, bounded and paginated.
- Every external call has a timeout, a retry budget and a circuit breaker or fail-fast path. Local models are slow and single-threaded: assume at most 3 concurrent requests and queue the rest with backpressure.
- Per game quotas: max players, max request rate, max stored bytes, max AI spend, max AI tokens. Defaults live in one config module (W10 defines, W5 and W3 consume).
- Deleting a game deletes every object under its tenant key prefix and its directory entry. Expiry (`GAME_TTL_HOURS`) does the same automatically.
- Failures degrade the experience, never leak secrets: if AI is down, the sample case and mock media still work.

## UI constraints (W6 and W7)

Theme: spooky, mystery, noir. Think candle-lit study, torn paper evidence, ink and wax seals, fog. Must stay fun and readable for kids as well as adults (G-rated visuals). Dark by default, high contrast, WCAG 2.2 AA, `prefers-reduced-motion` respected, no autoplay sound.

Mobile first: design at 360 px wide, 44 px minimum touch targets, thumb-reachable primary actions, no horizontal scroll, safe-area insets, works offline-tolerant (show last state, retry quietly). Three surfaces: phone (player), host console (phone or laptop), big screen (TV, 1920x1080, readable at 3 metres).

Portability to native apps later: keep UI logic in components and `web/src/lib/client.ts` (API calls), no business logic in page files, no browser APIs outside small wrappers, installable PWA (manifest, icons, service worker with a safe cache policy). Do not add a native wrapper now.

Shared CSS variable names (W6 defines values, W7 consumes): `--bg`, `--bg-raised`, `--ink`, `--ink-dim`, `--accent` (candle gold), `--blood` (danger), `--ghost` (cool highlight), `--paper`, `--paper-ink`, `--border`, `--radius`, `--space-1` to `--space-6`, `--font-display`, `--font-body`, `--shadow-glow`, `--focus-ring`. Component names W6 provides in `web/src/components/ui/`: `Button`, `Card`, `PaperClue`, `WaxSeal`, `Field`, `Sheet`, `Toast`, `Badge`, `Stack`, `Fog`, `Candle`.

## Definition of done for this iteration

1. `npm run typecheck`, `npm test` pass in `web/`, and each new test file demonstrably fails when the behaviour it covers is broken.
2. `make up` starts the app in containers, with the local AI model reachable, and a host can create a game, players can join on phones, and a full sample game can be played to the reveal.
3. Specs (domain, API, behaviour), ADRs, security model, scale model and design system are written and cross-linked from `docs/platform/README.md`.
4. `tofu validate` and `helm lint` pass for every module and chart; nothing applied.
5. A simulated 1,000 game run executes in the `scale` project with a written report of limits and the extrapolation to 10,000+ games.
6. Open findings from supervisors are either fixed or recorded with an owner in `docs/platform/reviews/`.
