#!/usr/bin/env bash
# Check the machine is ready. Prints a line per check, exits 1 if any required check fails.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
fail=0
ok()   { printf '  ok    %s\n' "$*"; }
warn() { printf '  warn  %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

AI_URL="$(env_get AI_BASE_URL)"; AI_URL="${AI_BASE_URL:-${AI_URL:-http://127.0.0.1:8080/v1}}"
AI_HOST_URL="${AI_URL//host.docker.internal/127.0.0.1}"
AI_CONT_URL="${AI_URL//127.0.0.1/host.docker.internal}"

if command -v colima >/dev/null; then
  if colima status >/dev/null 2>&1; then ok "colima running ($(colima status 2>&1 | sed -n 's/.*arch: \([a-z0-9_]*\).*/\1/p' | head -1))"; else bad "colima not running: colima start --cpu 2 --memory 3 --disk 40"; fi
else bad "colima missing: brew install colima"; fi
if command -v docker >/dev/null; then
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable ($(docker info --format '{{.MemTotal}}' 2>/dev/null | awk '{printf "%.1f GiB VM", $1/1073741824}'))"
  else bad "docker daemon unreachable (docker context: $(docker context show 2>/dev/null))"; fi
  docker compose version >/dev/null 2>&1 && ok "docker compose v2" || bad "docker compose plugin missing"
else bad "docker missing: brew install docker docker-compose"; fi
if command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] && ok "node $(node -v)" || warn "node $(node -v), 20+ recommended (image uses 22)"
else warn "node missing (only needed for make test)"; fi

if curl -fsS -m 3 "$AI_HOST_URL/models" >/dev/null 2>&1; then ok "AI endpoint reachable on host: $AI_HOST_URL"
else warn "AI endpoint not reachable: $AI_HOST_URL (game falls back to the sample case). Start: local-llm/serve-author.sh"; fi
if docker info >/dev/null 2>&1; then
  if docker run --rm --pull=never alpine:latest wget -q -T 3 -O /dev/null "${AI_CONT_URL}/models" >/dev/null 2>&1; then ok "AI endpoint reachable from a container: $AI_CONT_URL"
  else warn "AI endpoint not reachable from containers (check host.docker.internal; image alpine:latest must be pulled once)"; fi
fi

for p in "$WEB_PORT" 9000 9001 5432; do
  holder="$(lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1}')"
  if [ -n "$holder" ]; then
    if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":$p->"; then ok "port $p used by this stack"; else warn "port $p busy ($holder)"; fi
  else ok "port $p free"; fi
done
ip="$(lan_ip)"; [ -n "$ip" ] && ok "LAN IP $ip (phones: http://$ip:$WEB_PORT)" || warn "no LAN IP found on en0/en1"
mem="$(vm_stat 2>/dev/null | awk '/Pages free|Pages inactive/{s+=$NF} END{printf "%.1f", s*16384/1073741824}')"
[ -n "$mem" ] && log "  info  roughly ${mem} GiB free+inactive RAM on the host"
exit "$fail"
