# secrets

Secret containers in the cloud secret manager plus a read-only identity for the external-secrets operator. The chart never holds secret values. Implementations: `aws/` (Secrets Manager), `azure/` (Key Vault, RBAC), `gcp/` (Secret Manager).

| Input | Type | Notes |
|---|---|---|
| `name` | string | prefix |
| `secret_names` | list(string) | for example `cell-0/database-url` |
| `secret_value_names`, `secret_values` | list, sensitive map | optional initial values (they land in state); set the rest out of band |
| `reader` | {namespace,name} | external-secrets service account |
| `workload_identity` | map(string) | from `kubernetes` |
| `tags` | map(string) | |

Cloud extras: Azure `location`, `resource_group_name`; GCP `project_id`.

Outputs: `secret_ids` (logical name to remote key, goes into Helm `secrets.externalSecrets.remoteKeys`), `reader_annotations`, `store_config` (for the ClusterSecretStore).
