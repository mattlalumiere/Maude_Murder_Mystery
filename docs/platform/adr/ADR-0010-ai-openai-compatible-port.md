# ADR-0010: AI text behind an OpenAI-compatible port

- Status: accepted
- Date: 2026-10-20

## Context

Local development uses models on the Mac (mlx_lm server or Ollama). Clouds offer different model APIs. Bedrock is AWS only.

## Decision

`TextModel` has an `openai-compatible` adapter speaking `/v1/chat/completions` (configured by `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`), plus `sample` (no AI) and legacy `bedrock`. `ImageModel` and `Moderator` are separate ports with mock defaults and optional isolated vendor adapters.

All calls go through a gateway: timeout, retry budget, circuit breaker, at most 3 concurrent local requests with queueing, `claim()` for spend (local models priced at zero but still accounted). Model output is untrusted: schema validate, repair once, else fall back to the sample case.

## Consequences

- Any OpenAI-compatible server works (vLLM, Ollama, llama.cpp, hosted APIs).
- Quality varies by model, so validation and fallback are mandatory.
- Safety: untrusted text is quoted data; the Host Override Code never reaches a model.
