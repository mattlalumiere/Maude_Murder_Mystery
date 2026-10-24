output "secret_ids" {
  description = "Map of logical name to remote key (use as Helm secrets.externalSecrets.remoteKeys values)."
  value       = local.safe
}

output "reader_annotations" {
  description = "Annotations for the external-secrets service account."
  value       = { "azure.workload.identity/client-id" = azurerm_user_assigned_identity.reader.client_id }
}

output "store_config" {
  description = "Provider details for a ClusterSecretStore."
  value       = { provider = "azurekv", vault_url = azurerm_key_vault.this.vault_uri }
}
