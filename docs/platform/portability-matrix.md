# Portability matrix

Goal: no code changes between environments, only configuration and OpenTofu modules. See [architecture.md](architecture.md) and [ADR-0002](adr/ADR-0002-kubernetes-and-helm.md).

| Concern | Local (Colima, compose) | AWS (EKS) | Azure (AKS) | GCP (GKE) | Portable choice | Proprietary escape hatch |
|---|---|---|---|---|---|---|
| Compute | docker compose, or kind | EKS node groups | AKS node pools | GKE Autopilot or standard | Kubernetes Deployment from one Helm chart | None needed |
| Ingress | Published port or ingress-nginx in kind | ingress-nginx behind NLB, or AWS Load Balancer Controller | ingress-nginx behind Azure LB, or AGIC | ingress-nginx behind GCLB, or GKE Gateway | Kubernetes Ingress or Gateway API with ingress-nginx | Cloud LB controllers via annotations in values |
| State | Files on a volume (`file` adapter) | RDS or Aurora PostgreSQL | Azure Database for PostgreSQL | Cloud SQL for PostgreSQL | `Store` port, `postgres` adapter, `DATABASE_URL` | DynamoDB adapter (legacy, deprecated) |
| Blobs | Files on a volume (`file` adapter) | S3 | Azure Blob (adapter `azureblob`) or MinIO | GCS via S3 interoperability, or MinIO | `MediaStore` port, `s3` adapter (endpoint, region, path style are config) | `azureblob` adapter (spec only) |
| Directory | Table in the local store | Table in the regional Postgres, optionally DynamoDB global table later | Table in regional Postgres | Table in regional Postgres | A `Directory` table behind the `Store` port, primary key lookup | Managed global KV if latency demands it |
| Secrets | `.env` file, compose secrets | Secrets Manager via External Secrets Operator | Key Vault via External Secrets Operator | Secret Manager via External Secrets Operator | Kubernetes Secret, populated by External Secrets Operator | Direct cloud CSI drivers |
| Registry | Local docker image, or local registry | ECR | ACR | Artifact Registry | OCI image, pulled by tag or digest | None |
| Logs and metrics | stdout, `docker logs` | stdout to CloudWatch or Loki, Prometheus | stdout to Azure Monitor or Loki, Prometheus | stdout to Cloud Logging or Loki, Prometheus | JSON logs on stdout, Prometheus `/metrics`, OpenTelemetry later | Cloud native agents (Container Insights, Azure Monitor, Cloud Ops) |
| DNS | `localhost`, `*.localhost` | Route 53 | Azure DNS | Cloud DNS | external-dns controller, records declared in OpenTofu | Provider DNS resources in OpenTofu |
| Certificates | None, or mkcert | cert-manager with ACM for NLB, or Let's Encrypt | cert-manager with Let's Encrypt | cert-manager with Let's Encrypt, or Google managed certs | cert-manager with Let's Encrypt | Cloud managed certificates |
| Autoscaling | None | HPA on CPU and request rate, Karpenter or Cluster Autoscaler | HPA, AKS cluster autoscaler or KEDA | HPA, GKE autoscaler | HPA in the Helm chart, optional KEDA | Cluster autoscalers are per cloud (module level) |
| AI text | Model server on the Mac host via `host.docker.internal` | Self hosted OpenAI-compatible server (vLLM) on GPU nodes, or any compatible endpoint | Same | Same | `TextModel` port, `openai-compatible` adapter | Bedrock adapter (legacy, deprecated) |
| AI images, moderation | Mock adapters | Optional cloud adapter (Bedrock, Rekognition), isolated | Optional adapter (Azure AI) | Optional adapter (Vertex AI) | `ImageModel` and `Moderator` ports, mock adapters by default | One adapter file per vendor, never SDK calls elsewhere |

## Where we accept a cloud specific adapter

1. Blob storage (main one): S3 API covers AWS, MinIO and GCS interoperability. Azure Blob needs its own `azureblob` adapter. It is the only place a second code path per cloud is expected.
2. Image generation and moderation: optional vendor adapters, isolated in single files, off by default.
3. Legacy adapters kept working but deprecated: DynamoDB store, Bedrock text, Bedrock media, SST config. See [ADR-0013](adr/ADR-0013-legacy-aws-deprecation.md).
4. OpenTofu modules: one implementation per cloud behind a shared module interface. This is infrastructure, not application code.
5. Helm values per cloud: annotations for load balancers, storage classes, and workload identity. Values only, no template forks.

Everything else must work identically in all four environments.
