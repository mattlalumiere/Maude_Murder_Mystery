# W9 to W1: decisions to record as ADRs

1. Bucket per cell and Postgres per cell (default), created with `for_each` over the cell map. Reason: isolation, IAM scoped per cell, deleting a cell is one operation. Cost: more small resources; mitigated by size tiers. A shared bucket with the tenant key prefix remains possible.
2. GKE Standard (regional) rather than Autopilot, noted in `deploy/tofu/modules/kubernetes/gcp/main.tf`. Reason: same node-level behaviour, NetworkPolicy and topology spread as EKS and AKS. Autopilot can replace the module without interface change.
3. Traefik as the ingress controller on every cloud (class `traefik`), installed by `deploy/tofu/cells/modules/addons`, instead of cloud specific ingress controllers. Reason: portability and ingress-nginx retirement. Cloud load balancers still front it. Changing it is a values change.
4. Global routing is the only module with cloud specific traffic services (`deploy/tofu/modules/global_routing`): Route 53, Traffic Manager, Cloud DNS. DNS level only, no proxy.
5. Azure Blob is not S3 compatible: until the `azureblob` adapter exists, the Azure env needs an S3 gateway. Listed as an open gap in the portability matrix please.
6. New env var `CLEANUP_TOKEN` (see `to-W3-from-W9.md`).
