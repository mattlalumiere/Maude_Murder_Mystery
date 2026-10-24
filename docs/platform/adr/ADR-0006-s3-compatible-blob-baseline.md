# ADR-0006: S3-compatible API is the blob baseline

- Status: accepted
- Date: 2026-10-20

## Context

Blobs are photos (short lived, private) and generated art. All clouds offer object storage, with different APIs.

## Decision

`MediaStore` has adapters `file` (local) and `s3`. The `s3` adapter works with AWS S3, MinIO and GCS interoperability by configuring `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`. Azure Blob gets its own `azureblob` adapter, specified but not built now. This is the one place we accept a per cloud adapter.

## Consequences

- No vendor SDK outside the adapter file.
- Lifecycle rules (1 day photo expiry) are also enforced in app code via the tenant prefix, so we do not depend on bucket lifecycle features.
- Azure users can run MinIO in the cluster as an interim.
