# Expert Council: Launch Readiness (2026-10-23)

**Objective (set by the user):** Launch readiness. Could the owner run a real family murder-mystery party with this today (10-20 adults aged 20-70, 5-10 kids aged 1-15, about 2 hours, phones plus a TV, optional adult drinking, optional AI pictures and video)?
**Constraints:** none stated.
**Evidence base:** the working tree on disk as of this date. HEAD is `01e1d5f`; 74 entries were uncommitted (including a large body of work by other contributors: `web/src/lib/ai`, `security`, `storage`, `middleware.ts`, `deploy/`, `docs/platform/`, Docker files, e2e and BDD tests, a rewritten root README). `npm run test:smoke` passes. `npx tsc --noEmit` fails only in the new `web/test/` files. Nothing has run against real AWS, and only the join page and big screen have been seen in a browser.

## Roster

| Role | Why chosen | Lens |
|---|---|---|
| Family game designer | Audience spans ages 1 to 70+ in one room | Would the night work, and is the mystery fair? |
| Child-safety, privacy, and security officer (skeptic) | Photos of minors flow to AI, and secrecy is the core promise | Try to break secrecy, authz, photos, spend |
| Serverless reliability, cost, and delivery engineer | 15-30 phones polling for 2 hours, AI under a cap | Concurrency, cost, deployability, tests |

## Verdict: NOT YET (average 2.0 of 5)

1. **The text-only game on a laptop likely works; the real launch path was never exercised.** Sign-in, TV, 25 joins, and play from cards to reveal have not been seen end to end, and nothing has touched AWS.
2. **Photos of children are not safe to ship.** Consent is a self-asserted header, there is no server-side metadata stripping, moderation is off by default, retention depends on unverified infrastructure, and no privacy notice exists.
3. **The repo does not describe or reproduce the tested product.** The on-disk README describes a generic microservice, deploy paths contradict each other, and the code that was tested is mixed with 70+ uncommitted changes.

## Scorecard

| Expert | Score | One-line reason |
|---|---|---|
| Family game designer | 2 | Engine and fair sample case exist; host path unrun, docs mislead, rules never reach phones |
| Child-safety and security | 2 | Secrecy and authz core is sound; minors' photo path is unproven and weak |
| Serverless and delivery | 2 | Sample game likely works locally; AWS never ran, case generation probably exceeds the 60 s limit |
| **Average** | **2.0** | First council; no earlier report to compare |

## Where the experts agree

- Secrecy architecture is a real strength (per-player views, token compare, override code with lockout) [security officer, verified in code].
- The sample case is fair, with three clue paths and kid roles that matter [designer].
- The uncommitted state and contradictory docs are a launch blocker for a non-technical host [all three].
- A text-only game with the mock provider and no photos is the only configuration plausibly safe today [security officer, delivery engineer].

## Where they differ (or are unsettled)

- **Can it run today?** The designer says nothing past "cards" has been seen by anyone; the other two assume the sample game works on a laptop because the smoke test passes. The smoke test covers the engine, not phones, the UI, or the host console. A rehearsal would settle it.
- **Deployment direction.** The delivery engineer calls SST/Lambda the only zero-ops internet-reachable path; other contributors' uncommitted work points to containers, Helm, tofu, and an Azure adapter. This needs an owner decision, not more analysis.

## Prioritized plan

### Now (blocks launch)
1. **Reconcile the tree and docs.** Commit or discard the uncommitted work deliberately, restore an accurate README, and choose ONE deployment path with a rehearsed runbook (S to M).
2. **Case generation versus the 60 s Lambda limit.** Make generation asynchronous with a "generating" state and a sample-case fallback under about 50 s (M).
3. **Photos of minors.** Off by default, or host-attested "parent present" with a stored timestamp; server-side metadata stripping; fail-closed moderation; delete on kick and auto-purge at reveal and expiry; a plain-language privacy notice (S to M).
4. **Rehearse end to end.** About 8 people on real phones plus a TV through every phase to the reveal, including late join and a lost tab (M).
5. **Rules card.** Put "Pass", sip-or-substitute, and "Snack or Silly" on phones and the TV at the cards phase (S).

### Next
- Phase timers and a "running late" nudge on host bar and TV; the run sheet currently has no clock.
- 409 "Busy" handling: consistent reads, jittered backoff, friendlier UI retry.
- A media driver that does not depend on the host's tab staying awake; a watchdog for stuck "running" jobs (a regenerated job bills twice but is counted once).
- Content filter or host preview for players' own backstories; late-join attach to a spare character.
- CI (typecheck, unit, smoke), fix the `web/test/` type errors, billing alarms.
- One-page host quick card, tested with a non-technical person.
- Make generated media private (`no-store`, token or host session) and trim the public screen view.

