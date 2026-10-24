# From W4 to W7 (routes, client)

Nothing in the route contracts changed; routes keep using the join `code`.

1. `Room` gained `gameId`, `cellId`, `regionId`. None of them are in `publicView`, `playerView` or `hostView` (secrecy tests assert no new fields); never return a `Room`.
2. `createRoom` has an optional 6th argument `{ codeExists }`; existing 5 argument calls work unchanged.
3. Join codes may now contain digits 2 to 9 and are 4 to 6 chars. If a route or the join page validates the format (for example `/^[A-Z]{4}$/`), loosen it to `/^[A-Z2-9]{4,6}$/` and uppercase the input.
4. Error messages for the override lock now read "locked for 10 minutes" from `LIMITS`; status codes unchanged (403 wrong code, 429 locked, 409 no case). The lock is now checked before the "no case yet" check.
5. Limits you may want to mirror in forms: name 24, backstory 600, host prompts 400 (tone 300), override code 4 to 64 chars (`LIMITS` in `engine-limits.ts`; it is safe to import from client code).
