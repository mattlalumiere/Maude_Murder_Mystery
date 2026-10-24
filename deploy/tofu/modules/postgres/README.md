# postgres

One managed PostgreSQL per cell (strongest isolation, simple deletion of a cell). Private networking only, TLS required, automated backups. Implementations: `aws/` (RDS), `azure/` (Flexible Server, VNet integrated), `gcp/` (Cloud SQL private IP).

## Common inputs

| Input | Type | Notes |
|---|---|---|
| `name` | string | |
| `size` | small, medium, large | mapped to instance class in `locals` |
| `storage_gb` | number | default 50 |
| `postgres_version` | string | default 16 |
| `backup_retention_days` | number | default 7 |
| `high_availability` | bool | default true (Multi-AZ, zone redundant, regional) |
| `deletion_protection` | bool | default true |
| `database_name`, `username` | string | default `maude` |
| `tags` | map(string) | |

Cloud extras: AWS `network_id`, `database_subnet_ids`, `allowed_cidrs`; Azure `location`, `resource_group_name`, `database_subnet_ids`, `private_dns_zone_id`; GCP `project_id`, `region`, `network_id`, `private_services_connection_id`.

## Common outputs

`host`, `port`, `database`, `username`, `password` (sensitive), `connection_url` (sensitive, `sslmode=require`).
The generated password lives in state: use an encrypted remote backend and restrict access.
