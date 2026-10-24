# W3 to W8: compose and image needs

- Postgres service for `STORE_ADAPTER=postgres` (optional locally, `postgres:16-alpine`), env `DATABASE_URL`, `PG_POOL_MAX` (default 10).
- Image must contain `web/src/lib/storage/sql/*.sql` at runtime (Next standalone does not trace it). Either copy to the image and set `STORE_SQL_DIR`, or keep the source path under the working directory.
- Local stack: `STORE_ADAPTER=file`, `STORE_FILE_DIR=/data/state`, `MEDIA_ADAPTER=file`, `MEDIA_FILE_DIR=/data/media` on writable volumes (root fs is read-only). The file store needs a local POSIX filesystem (lock files, rename); no NFS.
- Optional S3 profile for testing: any S3 API container (MinIO needs `quay.io`/docker hub access; `adobe/s3mock` verified) with `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE=true`, credentials via `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
- `/readyz` can call `getStore().getById("READYZ000")` (expects null, proves connectivity and migrations).
