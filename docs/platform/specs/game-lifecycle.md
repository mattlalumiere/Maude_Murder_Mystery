# Game lifecycle walkthrough

A full party from host registration to the Reveal, with who sees what. Companion to `domain.md` (rules) and `api.openapi.yaml` (calls). Typical length 120 minutes; clock times are from `PHASE_INFO`.

## Surfaces

- **Phone**: a player, authenticated by id and token. Sees `playerView`.
- **Host console**: the signed-in host (phone or laptop). Sees `hostView`.
- **Big screen**: the TV, no credentials. Sees `publicView`.

## Walkthrough

1. **Host registers.** The host signs in (Google, Apple or Facebook through Auth.js; dev login only locally), opens "New game", and chooses: party name, expected adults, kids and toddlers, length (90, 120 or 150 minutes), spice, whether adults drink, direction prompts (theme, setting, tone, must include, avoid), whether players may write backstories, a spend cap (USD) and a media plan. The wizard recommends the best plan the cap affords. The host sets a Host Override Code (at least 4 characters) that only the host knows.
2. **Game created.** The server issues a short join code (4 letters) and an internal `gameId` the host never sees. The host console shows the code, a join link and a QR. The big screen shows the same QR.
3. **Players join (lobby).** Each guest opens the link or types the code, enters a name (1 to 24 characters, unique), picks an age group, optionally asks to be the victim, optionally writes a backstory or hint (600 characters), and optionally adds a photo with consent (guardian consent for anyone under 18). They receive a private token held in their browser. A host can add players who have no device. The lobby shows names only.
4. **Start.** With at least 4 players including 2 adults the host presses Start. The server asks the text model for a case from the host's direction and the roster (counts and ages, backstory text as quoted data). If the model is down, slow or returns invalid output, the built-in sample case is used and the host console says so. Players are cast: the victim role goes to a young volunteer first, the killer to a random adult, everyone else by age fit. Avatar jobs are queued within budget.
5. **Cards (0:00).** Each phone shows only its own character card: story, secret, alibi, what they know, goal, special power. Players press Ready. Nobody (including the host) can read another card.
6. **Act I, the party (0:10).** Mingling prompts. Scene art for the act appears on the big screen if the plan allows. The roster of character names is public.
7. **The Death (0:25).** The victim collapses. The big screen shows the public narration.
8. **Act II, interrogation and clue round 1 (0:30).** Round 1 clues are released to everyone.
9. **Intermission (0:55).**
10. **Act III, the twist and clue round 2 (1:05).** Round 2 clues and the twist are released.
11. **Act IV, showdowns and accusations (1:25).** Ballots open. Each player picks one killer, one method and one motive; they may change it until the host advances. The count of ballots in is public, content is private. Kids can vote; kid characters are never suspects.
12. **The Reveal (1:40).** Ballots close, scores and awards are computed, and the killer, method, motive and story appear on every surface.
13. **After.** The game remains readable until expiry (24 hours by default). The host can export it and delete it. Raw photos are removed no later than the Reveal. Everything is deleted at expiry.

Anytime: the host can pause and resume. Anyone can say "Pass" to skip a prompt, and "SAFE" stops an activity at once. The host can use the Override Code for a NUDGE (hint), ADVANCED (harder hint, forfeits the host's detective award), ACCELERATE (skip to the next phase) or FINAL / FINAL_REVEAL (end the mystery, needs confirmation). Three wrong codes lock overrides for 10 minutes.

## Who sees what, by phase

Legend: `-` nothing, `own` the player's own data only, `yes` visible, `count` number only, `host+code` only after a valid Override Code.

| Item | lobby | cards | act1 | death | act2 | intermission | act3 | act4 | reveal |
|---|---|---|---|---|---|---|---|---|---|
| Join code, party name | yes (all) | yes | yes | yes | yes | yes | yes | yes | yes |
| Player names list | yes (all) | yes | yes | yes | yes | yes | yes | yes | yes |
| Character name, house, tease (roster) | - | yes (all) | yes | yes | yes | yes | yes | yes | yes |
| Own character card | - | own | own | own | own | own | own | own | own |
| Other players' cards | - | - | - | - | - | - | - | - | - (never shown, even at reveal) |
| Public narration for the phase | - | yes | yes | yes | yes | yes | yes | yes | yes |
| Round 1 clues | - | - | - | - | yes (all) | yes | yes | yes | yes |
| Round 2 clues and twist | - | - | - | - | - | - | yes (all) | yes | yes |
| Ballot options | - | - | - | - | - | - | - | yes (all) | - |
| Own ballot | - | - | - | - | - | - | - | own | own |
| Ballots in (count) | - | - | - | - | - | - | - | count (all) | count |
| Others' ballots | - | - | - | - | - | - | - | - | - (scores only) |
| Killer, method, motive, true story | - | - | - | - | - | - | - | host+code | yes (all) |
| Scores and awards | - | - | - | - | - | - | - | - | yes (all) |
| Nudge and advanced hints | - | - | - | - | host+code | host+code | host+code | host+code | - |
| Generated art (public) | - | avatars | scene | scene | scene | - | scene | scene | scene, clip |
| Raw player photo | own | own | - | - | - | - | - | - | - (deleted by reveal) |
| Budget, spend, job list | host | host | host | host | host | host | host | host | host |
| Override lock state | host | host | host | host | host | host | host | host | host |
| Case source (AI or sample) | host | host | host | host | host | host | host | host | host |
| Tokens, override hash, internal `gameId`, storage keys | - | - | - | - | - | - | - | - | - |

Notes:
- The victim's player sees their ghost card like any other card; the victim's character is public once cast (a death needs a name).
- The killer's own card says they are the killer. This is the one card that contains truth, and it is private to that player. It is not "truth in a view" for anyone else.
- At the Reveal everyone sees the same reveal block; no new private data appears.
- The big screen never receives a cookie or token, so anything on it is by definition public.

## Failure paths a host will meet

| Situation | Behaviour |
|---|---|
| Text model down or slow | Sample case used; host console shows "sample case in use"; game unaffected |
| Image model down or budget exhausted | Jobs marked failed or skipped; text game continues; no retry beyond the budgeted retries |
| Late joiner after Start | Refused with a friendly message; host can add a device-less player only in the lobby |
| Phone sleeps or loses signal | Reopen the link; token in browser restores the player; last state shown while retrying |
| Wrong override code x3 | Locked for 10 minutes, game continues normally |
| Two hosts click at once | One write wins by version check, the other retries; no corrupted state |
