#!/usr/bin/env bash
# Shared helpers. Source, do not execute.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/deploy/local"
COMPOSE_FILE="$LOCAL_DIR/docker-compose.yml"
ENV_FILE="$LOCAL_DIR/.env"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Read KEY from deploy/local/.env (empty if missing).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true
}

WEB_PORT="${WEB_PORT:-$(env_get WEB_PORT)}"; WEB_PORT="${WEB_PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:$WEB_PORT}"

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true; }

# Create deploy/local/.env with a fresh AUTH_SECRET if missing; fill an empty AUTH_SECRET.
ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$LOCAL_DIR/.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "created $ENV_FILE"
  fi
  if ! grep -qE '^AUTH_SECRET=.+' "$ENV_FILE"; then
    local secret
    secret="$(openssl rand -base64 32 | tr -d '\n')"
    if grep -qE '^AUTH_SECRET=' "$ENV_FILE"; then
      # base64 has no '|' so it is a safe sed delimiter
      sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=$secret|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    else
      printf 'AUTH_SECRET=%s\n' "$secret" >> "$ENV_FILE"
    fi
    log "generated AUTH_SECRET in $ENV_FILE"
  fi
}

# Profile wiring: PROFILE is a comma list of s3,pg,loadtest.
# Exports adapter env that compose interpolates, and sets COMPOSE_PROFILES.
wire_profiles() {
  local p="${PROFILE:-}"
  export COMPOSE_PROFILES="$p"
  case ",$p," in
    *,s3,*)
      export MEDIA_ADAPTER=s3 S3_ENDPOINT=http://objectstore:9000 S3_REGION=us-east-1 \
             S3_BUCKET="${S3_BUCKET:-maude-media}" S3_FORCE_PATH_STYLE=true \
             S3_ACCESS_KEY="${S3_ACCESS_KEY:-$(env_get S3_ACCESS_KEY)}"
      S3_ACCESS_KEY="${S3_ACCESS_KEY:-minio-local}"
      export S3_ACCESS_KEY S3_SECRET_KEY="${S3_SECRET_KEY:-$(env_get S3_SECRET_KEY)}"
      export S3_SECRET_KEY="${S3_SECRET_KEY:-minio-local-secret}" ;;
  esac
  case ",$p," in
    *,pg,*)
      export STORE_ADAPTER=postgres
      export DATABASE_URL="postgres://maude:${PG_PASSWORD:-$(env_get PG_PASSWORD)}@postgres:5432/maude"
      [ -n "${PG_PASSWORD:-$(env_get PG_PASSWORD)}" ] || export DATABASE_URL="postgres://maude:maude-local@postgres:5432/maude" ;;
  esac
}

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

wait_ready() {
  local i
  for i in $(seq 1 "${1:-60}"); do
    if curl -fsS -m 3 "$BASE_URL/api/readyz" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
