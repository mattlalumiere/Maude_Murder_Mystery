# deploy/kind

Runs the same Helm chart as the clouds on a one node kind cluster, with `values-local.yaml` (file adapters, sample AI, no secrets, no NetworkPolicy because kind's default CNI does not enforce it).

```
deploy/kind/kind-up.sh          # create, load image maude-web:local, install, port-forward to :3000
deploy/kind/kind-down.sh        # delete the cluster
```

Needs docker (Colima is fine, 3 GB RAM is enough for one node), kind, kubectl and helm. The cluster is not meant to coexist with `make up` on the same ports.
