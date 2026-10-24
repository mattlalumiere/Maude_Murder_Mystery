# W3 requests: new environment variables (add to CONTRACT.md tables)

| Variable | Meaning | Default |
|---|---|---|
| `GAME_MAX_BYTES` | max blob bytes per game | 209715200 (200 MiB) |
| `GAME_MAX_BLOB_BYTES` | max bytes per blob | 12582912 (12 MiB) |
| `GAME_MAX_STATE_BYTES` | max serialized Room bytes | 2097152 (2 MiB) |
| `STORE_SQL_DIR` | directory of SQL migrations | `./src/lib/storage/sql` |
| `PG_POOL_MAX` | postgres pool size | 10 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials for `MEDIA_ADAPTER=s3` (standard AWS chain) | unset |

W10 may take over the quota defaults; `web/src/lib/storage/limits.ts` is the single consumer.
