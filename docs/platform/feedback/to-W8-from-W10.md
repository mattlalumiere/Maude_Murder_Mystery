# W10 to W8 (local environment, container) and W9 (chart)

1. Pass `RATE_LIMIT`, `TRUSTED_PROXY_HOPS`, `ENABLE_HSTS` through compose and the chart (defaults on, 1, false). Local compose has no proxy: leave `TRUSTED_PROXY_HOPS=1`; the IP then falls back to `unknown` without an `x-forwarded-for` header, which puts every local client in one IP bucket (still generous: 40 state requests per second).
2. `ALLOW_DEV_LOGIN` must never be set in a deployed chart.
3. Pod hardening, NetworkPolicy, scanning, SBOM and signing: see `docs/platform/security/practices.md` sections 10 and 11.
4. `web/next.config.mjs` (W8): consider `async headers()` is NOT needed, `src/middleware.ts` sets them. Do not add a second CSP.
5. `docker compose` fonts: the CSP allows no external origins; fonts must be self-hosted (W6).
6. Image build: `npm ci --ignore-scripts`; exclude the root Express scaffold from the build context.
