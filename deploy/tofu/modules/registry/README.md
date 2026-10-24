# registry

Container registry with immutable tags, scanning where available and retention. Implementations: `aws/` (ECR), `azure/` (ACR Premium), `gcp/` (Artifact Registry).

| Input | Type | Notes |
|---|---|---|
| `name` | string | |
| `keep_last_images` | number | retention |
| `pull_principal_ids` | list(string) | who may pull (kubelet identity, node SA member) |
| `tags` | map(string) | |

Cloud extras: Azure `location`, `resource_group_name`; GCP `project_id`, `region`.

Outputs: `repository_url` (Helm `image.repository`), `registry_url` (docker login).
