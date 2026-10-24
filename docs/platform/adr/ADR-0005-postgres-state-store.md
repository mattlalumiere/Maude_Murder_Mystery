# ADR-0005: Postgres is the portable state store, with a file adapter locally

- Status: accepted
- Date: 2026-10-20

## Context

State today is in memory locally and DynamoDB on AWS. DynamoDB is AWS only.

## Decision

The `Store` port has adapters `memory` (tests), `file` (local, files on a volume), `postgres` (RDS, Azure Database for PostgreSQL, Cloud SQL, or any Postgres). The game document is a JSONB row keyed by `gameId` with an integer `version`; writes are compare and swap (`UPDATE ... WHERE version = $expected`). The directory is a table with a unique code column. One Postgres per cell.

## Alternatives

- DynamoDB, Cosmos, Firestore: three proprietary APIs.
- Redis: fast but durability and cost concerns for game state.
- Per game SQLite files: simple but awkward on shared storage.

## Consequences

- Same SQL everywhere; a managed Postgres exists on all three clouds.
- Expiry is a per cell sweep by `expires_at`, bounded and paginated.
- DynamoDB adapter stays as deprecated legacy ([ADR-0013](ADR-0013-legacy-aws-deprecation.md)).
