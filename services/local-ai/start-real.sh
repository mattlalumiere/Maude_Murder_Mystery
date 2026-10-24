#!/usr/bin/env bash
# Start the local AI services natively with REAL models (Piper voices, faster-whisper, sd-turbo on the GPU via MPS,
# ffmpeg video) and chat through an OpenAI-compatible server (default: the mlx_lm server on :8080).
# First run downloads models: ./dev.sh models, then tests/warm.py to pre-fetch voices and the diffusion model.
set -euo pipefail
cd "$(dirname "$0")"
./dev.sh stop >/dev/null 2>&1 || true
AI_MODE=models CHAT_MODE=llm \
  LLM_BASE_URL="${LLM_BASE_URL:-http://127.0.0.1:8080/v1}" \
  LLM_MODEL="${LLM_MODEL:-mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit}" \
  ./dev.sh start
