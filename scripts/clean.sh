#!/usr/bin/env bash
# Remove containers AND volumes (all local games and media). Requires CONFIRM=yes.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export COMPOSE_PROFILES="s3,pg,loadtest"
log "This will delete:"
dc config --volumes | sed 's/^/  volume maude_/'
log "  containers of project 'maude'"
log "The git-ignored $ENV_FILE is kept."
if [ "${CONFIRM:-}" != "yes" ]; then
  log "Nothing deleted. Re-run with: make clean CONFIRM=yes"
  exit 1
fi
dc down --volumes --remove-orphans
log "clean done"
