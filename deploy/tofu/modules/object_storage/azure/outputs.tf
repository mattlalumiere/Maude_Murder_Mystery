output "bucket_name" {
  description = "Container name (S3_BUCKET equivalent)."
  value       = azurerm_storage_container.games.name
}

output "endpoint" {
  description = "Blob endpoint of the storage account. The azureblob adapter is spec only; the S3 adapter needs an S3 gateway in front of this."
  value       = azurerm_storage_account.this.primary_blob_endpoint
}

output "region" {
  description = "Region of the account."
  value       = var.location
}

output "force_path_style" {
  description = "S3_FORCE_PATH_STYLE value when a gateway is used."
  value       = "true"
}

output "service_account_annotations" {
  description = "Annotations for the Kubernetes service account (Helm serviceAccount.annotations)."
  value       = { "azure.workload.identity/client-id" = azurerm_user_assigned_identity.workload.client_id }
}

output "expiry_days" {
  description = "Lifecycle expiry applied."
  value       = local.expiry_days
}
