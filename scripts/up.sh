#!/usr/bin/env bash
# Start the local stack. PROFILE=s3,pg,loadtest optional. BUILD=0 skips the image build.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
command -v docker >/dev/null || die "docker not found (brew install docker docker-compose colima)"
docker info >/dev/null 2>&1 || die "docker daemon unreachable. Run: colima start --cpu 2 --memory 3 --disk 40"
ensure_env
wire_profiles
if [ "${BUILD:-1}" = "1" ]; then dc build web; fi
dc up -d --remove-orphans
log "waiting for $BASE_URL/api/readyz ..."
if wait_ready 60; then
  curl -fsS "$BASE_URL/api/readyz"; echo
  ip="$(lan_ip)"
  log "up: $BASE_URL"
  [ -n "$ip" ] && log "phones on the same Wi-Fi: http://$ip:$WEB_PORT (open the host console from this URL so QR codes work)"
else
  log "not ready after 120s. Recent logs:"; dc logs --tail 40 web || true
  exit 1
fi
