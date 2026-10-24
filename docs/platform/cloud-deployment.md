# Cloud deployment guide

Owner: W9. Covers EKS (AWS), AKS (Azure), GKE (GCP) and kind (local). The same container image (`maude-web`) and the same Helm chart (`deploy/helm/maude`) run on all four. OpenTofu (`deploy/tofu`) builds the cloud pieces. Nothing here has been applied: see section 12 for what is and is not verified.

## 1. Layout

| Path | What |
|---|---|
| `deploy/helm/maude` | Chart: Deployment, Service, Ingress, HPA, PDB, NetworkPolicy, ServiceAccount, ConfigMap, ExternalSecret, cleanup CronJob, optional PriorityClass. Values: `values.yaml`, `values-local.yaml`, `values-aws.yaml`, `values-azure.yaml`, `values-gcp.yaml` |
| `deploy/helm/maude/tests/render-check.sh` | Renders every values file with `helm template`, runs `helm lint` and asserts security properties |
| `deploy/tofu/modules/<concern>/{aws,azure,gcp}` | network, kubernetes, object_storage, postgres, registry, secrets, dns_certs, observability, global_routing. Interfaces are in each concern's `README.md` |
| `deploy/tofu/cells` | `modules/cell` (namespace + release), `modules/addons` (ingress, cert-manager, external-secrets), `region` (for_each over cells), `README.md` |
| `deploy/tofu/envs/{aws,azure,gcp,local-kind}` | Composition roots with `example.tfvars` |
| `deploy/tofu/validate-all.sh` | `init -backend=false`, `validate`, `fmt -check` in all 34 directories |
| `deploy/kind` | One node kind cluster, `kind-up.sh` and `kind-down.sh` |

Portability rule: only blob storage, DNS, the managed Kubernetes control plane, managed PostgreSQL, the registry and the secret manager are cloud services, each behind a module interface. Ingress (Traefik), certificates (cert-manager), secrets sync (external-secrets), autoscaling (HPA) and policy (NetworkPolicy) are the same on every cloud.

## 2. Prerequisites

Common: OpenTofu 1.6 or newer, Helm 3.14 or newer, kubectl, docker, a signed-in CLI for the cloud, a domain you control, the `maude-web` image (W8).

| Cloud | CLI and plugins | Permissions for the person applying |
|---|---|---|
| AWS | `aws`, an account, a role able to create VPC, EKS, IAM, RDS, S3, KMS, Route 53, ACM, ECR, Secrets Manager, CloudWatch, SNS | Admin for the first apply, then a scoped deployer role |
| Azure | `az`, `kubelogin`, a subscription, Owner or Contributor + User Access Administrator on it | Needed for role assignments and federated credentials |
| GCP | `gcloud`, `gke-gcloud-auth-plugin`, a project with billing, APIs enabled: compute, container, sqladmin, servicenetworking, secretmanager, artifactregistry, dns, certificatemanager, logging, monitoring, iam | Owner for the first apply |

## 3. Variables

Set in `terraform.tfvars` (copy `envs/<cloud>/example.tfvars`; the file is git ignored). Common to all cloud envs:

| Variable | Meaning |
|---|---|
| `name` | environment prefix for all resources |
| `domain_name`, `create_zone` | DNS zone apex |
| `ttl_hours` | `GAME_TTL_HOURS`, drives bucket lifecycle (`ceil(ttl/24)+1` days) |
| `ai_base_url`, `ai_model` | OpenAI-compatible endpoint reachable from the cluster |
| `cells` | map: cell id to `{image_tag, replicas, max_replicas, hostname}` |
| `database_size` | `small`, `medium`, `large` per cell |
| `node_min`, `node_max`, node size | capacity of the node pool |
| `api_allowed_cidrs` | who may reach the Kubernetes API (set it; empty means open to the internet on AWS) |
| `alert_email` | alert target |
| `chart_path` | defaults to the repo chart |

Per cloud: AWS `region`, `bucket_suffix`; Azure `subscription_id`, `location`, `name_suffix`, `admin_group_object_ids`; GCP `project_id`, `region`, `bucket_suffix`.

## 4. Order of operations (first deployment)

The Kubernetes and Helm providers are configured from the cluster outputs, so the first apply is staged.

