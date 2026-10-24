# network

Private network for one region. Implementations: `aws/` (VPC, NAT, S3 gateway endpoint), `azure/` (VNet, delegated PostgreSQL subnet, private DNS), `gcp/` (VPC, Cloud NAT, private services access).

## Common inputs

| Input | Type | Notes |
|---|---|---|
| `name` | string | prefix |
| `cidr` | string | default `10.0.0.0/16` (`/20` on GCP) |
| `az_count` | number | zones to span (parity only on Azure and GCP) |
| `tags` | map(string) | |

Cloud extras: Azure `location`; GCP `project_id`, `region`, `pods_cidr`, `services_cidr`; AWS `single_nat_gateway` (default true, cheaper, one AZ dependency).

## Common outputs

`network_id`, `private_subnet_ids`, `public_subnet_ids`, `database_subnet_ids`, `private_cidr_blocks`, `network_cidr`.
Cloud extras: Azure `resource_group_name`, `location`, `postgres_private_dns_zone_id`; GCP `subnetwork_name`, `network_name`, `private_services_connection_id`.
