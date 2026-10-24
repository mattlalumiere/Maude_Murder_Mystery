#!/usr/bin/env bash
# Create a one node kind cluster, load the local image, install the chart, port-forward.
# Usage: deploy/kind/kind-up.sh [--no-forward]      Tear down: deploy/kind/kind-down.sh
# Env: IMAGE (default maude-web:local), CLUSTER (default maude), LOCAL_PORT (default 3000)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chart="$here/../helm/maude"
IMAGE="${IMAGE:-maude-web:local}"
CLUSTER="${CLUSTER:-maude}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
NS=maude-local-0

docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image $IMAGE not found. Build it first (make build or docker build -f web/Dockerfile web -t $IMAGE)." >&2; exit 1; }

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  kind create cluster --config "$here/kind-config.yaml" --name "$CLUSTER" --wait 120s
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

kind load docker-image "$IMAGE" --name "$CLUSTER"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
repo="${IMAGE%:*}"; tag="${IMAGE##*:}"
helm upgrade --install maude "$chart" --namespace "$NS" \
  -f "$chart/values-local.yaml" \
  --set image.repository="$repo" --set image.tag="$tag" --set image.pullPolicy=Never \
  --wait --timeout 180s

echo "Installed. Open http://localhost:$LOCAL_PORT"
if [ "${1:-}" != "--no-forward" ]; then
  exec kubectl -n "$NS" port-forward svc/maude "$LOCAL_PORT:80"
fi
