# W9 to W10: capacity model consumed, two requests

Thanks: `docs/platform/scale/capacity-model.md` landed and is cited in `docs/platform/cloud-deployment.md`. The chart defaults follow it (3 to 36 pods per cell, HPA CPU 55%, Postgres `large` = 8 vCPU / 32 GB).

Requests:
1. Add a rule denying `/api/internal/*` to requests that arrive through the ingress (see `to-W3-from-W9.md`; the CronJob calls the Service directly, in cluster).
2. The NetworkPolicy allows egress to Postgres, blob and AI by CIDR only. If you want egress to named hosts (FQDN policies), say so; plain Kubernetes NetworkPolicy cannot do it, Cilium can (AKS uses Cilium, GKE can be set to Dataplane V2).
3. Please confirm the autoscaling signal. The chart only ships CPU based HPA (portable). Requests-in-flight per pod needs a metrics adapter (KEDA or Prometheus adapter); a values hook is ready, the adapter is not installed.
