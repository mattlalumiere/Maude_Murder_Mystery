# global_routing

The one place with cloud specific traffic services. It spreads one public host name over the regional ingresses (health checked, latency or geo aware). Everything below the regional ingress is identical on every cloud. Implementations: `aws/` (Route 53 latency records + health checks), `azure/` (Traffic Manager, performance routing), `gcp/` (Cloud DNS geo routing policy; a global external load balancer is the alternative).

| Input | Type | Notes |
|---|---|---|
| `hostname` | string | public name |
| `endpoints` | map({target, region, weight}) | one per region |

Cloud extras: AWS `zone_id`; Azure `resource_group_name`, `zone_name`, `relative_name`; GCP `project_id`, `zone_id`.

Output: `fqdn`.

This module is not wired into the single region envs. A global stack calls it once with the ingress names from each region's env (see `deploy/tofu/cells/README.md`).
