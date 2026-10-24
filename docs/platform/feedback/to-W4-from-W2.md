# From W2 to W4 (engine, types, sanitize)

Spec vs code gaps found while writing specs/domain.md and the features. Target behaviour is what the features assert.

1. `Room` needs `gameId` (ULID, from `ids.ts`); `code` becomes directory-only. See domain.md section 2.
2. Override lock is only checked when `room.case` exists; the lock check should come first and error codes should be stable (`OVERRIDE_DENIED` 403, `OVERRIDE_LOCKED` 429). Token and override comparisons: token uses `!==`, use `timingSafeEqual`.
3. `kick` works in any phase and leaves the character orphaned; restrict to lobby.
4. `setPhoto` treats every non-adult as needing `guardian`; spec says under 18, so teen and kid and little all need it (same result today, keep).
5. Photos are not purged at the Reveal transition (features/reveal.feature, photo-consent.feature); add to `setPhase("reveal")` through the media store.
6. `caseSource` is `"sample" | "bedrock"`; target `"sample" | "ai"` (host view). Keep `bedrock` as legacy alias.
7. "Little" players: spec requires never victim (true today) and never on the ballot (`suspectList` excludes `kid` characters, but a little cast as a non-kid `generic` character is possible only for adults, ok). Please add a test.
8. Error shape: spec moves to `{error:{code,message,requestId}}`; stable codes listed in api.openapi.yaml `Error.code`.
9. Scoring awards: "Detective of the Night" is by top score; the advanced-hint message says the host forfeits it though the host is not a player. Cosmetic; clarify or drop the award text.
10. Game-over: advance past reveal returns 409 with a message; give it `WRONG_PHASE`.
