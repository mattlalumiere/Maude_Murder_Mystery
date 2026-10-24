# deploy/tofu

OpenTofu for the cloud pieces. Nothing here is ever applied by agents. See `docs/platform/cloud-deployment.md` for the guide.

```
modules/<concern>/{aws,azure,gcp}   one implementation per cloud, shared interface (see each README)
cells/modules/cell                  one cell: namespace + Helm release
cells/modules/addons                ingress controller, cert-manager, external-secrets (same on every cloud)
cells/region                        for_each over cells (add a key to add a cell)
envs/{aws,azure,gcp,local-kind}     composition roots (variables, outputs, versions, example.tfvars)
validate-all.sh                     init -backend=false, validate and fmt -check everywhere
```

Concerns: network, kubernetes, object_storage, postgres, registry, secrets, dns_certs, observability, global_routing.
Remote state backends are shown commented in each env `versions.tf`.
