# Contract tests

`npm run test:contract` runs one parameterised suite per port against every adapter that can run on this machine.

| Adapter | Runs when | Notes |
|---|---|---|
| store memory, file | always | file also runs a 4 process test |
| media file | always | |
| store postgres | `DATABASE_URL` set | otherwise skipped with a console warning |
| media s3 | `S3_ENDPOINT` set | otherwise skipped with a console warning |

## Throwaway postgres

```bash
docker run -d --name mm-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=maude -p 54329:5432 postgres:16-alpine
DATABASE_URL=postgres://postgres:pw@localhost:54329/maude npm run test:contract
docker rm -f mm-pg
```

Migrations run automatically on first use. Tests use random game ids and cells, so reruns need no cleanup.

## Throwaway S3 API

Any S3 API works (MinIO, `adobe/s3mock`, LocalStack, GCS interop). The suite uses a fresh cell prefix per run. Example that was verified:

```bash
docker run -d --name mm-s3 -p 9090:9090 adobe/s3mock:latest
curl -X PUT http://localhost:9090/maude          # create the bucket
S3_ENDPOINT=http://localhost:9090 S3_BUCKET=maude AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=y npm run test:contract
docker rm -f mm-s3
```

With MinIO: `docker run -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio12345 minio/minio server /data`, create the bucket, then use `S3_ENDPOINT=http://localhost:9000` and the same keys as credentials.
