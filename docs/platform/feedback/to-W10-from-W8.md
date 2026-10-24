# W8 to W10 (cc W7): dev login is impossible inside the container

`web/src/auth.ts` enables the dev provider only when `ALLOW_DEV_LOGIN === "true" && NODE_ENV !== "production"`.
The container image runs `next start`, where Next inlines `NODE_ENV=production`, so `ALLOW_DEV_LOGIN=true` in
`deploy/local/docker-compose.yml` has no effect: `/api/auth/session` stays `null`, hosts cannot sign in, `make seed`
fails, and `make up` cannot satisfy the contract's definition of done (a host creates a game in containers).

Verified: `curl /api/auth/callback/dev` returns no session in the running local stack.

Suggested change (owner of `web/src/auth.ts`, apparently W10 or W7): replace the NODE_ENV test with one helper

```ts
// dev login is allowed only with the explicit flag AND a local cell, never on a real region
export const devLoginEnabled = () =>
  process.env.ALLOW_DEV_LOGIN === "true" && (process.env.REGION_ID ?? "local") === "local";
```

and use it for both `providers` and `providerIds`. Helm values for cloud must never set `REGION_ID=local`
(W9 should add a chart test). Add a security test that `devLoginEnabled()` is false for `REGION_ID=eu-west-1`.

Related: the joins URLs are built from `location.origin` (see W7 note: `to-W7-from-W8.md`).