1. State backend. Create a private, versioned, encrypted bucket or container (S3, Azure Blob, GCS) by hand or a bootstrap stack, then uncomment the `backend` block in `envs/<cloud>/versions.tf`. State contains the generated database passwords and the initial `DATABASE_URL`, so restrict who can read it.
2. `cd deploy/tofu/envs/<cloud> && tofu init && tofu plan -var-file=terraform.tfvars`. Read the plan.
3. Stage 1: `tofu apply -target=module.network -target=module.kubernetes -target=module.registry -target=module.observability`.
4. Push the image: `docker login` to `tofu output registry_url`, tag `maude-web` as `$(tofu output -raw image_repository):<tag>`, push. Tags are immutable on every registry here.
5. Stage 2: `tofu apply -target=module.addons -target=module.secrets -target=module.postgres -target=module.object_storage` (installs Traefik, cert-manager, external-secrets; creates databases, buckets, secret containers).
6. Create the `ClusterSecretStore` named `maude` (external-secrets cannot be planned before its CRDs exist). Use `tofu output secret_store_config`:
   - AWS: `provider.aws` with `service: SecretsManager`, `region`, `auth.jwt.serviceAccountRef` pointing at `external-secrets/external-secrets`.
   - Azure: `provider.azurekv` with `vaultUrl` from the output, `authType: WorkloadIdentity`, `serviceAccountRef`.
   - GCP: `provider.gcpsm` with `projectID`, `auth.workloadIdentity` (cluster name, location, service account ref).
7. Set the out of band secret values in the cloud secret manager: `<cell>/auth-secret` (random 32+ bytes), `<cell>/ai-api-key` (if the endpoint needs one), `<cell>/cleanup-token` (random). `database-url` was written by OpenTofu. Never put these in tfvars or the chart.
8. Stage 3: `tofu apply` (everything, including the cell releases). The release is `atomic`: a failing cell rolls back.
9. DNS: delegate the domain to `tofu output name_servers`; create a ClusterIssuer named `letsencrypt` for cert-manager (DNS01 solver for the cloud zone, or HTTP01 via Traefik); point each cell `hostname` at the Traefik Service load balancer. External-dns is not installed: create the records by hand or add it.
10. Smoke test: `https://<hostname>/api/healthz` and `/api/readyz` (readyz reports `cell`, `region` and adapters).
11. Multi region: apply global routing (section 6).

## 5. Add a cell

Add a key to `cells` and apply. Each key creates a database (`modules/postgres`), a bucket and a workload identity (`modules/object_storage`), four secret containers (`modules/secrets`), a namespace `maude-<cell>` and a Helm release. Then set the new cell's out of band secrets (step 7) before the release can become ready (apply in two steps, or let the first attempt roll back and rerun). Mark the cell open in the game directory when it is ready. Capacity: one cell is planned for 2,000 active games (CONTRACT).

## 6. Add a region

A region is a separate state: copy the env directory's tfvars to a new workspace or directory, with its own `region` or `location`, `name` and cell ids (cell ids must be globally unique and carry the region, for example `aws-euw1-0`). Apply it with the same stages. Then add the region's Traefik hostname to a global stack that calls `modules/global_routing/<cloud>` once with `endpoints = { region => { target, region, weight } }`. Routing is DNS level and health checked on `/api/readyz`. A game is pinned to the region that created it (ADR-0012); a request that lands elsewhere is redirected to the owning cell's own host name, which therefore must stay stable.

## 7. Roll back and upgrade

- App version: change the cell's `image_tag` (tags are immutable) and apply. Helm `atomic` rolls back automatically on a failed rollout. Manual: `helm -n maude-<cell> rollback maude <revision>`; revision list: `helm history`.
- Roll out progressively: change one cell, watch error rate and p95 for a window, then the rest. The `cells` map makes canarying one key trivial.
- Infrastructure: `tofu plan` shows every change; never edit by hand. To revert, restore the previous commit of the tfvars/modules and apply. Stateful resources (database, bucket) have deletion protection; downgrades of the database engine are not supported, restore from a backup instead.
- Database restore: point-in-time restore creates a new instance. Restore, then change the cell's `DATABASE_URL` secret and restart the pods. Do this per cell.
- Kubernetes upgrades: control plane first (`kubernetes_version`), then node pools (surge 1 on EKS, 33% on AKS, auto-upgrade on GKE). The PDB keeps at least one pod; with 3 zones and topology spread the app stays up.

