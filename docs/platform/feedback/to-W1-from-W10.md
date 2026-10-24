# W10 to W1 (architecture, contract env table)

Please add to the CONTRACT environment table (W10 code reads them in `web/src/middleware.ts`):

| Variable | Values | Default |
|---|---|---|
| `RATE_LIMIT` | `on`, `off` | `on` |
| `TRUSTED_PROXY_HOPS` | integer, number of trusted reverse proxies in front of the app | 1 |
| `ENABLE_HSTS` | `true`, `false`; set `true` only when TLS is terminated in front of the app | `false` |

Also: please link `docs/platform/security/*` and `docs/platform/scale/*` from `docs/platform/README.md`. Join code length is proposed as 6 (`LIMITS.joinCodeLength`), the CONTRACT says 4 to 6; I recommend fixing it at 6 (see tenancy.md).
