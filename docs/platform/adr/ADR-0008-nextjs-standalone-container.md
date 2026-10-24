# ADR-0008: Next.js standalone output in one container image

- Status: accepted
- Date: 2026-10-20

## Context

The app currently deploys to Lambda through OpenNext. Kubernetes needs a normal container.

## Decision

Set `output: "standalone"` and build one multi-stage image `maude-web`: non-root user, read-only root filesystem (writable tmp and data volumes only), `/api/healthz` (liveness) and `/api/readyz` (readiness, checks store). Same image on every cloud and locally. Configuration only through environment variables.

## Consequences

- Small image, fast starts, no per cloud build.
- Cold start is irrelevant (long running pods).
- OpenNext/SST path stays legacy ([ADR-0013](ADR-0013-legacy-aws-deprecation.md)).
