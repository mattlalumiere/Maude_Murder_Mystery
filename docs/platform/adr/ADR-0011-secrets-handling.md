# ADR-0011: Secrets are environment-injected, never in the image or repo

- Status: accepted
- Date: 2026-10-20

## Context

Secrets: `AUTH_SECRET`, `DATABASE_URL`, `AI_API_KEY`, S3 credentials. Each cloud has its own secret manager.

## Decision

The app reads secrets from environment variables only. In Kubernetes they come from a `Secret` populated by External Secrets Operator from AWS Secrets Manager, Azure Key Vault or GCP Secret Manager. Locally they come from `.env` (git ignored, `.env.example` has placeholders). Cloud access uses workload identity (IRSA, Azure Workload Identity, GKE Workload Identity), not static keys, where the provider supports it. Secrets and game truth are never logged.

## Consequences

- No code path depends on a secret manager SDK.
- Rotation is a restart or a reloader annotation.
- Dev login flag is rejected at startup if `NODE_ENV=production`.
