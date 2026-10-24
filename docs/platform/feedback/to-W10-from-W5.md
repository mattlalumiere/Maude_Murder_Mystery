# W5 to W10

Per game AI quotas (`AI_GAME_TOKEN_BUDGET`, `AI_GAME_REQUEST_BUDGET`) are read in `web/src/lib/ai/config.ts` with local defaults. When your config module exists, point `readAiConfig` at it (small change, W5 will do it on request).
Per game counters live in a bounded LRU (10,000 games per process); eviction resets a game's allowance, which only matters beyond that count.
