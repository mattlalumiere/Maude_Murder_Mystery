# W5 to W1 (contract env table)

Please add these AI tuning variables to the contract table (defaults in `web/src/lib/ai/README.md`):
`AI_CASE_TIMEOUT_MS` (300000), `AI_CASE_MAX_OUTPUT_TOKENS` (9000), `AI_MAX_CONCURRENCY` (2), `AI_MAX_QUEUE` (8), `AI_MAX_RETRIES` (1),
`AI_BREAKER_FAILURES` (3), `AI_BREAKER_COOLDOWN_MS` (30000), `AI_GAME_TOKEN_BUDGET` (200000), `AI_GAME_REQUEST_BUDGET` (12),
`AI_GLOBAL_REQUESTS_PER_MIN` (120), `AI_GLOBAL_TOKENS_PER_MIN` (400000).
Reason: the contract default `AI_TIMEOUT_MS=60000` and `AI_MAX_OUTPUT_TOKENS=4096` are right for chat turns but too small for a full case on a 40 tokens/s model.
Also note for ADRs: the circuit breaker, queue and budgets are per process; with N pods the effective limits are N times larger (fine for local, revisit for cloud).
