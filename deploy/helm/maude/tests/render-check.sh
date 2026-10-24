#!/usr/bin/env bash
# Renders every values file and asserts key security and portability properties.
# Usage: deploy/helm/maude/tests/render-check.sh
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check() { # name, condition-result
  if [ "$2" = ok ]; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi
}
has() { grep -Eq "$2" <<<"$1" && echo ok || echo no; }
hasnot() { grep -Eq "$2" <<<"$1" && echo no || echo ok; }

for vf in "" values-local.yaml values-aws.yaml values-azure.yaml values-gcp.yaml; do
  echo "== ${vf:-values.yaml}"
  args=(); [ -n "$vf" ] && args=(-f "$here/$vf")
  out="$(helm template maude "$here" ${args[@]+"${args[@]}"} --namespace maude-test)"
  helm lint "$here" ${args[@]+"${args[@]}"} >/dev/null && check "helm lint" ok || check "helm lint" no
  check "runAsNonRoot" "$(has "$out" 'runAsNonRoot: true')"
  check "readOnlyRootFilesystem" "$(has "$out" 'readOnlyRootFilesystem: true')"
  check "allowPrivilegeEscalation false" "$(has "$out" 'allowPrivilegeEscalation: false')"
  check "drop ALL caps" "$(has "$out" 'drop: \["ALL"\]')"
  check "seccomp RuntimeDefault" "$(has "$out" 'type: RuntimeDefault')"
  check "resources requests" "$(has "$out" 'requests:')"
  check "resources memory limit" "$(has "$out" 'limits:')"
  check "readiness probe /api/readyz" "$(has "$out" 'path: /api/readyz')"
  check "liveness probe /api/healthz" "$(has "$out" 'path: /api/healthz')"
  check "no privileged" "$(hasnot "$out" 'privileged: true')"
  check "no secret literals" "$(hasnot "$out" '(password|secret|token|apikey|api_key)[A-Za-z_]*: ["'"'"']?[A-Za-z0-9+/=]{16,}')"
  check "no kind Secret rendered" "$(hasnot "$out" '^kind: Secret$')"
  check "CELL_ID in configmap" "$(has "$out" 'CELL_ID:')"
  if [ "$vf" != values-local.yaml ]; then
    check "NetworkPolicy default deny" "$(has "$out" 'default-deny')"
    check "PodDisruptionBudget" "$(has "$out" 'kind: PodDisruptionBudget')"
    check "HPA" "$(has "$out" 'kind: HorizontalPodAutoscaler')"
    check "topology spread" "$(has "$out" 'topology.kubernetes.io/zone')"
    check "cleanup CronJob" "$(has "$out" 'kind: CronJob')"
    check "no file adapters" "$(hasnot "$out" 'STORE_ADAPTER: "file"')"
  fi
  case "$vf" in
    values-aws.yaml) check "IRSA annotation" "$(has "$out" 'eks.amazonaws.com/role-arn')";;
    values-azure.yaml) check "AKS workload identity" "$(has "$out" 'azure.workload.identity/client-id')";;
    values-gcp.yaml) check "GKE workload identity" "$(has "$out" 'iam.gke.io/gcp-service-account')";;
  esac
done

echo "== externalSecrets mode"
out="$(helm template maude "$here" --set secrets.mode=externalSecrets)"
check "ExternalSecret rendered" "$(has "$out" 'kind: ExternalSecret')"
echo "== priority class"
out="$(helm template maude "$here" --set priorityClass.create=true)"
check "PriorityClass rendered" "$(has "$out" 'kind: PriorityClass')"
check "priorityClassName set" "$(has "$out" 'priorityClassName: maude-web')"

# Em dash ban
if grep -rl $'\xe2\x80\x94' "$here" >/dev/null 2>&1; then echo "  FAIL em dash found"; fail=1; else echo "  ok   no em dashes"; fi
[ $fail = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
