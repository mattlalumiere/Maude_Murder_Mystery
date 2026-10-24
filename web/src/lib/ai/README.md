# AI gateway

Ports (`ports.ts`): `TextModel`, `ImageModel`, `Moderator`, with typed errors `AiTimeoutError`, `AiRateLimitedError`
(upstream 429, `queue_full`, `game_budget`, `global_budget`), `AiBadOutputError`, `AiUnavailableError`
(`network`, `http`, `circuit_open`, `not_configured`).

| File | Role |
|---|---|
| `openai-compatible.ts` | Default adapter. `fetch` to `AI_BASE_URL/chat/completions`, non streaming, body size capped |
| `gateway.ts` | Wraps any `TextModel`: concurrency limit, bounded queue, per game and global budgets, total deadline, retries with full jitter, circuit breaker |
| `config.ts` | Env to config, singleton `getTextModel()`, `getAiStatus()` (the `degraded` flag for the host console) |
| `bedrock-text.ts`, `media.ts` | Legacy AWS adapters (`@deprecated`), same ports |
| `json.ts` | Tolerant JSON extraction (code fences, trailing text, `<think>` blocks, truncation detection) |

Case generation lives in `../gm-ai.ts`: prompt (player text only as quoted JSON data), request, tolerant parse,
`repairCase` + `validateCase` (W4, `../case-validate.ts`), one repair round trip, then the sample case with
`degraded: true` and a reason.

## Environment

Contract variables: `AI_TEXT_ADAPTER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_TIMEOUT_MS` (60000), `AI_MAX_OUTPUT_TOKENS` (4096).
Additional tuning variables (proposed in `docs/platform/feedback/to-W1-from-W5.md`):

| Variable | Default | Meaning |
|---|---|---|
| `AI_CASE_TIMEOUT_MS` | 300000 | Deadline for case generation (about 8k tokens at 40 tokens/s takes minutes) |
| `AI_CASE_MAX_OUTPUT_TOKENS` | 9000 | Output ceiling for the case |
| `AI_MAX_CONCURRENCY` | 2 | Calls in flight (single GPU) |
| `AI_MAX_QUEUE` | 8 | Waiting callers before `queue_full` |
| `AI_MAX_RETRIES` | 1 | Extra attempts for timeouts, 5xx, network errors, 429 |
| `AI_BREAKER_FAILURES` / `AI_BREAKER_COOLDOWN_MS` | 3 / 30000 | Open after N consecutive infrastructure failures, half-open probe after the cooldown |
| `AI_GAME_TOKEN_BUDGET` / `AI_GAME_REQUEST_BUDGET` | 200000 (local profile) / 12 | Per game allowance |
| `AI_GLOBAL_REQUESTS_PER_MIN` / `AI_GLOBAL_TOKENS_PER_MIN` | 120 / 400000 | Process wide, per minute window |

Pricing: `AI_TEXT_ADAPTER=openai-compatible` selects the `local` profile in `budget.ts` (all zero USD, same `claim()` accounting).

## Try it against the real local model

Automated tests never call a real model. To try by hand (server already running, do not start one from tests):

```bash
# 1. is it up, and which model ids does it serve?
curl -s http://127.0.0.1:8080/v1/models | head -c 400

# 2. one tiny completion
curl -s -m 90 http://127.0.0.1:8080/v1/chat/completions -H 'content-type: application/json' \
  -d '{"model":"mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit","messages":[{"role":"user","content":"Reply with the JSON {\"ok\":true} only."}],"max_tokens":20,"stream":false}'

# 3. run the app against it (mlx_lm.server)
cd web
AI_TEXT_ADAPTER=openai-compatible \
AI_BASE_URL=http://127.0.0.1:8080/v1 \
AI_MODEL=mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit \
AI_TIMEOUT_MS=60000 AI_CASE_TIMEOUT_MS=300000 AI_MAX_CONCURRENCY=1 \
ALLOW_DEV_LOGIN=true AUTH_SECRET=dev npm run dev

# Ollama instead
#   AI_BASE_URL=http://127.0.0.1:11434/v1  AI_MODEL=qwen3.8:27b-mlx
# From a container on the Mac use host.docker.internal instead of 127.0.0.1.
```

Start a game with 4 players; the case takes a few minutes on this hardware. If the model dies ("generation thread died")
the breaker opens after 3 failures, the sample case is used and the host console shows the degraded flag
(`getAiStatus()` in `config.ts`).
