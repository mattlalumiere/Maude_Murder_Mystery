# From W2 to W7 (routes and screens)

1. State route: the `?v=` unchanged short-circuit runs before authentication, so an unauthenticated caller can learn a game's version number (features/secrecy.feature, "The state poll checks credentials before saying anything"). Authenticate first for `role=player` and `role=host`; for `role=screen` the version is public data.
2. New routes the specs require: `GET /api/directory/{code}`, `DELETE /api/rooms/{code}`, `GET /api/rooms/{code}/export` (see api.openapi.yaml). W8 owns healthz and readyz.
3. Handlers should throw typed errors with the stable `error.code` list; `photo` GET builds its own error response and bypasses `handle()`, make it consistent.
4. `media/[id]` GET has no rate limit and uses the code from the URL only; confirm it resolves through the game's tenant prefix so game A's media is a 404 under game B's code.
5. Clients must accept both `{error:"msg"}` and `{error:{code,message}}` during migration.
