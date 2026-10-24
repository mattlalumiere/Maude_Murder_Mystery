# ADR-0013: Legacy SST, DynamoDB and Bedrock code is deprecated, not deleted

- Status: accepted
- Date: 2026-10-20

## Context

The repo contains working but untested-in-production AWS code: `web/sst.config.ts`, the DynamoDB store, Bedrock text and media adapters, S3 media store. Deleting it loses reference value and risks regressions.

## Decision

Keep it working, mark it deprecated in code comments and docs, and do not extend it. New code never reads `ROOMS_TABLE`, `MEDIA_BUCKET` or `BEDROCK_MODEL_ID` outside the legacy adapters. Legacy adapters pass the same port contract tests where feasible. Reconsider removal after one release in which the Postgres and openai-compatible paths have run in real use.

## Consequences

- No regression for anyone on the old path.
- Slightly more code to carry; isolated to adapter files and the SST config.
- Selection is by `STORE_ADAPTER=dynamo`, `AI_TEXT_ADAPTER=bedrock`, `MEDIA_PROVIDER=bedrock`.
