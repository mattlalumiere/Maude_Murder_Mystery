# Murder Mystery Night: web app design (iteration 1)

Goal: a room-code web app where a server, not a chat, holds the secrets. Phones show private cards; a TV/laptop shows the shared scene; the host drives the night. The rules and content come from `../SKILL.md` and `../references/`.

## Principles
1. **The server is the Vault.** Killer, method, motive and every card live server-side. Each client only ever receives its own projection (`publicView`, `playerView`, `hostView` in `src/lib/engine.ts`). Truth is added to the view only at the Reveal.
2. **A plain state machine is the referee.** Phases, timers, ballots, scoring and the Host Override Code are deterministic code. The AI writes the case and narrates, but never owns state or checks the override code.
3. **Guests don't need accounts.** Kids and grandparents join with a 4-letter room code + a name. OAuth (Google / Apple / Facebook via Auth.js) is for **hosts** only.
4. **Local first, AWS second.** Everything runs on a laptop with an in-memory store and a built-in sample case. AWS services are swapped in by environment variables.
5. **Cheap by default.** Scale-to-zero everything; room data expires on its own.

## AWS architecture (cheapest viable)

| Concern | Service | Why |
|---|---|---|
| Next.js hosting | **SST v3 (OpenNext)** -> Lambda + CloudFront + S3 | Scales to zero; pennies per party |
| Room state | **DynamoDB on-demand**, 1 item per room, TTL 24h | Conditional writes give safe concurrency; TTL auto-deletes (privacy); free tier covers it. S3-only state was considered: S3 now has conditional writes, but DynamoDB is simpler and just as cheap |
| Images / audio | **S3** with 1-day lifecycle expiry | Uploaded photos and generated art vanish automatically |
| Realtime | **Polling** every 2s with a version check (a no-change response is ~100 bytes) | ~30 players x 2h is about 100k tiny requests, around 2 cents. Upgrade path: IoT Core MQTT over WebSockets |
| Auth | **Auth.js** (JWT sessions) with Google, Apple, Facebook | No user table or Cognito bill |
| Case + narration | **Bedrock Converse** (Claude) | Structured JSON case; per-act narration |
| Photo -> cartoon avatar | **Bedrock Nova Canvas** (image variation), after **Rekognition** moderation | Stylizing is safer than realistic generation |
| Voice | Browser Web Speech first; **Polly** (TTS) / **Transcribe** (STT) / **Nova Sonic** (realtime) later | Free first, upgrade later |

Rough cost for one 20-person party: well under $1 with AI text only, a few dollars if every player gets generated art.

## Data model (one DynamoDB item per room)
`pk = code`, `ttl`, `version` (optimistic lock), `data` (JSON). See `src/lib/types.ts`.

## Security notes
- Player auth is an unguessable per-player token held in the browser (sent as headers), checked on every call.
- The Host Override Code is salted scrypt; 3 failures lock overrides for 10 minutes. It is typed in the host console, never given to the AI.
- Children's photos: parent/host consent checkbox, moderation before use, no storage beyond the 1-day lifecycle, never used for training or sent to third parties other than Bedrock in the same account.
- Apple sign-in needs a paid Apple developer account; Facebook needs app review for production. Google works immediately. A dev-only credentials login is enabled outside production.

## Phases / roadmap
1. **(this iteration)** Rooms, join by code, casting, private cards, big screen, clue releases, ballots, scoring, reveal, Host Override tiers, sample case, Bedrock case-generation hook, SST infra.
2. Per-act AI narration, "Ask the GM" Hot Seat, Web Speech narration on the big screen.
3. Photo upload, moderation, cartoon avatars, victim and evidence scenes.
4. Polly/Transcribe voice GM; IoT Core realtime; saved games per host.

## Registration, player builder, and AI media (iteration 2)

**Flow.** Host signs in (`/login`), registers the game (`/host/new`: direction prompts, budget and media plan, override code), then shares `/join/CODE` (link and QR on the big screen). Players build characters there: name, age group, backstory mode (GM's pick, a hint, or their own text), optional photo with consent.

**Direction prompts.** `GameConfig` holds theme, setting, tone, spice, drinking, must-include, avoid, and length. Blank fields are sent to the model as "GM's pick". Without Bedrock the built-in sample case is used and the host console says so.

**Player input.** Backstory text is clamped to 600 characters, passed to the model as quoted JSON data, and shown on the card as written (own mode) or woven in (hint mode, via `forHandle`).

**Photos.** Client resizes to 768px JPEG; server checks size, JPEG magic bytes, consent, and (on AWS) Rekognition moderation, stores under `CODE/photos/` (1-day lifecycle), and uses them only as reference images for Nova Canvas image variation. They are never in any view or served publicly. Players and the host can delete them.

**Budget.** `budget.ts` prices portraits, scenes, and 6-second clips; `recommend()` names the best tier for a budget and the cost of the next step up; `fitPlan()` trims a plan to a cap. The cap is enforced in `claim()`: a job is skipped if spent plus reserved plus its estimate would exceed the cap. Spend is recorded when a job completes; reservations are released on failure. The host can change the plan or cap live (never below what is spent) or pause AI media.

**Job queue.** Entering an act enqueues scene and video jobs from public narration and public character descriptions only (no truth is used before the reveal). A worker tick, triggered by the host console every few seconds, runs one job at a time. Images are synchronous; video is an async Bedrock invocation polled every 8 seconds. Each stage persists, so it works on Lambda.

**Rough prices (estimates, check AWS):** image 0.04 to 0.06 USD, 6 s video about 0.48 USD, text about 0.40 USD per game. A 16-player game with portraits, one scene per act, and two clips is about 2.5 USD.
