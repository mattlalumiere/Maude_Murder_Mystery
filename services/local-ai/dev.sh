#!/usr/bin/env bash
# Run the local AI services natively (no containers), in mock mode by default. Usage: ./dev.sh start|stop|status|logs
# AI_MODE=models ./dev.sh start   runs the real models (install their requirements first: ./dev.sh models)
set -euo pipefail
cd "$(dirname "$0")"
RUN=.run; VENV=.venv
SERVICES=("tts:8766" "stt:8767" "image:8768" "video:8769")
mkdir -p "$RUN"

venv() {
  [ -x "$VENV/bin/python" ] || uv venv --python 3.12 "$VENV" >/dev/null
  uv pip install -q -p "$VENV/bin/python" -r mcp/requirements.txt $(for s in tts stt image video; do printf -- "-r %s/requirements.txt " "$s"; done)
}

wait_for() { for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$1/healthz" >/dev/null 2>&1 && return 0; sleep 0.5; done; echo "timed out waiting for port $1" >&2; return 1; }

case "${1:-status}" in
  models)
    venv
    for s in tts stt image video; do uv pip install -q -p "$VENV/bin/python" -r "$s/requirements.models.txt" || true; done ;;
  start)
    venv
    for e in "${SERVICES[@]}"; do
      name=${e%%:*}; port=${e##*:}
      AI_MODE="${AI_MODE:-mock}" nohup "$VENV/bin/uvicorn" --app-dir "$name" app:app --host 127.0.0.1 --port "$port" >"$RUN/$name.log" 2>&1 &
      echo $! >"$RUN/$name.pid"
    done
    TTS_URL=http://127.0.0.1:8766 STT_URL=http://127.0.0.1:8767 IMAGE_URL=http://127.0.0.1:8768 VIDEO_URL=http://127.0.0.1:8769 \
      nohup "$VENV/bin/uvicorn" --app-dir mcp server:app --host 127.0.0.1 --port "${MCP_PORT:-8765}" >"$RUN/mcp.log" 2>&1 &
    echo $! >"$RUN/mcp.pid"
    for e in "${SERVICES[@]}"; do wait_for "${e##*:}"; done
    wait_for "${MCP_PORT:-8765}"
    echo "Local AI services up. MCP endpoint: http://127.0.0.1:${MCP_PORT:-8765}/mcp (AI_MODE=${AI_MODE:-mock})" ;;
  stop)
    for f in "$RUN"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
    echo stopped ;;
  logs) tail -n 40 "$RUN"/*.log ;;
  status)
    for p in "${MCP_PORT:-8765}" 8766 8767 8768 8769; do
      if curl -fsS "http://127.0.0.1:$p/healthz" >/dev/null 2>&1; then echo "port $p: up"; else echo "port $p: down"; fi
    done ;;
  *) echo "usage: $0 start|stop|status|logs|models" >&2; exit 2 ;;
esac
