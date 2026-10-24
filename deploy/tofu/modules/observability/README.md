# observability

Cloud side log retention and an alert channel. Metrics and dashboards run in the cluster (Prometheus compatible, portable). Implementations: `aws/` (CloudWatch log group + SNS), `azure/` (Log Analytics + action group), `gcp/` (log bucket + notification channel).

| Input | Type | Notes |
|---|---|---|
| `name` | string | |
| `retention_days` | number | default 30 |
| `alert_email` | string | empty for none |
| `tags` | map(string) | |

Cloud extras: Azure `location`, `resource_group_name`; GCP `project_id`.

Outputs: `log_destination`, `alert_channel`, `log_workspace_id`.