## 8. Destroy safely

1. Drain the cell: stop placing new games (directory flag), wait for `GAME_TTL_HOURS`.
2. Remove the cell key from `cells` and apply. Databases have `deletion_protection = true` (set `database` deletion protection false first, in a separate reviewed apply). Buckets refuse to delete when not empty unless `force_destroy`; leave it false and let the lifecycle empty them.
3. Never `tofu destroy` a whole env that holds live cells. For a throwaway env: set `deletion_protection=false` and `force_destroy=true` knowingly, run `tofu plan -destroy`, read it, then destroy.
4. Destroy order for a whole env is the reverse of section 4. The helm releases go first; load balancers created by Traefik may need the Service deleted before the network can be removed.
5. Secrets managers keep deleted secrets for a recovery window (7 days) and Key Vault has purge protection: names are unavailable until that passes.
6. Keep the state bucket and the registry until nothing refers to them.

## 9. Tagging and cost defaults

Every resource carries `project=maude`, `environment=<name>`, `managed_by=opentofu`; add `cost_center`, `owner`, `cell` through `tags` if your organisation needs them (cell id is already a Kubernetes label, `maude.io/cell`, so cost tools that read labels can split by cell).

| Default | Why | How to change |
|---|---|---|
| One NAT gateway on AWS | a NAT per AZ costs about three times as much; the trade is a single AZ dependency for egress | `single_nat_gateway = false` |
| S3 gateway endpoint on AWS | blob traffic stays off the NAT gateway | always on, free |
| `database_size = small` | 2 vCPU class, fine for a trial cell. Production cell per the capacity model is `large` (8 vCPU, 32 GB) | variable |
| `high_availability = true` for databases | the failure scenario in the capacity model assumes a standby | set false for dev |
| Autoscaled node pools, HPA 3 to 36 pods | follows the capacity model (24 pods per full cell) | `node_*`, `cells.*.replicas` |
| Log retention 30 days | cost and privacy | `retention_days` |
| Bucket lifecycle `ceil(ttl/24)+1` days | privacy: photos and art must expire | `ttl_hours` |
| ACR Premium, zone redundancy | needed for zone redundancy and private link later | module edit |
| Per-cell database and bucket | isolation over minimum cost; a large number of idle cells is wasteful, remove empty cells | `cells` |

Rough cost drivers per cell: Postgres instance (largest), the nodes that carry about 24 pods, load balancer egress (about 590 Mbit/s at full load, capacity model section 3) and NAT/data transfer. Add a CDN in front of generated art before adding bandwidth.

## 10. Security

### Workload identity and least privilege (sketches)

Pods use short lived federated identities, no static keys. The chart annotates the ServiceAccount; the module creates the cloud identity trusted only for that namespace and service account.

AWS role policy (per cell, created by `modules/object_storage/aws`):
```json
{"Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":"arn:aws:s3:::<bucket>/*"},
 {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<bucket>"},
 {"Effect":"Allow","Action":["kms:Decrypt","kms:GenerateDataKey"],"Resource":"<bucket key arn>"}]}
```
Trust: `sts:AssumeRoleWithWebIdentity` from the cluster OIDC provider, `sub = system:serviceaccount:maude-<cell>:maude`, `aud = sts.amazonaws.com`.

Azure: user assigned identity with `Storage Blob Data Contributor` on the one container, federated credential for the same subject. GCP: service account with `roles/storage.objectAdmin` on the one bucket, `roles/iam.workloadIdentityUser` for the same Kubernetes service account.

The external-secrets operator has its own identity that can only read this environment's secrets (`secretsmanager:GetSecretValue` on listed ARNs, `Key Vault Secrets User` on the one vault, `secretAccessor` per secret).

Pods have `automountServiceAccountToken: false`: they do not talk to the Kubernetes API. Pod Security Admission `restricted` is enforced on every cell namespace.

### Network

Nodes and databases are private. Databases accept 5432 only from the node subnets. The chart's NetworkPolicy denies everything by default, then allows ingress from the ingress controller namespace and egress to DNS, Postgres, the blob endpoint and the AI endpoint (CIDRs set by the env). AKS (Cilium) and GKE (Calico) enforce it; EKS needs the VPC CNI network policy feature or Calico enabled (not enabled by the module, see gaps). Blob and AI egress CIDRs default to `0.0.0.0/0:443` because those endpoints are public IP ranges; tighten with private endpoints or Cilium FQDN policies.

