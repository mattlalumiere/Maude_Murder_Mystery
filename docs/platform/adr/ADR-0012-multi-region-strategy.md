# ADR-0012: Multi-region through active-active cells, game pinned to a region

- Status: accepted
- Date: 2026-10-20

## Context

Players want low latency; we want regional failure isolation without distributed database complexity.

## Decision

Every region runs its own cells and works independently (active-active). A game is created in one region and pinned there for life. The directory entry records the region; the directory is replicated read-mostly per region, written by the creating region. A request landing elsewhere is redirected to the owning region host name. DNS uses latency or geo routing to the nearest region for creation.

## Consequences

- No cross-region state replication of game data, so no conflict resolution.
- A region outage loses that region's live games (hours long, low value); new games go to other regions.
- Code collisions across regions are avoided by reserving codes in the global directory (uniqueness check) or by a region prefix in the code space if directory latency is a problem (open question for W10).
