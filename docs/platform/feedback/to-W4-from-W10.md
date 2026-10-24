# W10 to W4 (engine)

Limits in code: `@/lib/security/limits` (`LIMITS`, `RATE_LIMITS`); doc `docs/platform/scale/limits.md`. Safe compare: `@/lib/security/safe-compare` (`safeEqual`). Logger: `@/lib/security/logger` (`createLogger`, `redact`).

Values you consume: `maxPlayersPerGame` 40, `maxPlayerNameChars` 24, `maxBackstoryChars` 600, `maxHostPromptChars` 400, `joinCodeLength` 6, `maxActiveGamesPerHost` 3, `maxGamesCreatedPerHostPerDay` 10, `maxJsonBodyBytes` 32768, `maxPhotoBytes` 2097152, `minOverrideCodeChars` 6, `maxFailedOverrides` 3, `overrideLockMinutes` 10, `maxAiSpendUsdPerGame` 50 (currently `money()` allows 500, `sanitize.ts`).

Findings (file:line as first read; search the quoted code if moved):
1. `engine.ts:348` `authPlayer` uses `p.token !== token`; use `safeEqual`. Also `media/run/route.ts:16`.
2. `engine.ts:59` stores the player token in plaintext in the Room. Store `sha256(token)`, compare with `safeEqual`.
3. `engine.ts:28` override code min length 4 and `hashCode` lowercases (`engine.ts:16`). Use 6 and keep case. Also lock per host id, not only per room.
4. `engine.ts:35` room code is 4 chars of 23; at 10,000 live games 3.6% of guesses hit a game. Move to 6 chars of 31.
5. `state/route.ts:11-14` returns `{unchanged:true}` before authenticating host or player; authorise first (screen stays cheap). Return identical 404 for unknown and expired.
6. `action/route.ts:25`, `join/route.ts:9`, `rooms/route.ts:11` cast `req.json()` unvalidated with no size cap, `null` body gives 500. Add a shared `parseJson(req, schema, maxJsonBodyBytes)`.
7. `photo/route.ts:18` reads the whole body before the size check (check `Content-Length` first); `:20` magic bytes only, re-encode to strip EXIF and polyglots; `:12` consent and `ageGroup` are self-declared; `:23-25` blob written before state commit (orphans); `:41` GET leaks `e.message` for unexpected errors (use `handle()`).
8. `sanitize.ts:3-4` keeps `\n` in host prompt fields, enabling prompt section forgery in `gm-ai.ts:46-57`. Collapse newlines in `name`, `themePrompt`, `settingPrompt`, `tonePrompt`, `mustInclude`, `avoid`.
9. `rooms/route.ts` has no per host quota (`maxActiveGamesPerHost`, `maxGamesCreatedPerHostPerDay`).
10. `media/[id]/route.ts:11` `Cache-Control: public`; prefer `private, max-age=3600`.
11. `http.ts:10` `console.error(e)`: use the logger so tokens never reach logs.
12. Add audit events from `docs/platform/security/practices.md` section 9.

Middleware now (W10) adds: security headers, Origin check on non-GET `/api`, per IP and per game token buckets, `x-request-id`. Read the request id from the `x-request-id` request header and include it in logs.
