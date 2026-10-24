# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, and others) working in this repository.

## What this project is

Murder Mystery Night is a party game for mixed-age groups (10-20 adults aged 20-70, 5-10 kids aged 1-15, about 2 hours). An AI acts as Game Master and is the only one who knows the solution. There are two deliverables that share the same rules:

1. **The skill** (`SKILL.md`, `references/`): a portable Game Master prompt that works in Claude, ChatGPT, Gemini, or any chatbot.
2. **The web app** (`web/`): a Next.js app where the server holds the secrets, phones show private cards, and a TV shows the shared scene.

`SKILL.md` is the source of truth for rules and tone. The web app implements those rules in code.

## Repository map

| Path | Purpose |
|---|---|
| `SKILL.md` | Game Master skill: modes, safety rules, run sheet, Vault, Host Override Code, voice mode |
| `references/case-design.md` | How to build a fair, solvable case |
| `references/content-banks.md` | Drinking rules, dares, kid roles, themes, twists, prizes |
| `build-portable.sh` | Generates `PORTABLE_PROMPT.md` (one paste-in file for other chatbots) |
| `PORTABLE_PROMPT.md` | Generated. Never edit by hand; rerun the script |
| `docs/INSTRUCTIONS.md` | Step-by-step guide for hosts and players |
| `.claude/skills/expert-council/SKILL.md` | Repeatable review skill: asks for an objective, picks 3 project-specific experts, returns a scored verdict and plan. Reports may be saved in `docs/council/` |
| `web/` | Next.js app (see `web/DESIGN.md`) |
| `web/src/lib/engine.ts` | State machine, casting, scoring, override, and the only view projections clients may see |
| `web/src/lib/store.ts` | Storage interface: in-memory locally, DynamoDB on AWS (optimistic locking) |
| `web/src/lib/budget.ts` | Pure cost estimates, tiers, `recommend()` and `fitPlan()` (shared by client and server) |
| `web/src/lib/media-jobs.ts`, `media-runner.ts` | Queues avatar, scene, and video jobs per phase; runner claims one job at a time and enforces the hard spend cap |
| `web/src/lib/media-gen.ts`, `media-store.ts` | Image/video/moderation providers (mock and Bedrock) and photo/art storage (local disk or S3) |
| `web/src/lib/jpeg-strip.ts` | Removes EXIF/GPS and trailing payloads from uploaded JPEGs on the server |
| `docs/RUNBOOK.md` | AWS (SST) deploy, dry run, party-day checklist, rollback |
| `web/src/lib/bots.ts` | AI guests: prompts (own card plus public info only), scripted fallback, chat, story-beat chatter, spend reservation |
| `web/src/lib/ai/speech*.ts` | Speech port and adapters (browser, mock, Polly, Azure, OpenAI-compatible), chosen by `SPEECH_ADAPTER` or `CLOUD_PROVIDER` |
| `web/src/lib/sanitize.ts` | Input clamping for config, plan, and player profile |
| `web/src/lib/gm-ai.ts` | Bedrock case generation with fallback to `sample-case.ts` |
| `web/src/lib/sample-case.ts` | Built-in sample case ("The Last Toast at Gus Pennywhistle's 70th") |
| `web/sst.config.ts` | AWS infrastructure (SST v3): Lambda via OpenNext, DynamoDB with TTL, S3 |
| `dryrun/` | Local sample Vault from a dry run. Git-ignored. Contains spoilers |

## Commands

```bash
cd web
npm install
npm run dev          # http://localhost:3000, in-memory store, sample case
npm run typecheck    # tsc --noEmit
npm run test:smoke   # engine tests: casting, secrecy, phases, override, ballots, reveal
npm run build        # production build
cd .. && ./build-portable.sh   # after editing SKILL.md or references/
```

Local dev needs `web/.env.local` with `AUTH_SECRET` and `ALLOW_DEV_LOGIN=true` (see `web/.env.example`).

## Hard rules for changes

### Secrecy (the core promise)
- Clients must only ever receive data from `publicView`, `playerView`, or `hostView`. Never return a `Room` or `CaseFile` object directly from an API route.
- Truth fields (`killerId`, `truth`, other players' cards, `nudges`, `advanced`) must not appear in any view before the Reveal. `npm run test:smoke` checks this; extend it when adding view fields.
- The Host Override Code is validated server-side only (salted scrypt, 3 failures lock for 10 minutes). Never log, echo, or send it to a model.
- Do not add features that let the host see the solution without the override code.

### Safety and tone (from `SKILL.md`)
- All secrets are fictional. Never base them on real people's lives or relationships.
- Kids' content is G-rated. Kids and toddlers never take part in alcohol mechanics.
- Alcohol is always optional with a substitute (sips only, no shots, water rounds).
- Anyone can say "Pass". The `SAFE` command must always be honored.
- Photos: explicit consent (guardian for under 18), moderation before storage, never served to other players (only generated art is public), 1-day expiry, deletable on request. Never put photo keys in any view.
- Spend: every paid generation must go through `claim()` in `media-runner.ts` so the hard cap and reservation accounting apply. Never call Bedrock image or video APIs directly from a route.
- Player-written text (backstory, hints) and host prompts are untrusted data. Pass them to models as quoted data with instructions not to follow them, and render them as plain text in the UI.

### Style
- **No em dashes** anywhere (code, comments, docs, generated text, prompts). Use commas, colons, parentheses, or separate sentences.
- Match surrounding code: TypeScript strict, small functions, comments only where intent is not obvious.
- If you change `SKILL.md` or `references/`, rerun `./build-portable.sh` and commit the regenerated `PORTABLE_PROMPT.md`.
- Keep the skill and the engine in sync (phases, scoring, override tiers, age groups).

## Git rules

- **Never add AI attribution to commits.** No `Co-Authored-By: Claude` (or any AI) trailers, no "Generated with" lines, no "committed by Claude" text in commit messages, PR descriptions, or file headers.
- Write commit messages in the imperative mood, one short subject line, optional body.
- Do not commit `.env*`, `node_modules`, `.next`, `.sst`, or `dryrun/.vault/`.
- Commit and push only when the user asks.

## Known gaps (good next tasks)

1. The AWS pieces are untested: Bedrock case generation, Nova Canvas/Reel calls (request shapes and prices are from documentation, not a live run), Rekognition, DynamoDB store, S3 store, SST deploy. No credentials were available when written. Prices in `budget.ts` are estimates.
2. Only the join page and big screen were checked in a browser. The host wizard and console were tested through the API only.
3. Per-act AI narration, an "Ask the GM" Hot Seat, and spoken narration on the big screen.
4. Multi-person scene composition quality with Nova Canvas image variation needs real-world tuning.
5. Realtime via IoT Core MQTT (currently polling every 2 seconds).
6. Polly/Transcribe or Nova Sonic voice Game Master.
