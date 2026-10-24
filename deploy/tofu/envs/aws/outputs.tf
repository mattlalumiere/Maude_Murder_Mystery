output "kubeconfig_command" {
  description = "Run this to get cluster credentials."
  value       = module.kubernetes.kubeconfig_command
}

output "image_repository" {
  description = "Push the maude-web image here."
  value       = module.registry.repository_url
}

output "registry_url" {
  description = "docker login target."
  value       = module.registry.registry_url
}

output "name_servers" {
  description = "Delegate the domain to these name servers."
  value       = module.dns_certs.name_servers
}

output "zone_id" {
  description = "DNS zone id (input for global_routing)."
  value       = module.dns_certs.zone_id
}

output "buckets" {
  description = "Bucket per cell."
  value       = { for k, m in module.object_storage : k => m.bucket_name }
}

output "secret_store_config" {
  description = "Use to create the ClusterSecretStore named in values (see docs/platform/cloud-deployment.md)."
  value       = module.secrets.store_config
}

output "namespaces" {
  description = "Namespace per cell."
  value       = module.region.namespaces
}

output "alert_channel" {
  description = "Alert channel id."
  value       = module.observability.alert_channel
}
