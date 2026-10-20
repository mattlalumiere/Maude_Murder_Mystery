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
