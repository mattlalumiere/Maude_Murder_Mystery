# object_storage

One private bucket per cell with encryption at rest, public access blocked, lifecycle expiry and a workload identity limited to that bucket. Implementations: `aws/` (S3 + KMS + IRSA role), `azure/` (Blob container + user assigned identity + federated credential), `gcp/` (GCS + service account + Workload Identity binding).

## Common inputs

| Input | Type | Notes |
|---|---|---|
| `name` | string | bucket name (Azure: derived account name) |
| `ttl_hours` | number | `GAME_TTL_HOURS`; objects expire after `ceil(ttl_hours/24) + 1` days (backstop only, the app deletes precisely) |
| `force_destroy` | bool | default false |
| `service_accounts` | list({namespace,name}) | pods allowed to use the bucket |
| `workload_identity` | map(string) | from `kubernetes` |
| `tags` | map(string) | |

Cloud extras: Azure `location`, `resource_group_name`; GCP `project_id`, `region`.

## Common outputs

`bucket_name` (S3_BUCKET), `endpoint` (S3_ENDPOINT), `region` (S3_REGION), `force_path_style` (S3_FORCE_PATH_STYLE), `service_account_annotations` (Helm `serviceAccount.annotations`), `expiry_days`.

Note: Azure Blob is not S3 compatible. The `azureblob` adapter is spec only, so the Azure env needs an S3 gateway until it lands.