### Secrets flow

1. OpenTofu creates empty secret containers and writes `DATABASE_URL` (generated password; it exists in state).
2. Humans or CI write `auth-secret`, `ai-api-key` and `cleanup-token` into the cloud secret manager.
3. external-secrets reads them with its federated identity and materialises one Kubernetes Secret per cell (`maude-secrets`, owned by the ExternalSecret).
4. The Deployment reads keys from that Secret as environment variables. The chart and values files contain only remote key names, never values (`render-check.sh` greps for literals). Rotation: change the value in the manager, external-secrets refreshes hourly, restart pods (or add a reloader).

### Supply chain (suggestions, not implemented)

- Build once, tag by version, deploy by digest. Registries here already enforce immutable tags and scan on push where supported.
- Generate an SBOM at build (`syft maude-web:<tag> -o spdx-json`) and attach it as an OCI artifact; scan with `grype` or the registry scanner in CI and fail on high severity.
- Sign with keyless cosign (`cosign sign <repo>@<digest>`) in CI; verify at admission with a policy engine (Kyverno `verifyImages` or the Sigstore policy controller). The chart accepts any image reference, so pin `image.repository` to the registry and `image.tag` to a digest.
- Keep base images minimal (the Dockerfile is alpine plus tini, non-root uid 10001) and rebuild weekly.

## 11. Capacity assumptions per cell

From `docs/platform/scale/capacity-model.md` (W10, measured later by the k6 and `scale` runs): a cell serves 2,000 active games hard, 1,600 soft for placement, which at 18 devices per game and a 2 second poll is 18,000 rps. Planned 24 web pods per cell at 50% utilisation, rounded to a multiple of 3 zones; Postgres 8 vCPU / 32 GB with one synchronous replica and a pooler (PgBouncer, not installed by this repo); about 120 connections; egress about 590 Mbit/s. Chart defaults match: 3 to 36 pods, 500m CPU / 512Mi requests, HPA CPU 55%, topology spread over zones, PDB minAvailable 1. A 10,000 game fleet is about 8 cells. AI throughput is not a per cell resource: local models give about 17 case generations per hour per box, so a real fleet needs a cloud or GPU AI endpoint behind a queue (capacity model section 5), set through `ai_base_url`.

Scale signals beyond CPU (requests in flight, event loop lag, AI queue depth) need a metrics adapter such as KEDA; not included.

## 12. What is untested

No cloud account was available. Verified: `tofu init -backend=false`, `validate` and `fmt -check` in all 34 module and env directories; `helm lint` and `helm template` for all five values files plus the ExternalSecret and PriorityClass paths; server-side `kubectl apply --dry-run` of the AWS, Azure and GCP renders against a kind API server; a one node kind install with `values-local.yaml` (pod ready, `/api/healthz` and `/api/readyz` return 200, read only root filesystem and non-root verified live).

Not verified, expect fixes on the first real apply:
- Every cloud resource. `validate` checks schema and references only; quotas, region availability, naming limits, instance class availability (for example `m7g`, `Standard_D2ps_v6`, `db.t4g.medium`) and API ordering are unknown.
- Staged apply order and `-target` usage in section 4, ClusterSecretStore manifests, and the external-secrets/Traefik/cert-manager chart versions (pinned from memory of upstream, not installed).
- IRSA, Azure Workload Identity and GKE Workload Identity token exchange end to end; the preStop and probes under a real load balancer; NetworkPolicy behaviour on each CNI (kind's default CNI does not enforce it; EKS needs the policy feature enabled).
- The `azureblob` adapter does not exist yet, and Azure Blob is not S3 compatible, so `values-azure.yaml` points at an S3 gateway that this repo does not provide. GCS through its S3 interoperability endpoint needs HMAC keys, which are not created by the module.
- The app's `/api/internal/cleanup` route does not exist yet (request in `feedback/to-W3-from-W9.md`); the CronJob will log a 404 until it does. Postgres adapter pooling behaviour behind a pooler is also unverified.
- Global routing (`modules/global_routing`), observability wiring (cluster log shipping is partly left to the cloud agents), and Postgres failover.
- Cost figures are qualitative.
