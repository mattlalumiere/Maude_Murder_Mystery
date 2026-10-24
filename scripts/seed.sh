#!/usr/bin/env bash
# Create a demo game through the API using dev login. Prints the join code and URLs.
# Requires the stack up with ALLOW_DEV_LOGIN=true.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
curl -fsS -m 5 "$BASE_URL/api/healthz" >/dev/null || die "stack not reachable at $BASE_URL (make up)"
csrf="$(curl -fsS -m 10 -c "$JAR" "$BASE_URL/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')"
curl -sS -m 10 -b "$JAR" -c "$JAR" -o /dev/null \
  --data-urlencode "csrfToken=$csrf" --data-urlencode "name=${HOST_NAME:-Demo Host}" --data-urlencode "json=true" \
  "$BASE_URL/api/auth/callback/dev"
sess="$(curl -fsS -m 10 -b "$JAR" "$BASE_URL/api/auth/session")"
case "$sess" in *'"user"'*) ;; *) die "dev login failed (is ALLOW_DEV_LOGIN honoured in production builds? see docs/platform/feedback). session=$sess";; esac
resp="$(curl -fsS -m 60 -b "$JAR" -H 'Content-Type: application/json' \
  -d "{\"overrideCode\":\"${OVERRIDE_CODE:-demo-override-1234}\",\"config\":{}}" "$BASE_URL/api/rooms")"
code="$(printf '%s' "$resp" | sed -E 's/.*"code":"([^"]+)".*/\1/')"
[ -n "$code" ] || die "create failed: $resp"
log "created game code: $code"
log "join:   $BASE_URL/join/$code"
log "screen: $BASE_URL/screen/$code"
log "host:   $BASE_URL/host/$code (sign in as the same dev host name)"
