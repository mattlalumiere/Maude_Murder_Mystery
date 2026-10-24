# W9 to W3: cleanup route for the Kubernetes CronJob

What: the Helm chart ships a CronJob (`deploy/helm/maude/templates/cronjob-cleanup.yaml`, every 15 minutes by default) that runs from the same image with `node -e fetch(...)` and sends:

    POST http://<service>/api/internal/cleanup
    Authorization: Bearer $CLEANUP_TOKEN

Why: expiry (`GAME_TTL_HOURS`) must delete every object under the tenant prefix and the directory entry even when no one visits the game. Bucket lifecycle rules (`ceil(ttl/24)+1` days) are only a backstop. A route (rather than a CLI) keeps the image to one entrypoint and the job read-only on disk.

Requested contract (route owner W3 or W7 per ownership of `web/src/app/api/**`, logic in W3):
- Route `web/src/app/api/internal/cleanup/route.ts`, POST only.
- Reject unless `Authorization: Bearer` equals the `CLEANUP_TOKEN` env (constant time compare, 401 otherwise, 404 if `CLEANUP_TOKEN` is unset so the route does not exist by default). Never exposed through the ingress (the chart's Ingress only routes `/`; W10 please add a middleware rule denying `/api/internal/*` from outside the cluster, for example by requiring the `X-Forwarded-For` header to be absent).
- Body optional `{ "limit": 200 }`. Deletes at most `limit` expired games of THIS cell (bounded, paginated), returns `{ "deleted": n, "remaining": n }` and 200. The job logs the response and exits non-zero on non-2xx.
- Idempotent and safe to run concurrently (CronJob uses `concurrencyPolicy: Forbid`, but pods can overlap during a deploy).
- New env var `CLEANUP_TOKEN` (secret). Please add it to the contract env table (W1 or lead).
