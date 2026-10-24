# dns_certs

DNS zone and, where the cloud load balancer needs one, a managed certificate. Elsewhere cert-manager (Let's Encrypt) issues certificates in the cluster. Implementations: `aws/` (Route 53 + ACM), `azure/` (Azure DNS), `gcp/` (Cloud DNS + Certificate Manager).

| Input | Type | Notes |
|---|---|---|
| `domain_name` | string | zone apex |
| `create_zone` | bool | false to look up an existing zone |
| `issue_certificate` | bool | cloud managed certificate |
| `tags` | map(string) | |

Cloud extras: Azure `resource_group_name`; GCP `project_id`.

Outputs: `zone_id`, `name_servers`, `certificate_ref`.
