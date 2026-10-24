# ADR-0007: Keep polling; SSE is the documented upgrade

- Status: accepted
- Date: 2026-10-20

## Context

Clients need near real time updates (2 seconds is fine for a party game). Choices: polling, Server Sent Events (SSE), websockets.

## Decision

Keep 2 second polling with a cheap version check. Upgrade path: SSE per game, later, if polling cost becomes the bottleneck.

## Reasoning

- Polling is stateless: any pod can answer, no sticky sessions, no connection limits, survives proxies and phone sleep.
- Cost: a full cell of 2,000 games with about 15 devices each is 30,000 devices, so about 15,000 version checks per second at 2 second polling; the version read is a single indexed lookup. The `scale` project measures it.
- Websockets need connection state and a fan-out layer; SSE needs long lived connections but is simpler. Both complicate scale out and are not needed yet.

## Consequences

- Clients back off when hidden or offline and show the last state.
- If we move to SSE, the version check stays as the fallback.
