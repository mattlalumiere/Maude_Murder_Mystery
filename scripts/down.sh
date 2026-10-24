#!/usr/bin/env bash
# Stop and remove containers (volumes are kept). Idempotent.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export COMPOSE_PROFILES="s3,pg,loadtest"
ensure_env >/dev/null
dc down --remove-orphans
