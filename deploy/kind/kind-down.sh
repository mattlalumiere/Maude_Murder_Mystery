#!/usr/bin/env bash
# Delete the kind cluster (and with it every release and volume in it).
set -euo pipefail
CLUSTER="${CLUSTER:-maude}"
kind delete cluster --name "$CLUSTER"
