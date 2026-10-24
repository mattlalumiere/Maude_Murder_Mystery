#!/usr/bin/env bash
# Send a tiny prompt to the AI endpoint and print latency.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
URL="${AI_BASE_URL:-$(env_get AI_BASE_URL)}"; URL="${URL:-http://127.0.0.1:8080/v1}"
URL="${URL//host.docker.internal/127.0.0.1}"
MODEL="${AI_MODEL:-$(env_get AI_MODEL)}"; MODEL="${MODEL:-mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit}"
AUTH=(); KEY="${AI_API_KEY:-$(env_get AI_API_KEY)}"; [ -n "$KEY" ] && AUTH=(-H "Authorization: Bearer $KEY")
log "endpoint $URL model $MODEL"
body="$(printf '{"model":"%s","max_tokens":16,"temperature":0,"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' "$MODEL")"
out="$(curl -sS -m 120 -w '\n%{time_total}' "${AUTH[@]+"${AUTH[@]}"}" -H 'Content-Type: application/json' -d "$body" "$URL/chat/completions")" \
  || die "request failed. Is the AI server running? (local-llm/serve-author.sh)"
t="$(printf '%s' "$out" | tail -n1)"; resp="$(printf '%s' "$out" | sed '$d')"
printf '%s\n' "$resp" | head -c 600; echo
log "latency: ${t}s"
