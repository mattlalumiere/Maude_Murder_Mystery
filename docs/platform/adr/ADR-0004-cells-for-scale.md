# ADR-0004: Scale with cells, not bigger stores

- Status: accepted
- Date: 2026-10-20

## Context

Target is 10,000+ concurrent games with strict isolation. Games are independent of each other; there is no cross-game query in any request path.

## Decision

A cell is web pods plus a state store plus a bucket prefix, serving about 2,000 active games. A game lives in one cell for life. Keys are `{cell}/games/{gameId}/{kind}/{name}`. A directory maps the join code to `gameId` and cell. Scale out by adding cells.

## Consequences

- Blast radius is one cell. Capacity is linear and testable (the `scale` project simulates one cell and extrapolates).
- No cross-game queries, no global tables except the directory.
- Placement logic and a cell registry are needed (small).
- No live migration between cells in this iteration; cells drain by TTL.
