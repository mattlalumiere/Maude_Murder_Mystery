# kubernetes

Managed cluster with private nodes, workload identity and zone spread. Implementations: `aws/` (EKS, managed node group, IRSA), `azure/` (AKS, system and user pools, workload identity, Cilium), `gcp/` (GKE Standard, regional, Workload Identity; Autopilot is an ADR level alternative noted in `gcp/main.tf`).

## Common inputs

| Input | Type | Notes |
|---|---|---|
| `name` | string | cluster name |
| `kubernetes_version` | string | minor version |
| `private_subnet_ids` | list(string) | from `network` |
| `node_min`, `node_max`, `node_desired` | number | autoscaling bounds |
| `public_endpoint` | bool | default true, restricted by `api_allowed_cidrs` |
| `api_allowed_cidrs` | list(string) | who may reach the API |
| `tags` | map(string) | |

Cloud extras: AWS `node_instance_types`, `node_ami_type`; Azure `location`, `resource_group_name`, `node_vm_size`, `system_vm_size`, `zones`, `admin_group_object_ids`, `log_analytics_workspace_id`; GCP `project_id`, `region`, `network_name`, `subnetwork_name`, `node_machine_type`.

## Common outputs

`cluster_name`, `cluster_endpoint`, `cluster_ca_certificate` (base64, sensitive on Azure), `kubeconfig_command`, `workload_identity` (opaque map handed to `object_storage` and `secrets` of the same cloud), `node_principal_id` (handed to `registry`).