### Later
- A staged run with real Bedrock, Rekognition, and S3 on a small cap, inspecting stored objects and deletes.
- Count text and moderation spend in the ledger; make rate limits and circuit breakers shared rather than per instance.
- A larger sample cast (the sample has 16 characters, so a 25-person room gets filler cards).

## Unverified or untested

- All AWS behavior (Bedrock request shapes, Nova Reel output path, model access, region, throttling, Lambda and CloudFront timeouts).
- Gameplay from act 1 to reveal on phones; readability and tap targets for toddlers' parents and seniors.
- Real AI-generated cases (solvability, tone on kid cards).
- Whether blob delete prefixes match the photo keys and the bucket lifecycle rule.
- Vitest, Cucumber, and Playwright suites: not run; the `test/` files currently fail typecheck.
- Real room-code enumeration speed behind the actual proxy.
- Reported prices are estimates, not checked against the live price list.

## What would change this verdict

- A clean rehearsal on phones through the reveal, plus a committed tree with accurate docs, moves it to about 3.
- Photos of minors resolved and a staged real-AWS dry run (with a deleted-object check) would move it to 4.
- Dropping photos and AI media for the first party, and running the text-only game locally, is a defensible "ready enough" path today for a technical host.

## Appendix: expert highlights

**Family game designer (2/5).** No timers or auto-advance exist, so a 2-hour run sheet will drift (`engine.ts` advance is host-driven). Extra players beyond the 16 sample characters get generic filler cards. Drinking and "Pass" rules reach only the GM prompt, not phones or the TV. Late joiners are blocked once the lobby closes (`addPlayer` throws 409).

**Child-safety, privacy, and security officer (2/5).** The photo route checks only size and JPEG magic bytes (no server-side metadata stripping); moderation returns ok unless `MEDIA_PROVIDER=bedrock`; "guardian" consent is a client-sent header and age is self-declared; kick does not delete photos; generated media is served with `public, immutable` caching to anyone holding a room code. Cost abuse is capped, but any joined player can trigger the media worker and the lobby can be griefed with fake players. Rate limiting, the CSRF check, and the one-day bucket expiry lived only in uncommitted files.

**Serverless reliability, cost, and delivery engineer (2/5).** `startGame` awaits case generation inside the request (timeout 300 s configured versus a 60 s function limit). The optimistic lock is sound in shape, but reads are eventually consistent and retries have no jitter. The budget cap holds for media but excludes text and moderation. Rough costs from the code's own constants: about $1.9 (storybook, 30 players), $2.9 (cinematic), $4.9 (blockbuster), plus infrastructure well under $0.50 for two hours (inferred, not run).

## Remediation log (same day)

Done after the report, with the owner's go-ahead to edit the previously uncommitted files:

| Item | Change | Evidence |
|---|---|---|
| 1. Docs and tree | Root `README.md` restored to the game README; the generic Express/Postgres/Redis README was preserved at `docs/platform/ROOT_APP_README.md`. Added `docs/RUNBOOK.md` (AWS SST path, written, not yet run). Nothing was committed or deleted. | Files on disk |
| 2. Start vs 60 s limit | Start is split when `ASYNC_START=true` (set in `sst.config.ts`): the server claims the room, the host tab calls `/generate`, which falls back to the sample case at the deadline (`GENERATION_DEADLINE_MS`, 25 s on CloudFront by default). Elsewhere Start stays one request. Lobby is locked while writing; a dead claim expires after 90 s. | `scripts/council-fixes.test.ts`; live API run: start, join blocked 409, generate 200 |
| 3. Photos | Server strips EXIF/GPS and trailing payloads; strict JPEG validation; fail closed when moderation fails or (in production) is unavailable; photos of players under 18 off unless `ALLOW_MINOR_PHOTOS=true`; delete on kick; auto-purge once no art job needs them (at reveal, or sooner for avatar-only plans); `/privacy` notice. | Live run: GPS marker present in upload, absent in stored file; 6 security tests flipped from known-defect to passing |
| 4. Rules card | Pass, sip-or-substitute, Snack or Silly (or alcohol-free wording) shown on every phone and the TV at cards and act 1; privacy link in the photo section. | Typecheck; not yet viewed in a browser |
| 5. Rehearsal | Not done. Needs people and phones. | n/a |

Still failing in the existing suites (not caused by this work, as far as can be told): 4 override and body-handling security tests, 4 AI-load scale tests, 4 optimistic-lock conflict tests (the "Busy" risk above), 2 readiness-probe tests. The 8-person rehearsal and a real AWS dry run remain the gates to a higher score.
