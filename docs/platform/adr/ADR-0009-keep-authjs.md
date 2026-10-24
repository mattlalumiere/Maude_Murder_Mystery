# ADR-0009: Keep Auth.js for hosts and per-player tokens for guests

- Status: accepted
- Date: 2026-10-20

## Context

Hosts need identity; guests must join in seconds with no account. A managed identity service (Cognito, Entra, Identity Platform) would reintroduce a cloud dependency.

## Decision

Keep Auth.js for hosts (providers are configuration). Guests get an unguessable per-player token bound to `gameId`. Dev login only when `ALLOW_DEV_LOGIN=true` and never in production.

## Consequences

- No vendor identity lock-in; works locally.
- We own session security hygiene (secret rotation, cookie settings), covered by the W10 security docs.
- Tokens carry `gameId` and cell so players survive a directory outage.
