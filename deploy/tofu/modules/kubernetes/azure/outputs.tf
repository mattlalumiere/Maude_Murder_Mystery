output "cluster_name" {
  description = "Cluster name."
  value       = azurerm_kubernetes_cluster.this.name
}

output "cluster_endpoint" {
  description = "API server URL."
  value       = "https://${azurerm_kubernetes_cluster.this.fqdn}:443"
}

output "cluster_ca_certificate" {
  description = "Base64 CA certificate of the API server."
  value       = azurerm_kubernetes_cluster.this.kube_config[0].cluster_ca_certificate
  sensitive   = true
}

output "kubeconfig_command" {
  description = "Command that writes a kubeconfig entry."
  value       = "az aks get-credentials --resource-group ${var.resource_group_name} --name ${azurerm_kubernetes_cluster.this.name}"
}

output "workload_identity" {
  description = "Opaque map consumed by object_storage and secrets modules of the same cloud."
  value = {
    oidc_issuer_url     = azurerm_kubernetes_cluster.this.oidc_issuer_url
    tenant_id           = data.azurerm_client_config.current.tenant_id
    resource_group_name = var.resource_group_name
    location            = var.location
  }
}

output "node_principal_id" {
  description = "Kubelet identity object id (grant AcrPull)."
  value       = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id
}
