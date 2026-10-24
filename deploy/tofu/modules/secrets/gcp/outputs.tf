output "secret_ids" {
  description = "Map of logical name to remote key (use as Helm secrets.externalSecrets.remoteKeys values)."
  value       = local.safe
}

output "reader_annotations" {
  description = "Annotations for the external-secrets service account."
  value       = { "iam.gke.io/gcp-service-account" = google_service_account.reader.email }
}

output "store_config" {
  description = "Provider details for a ClusterSecretStore."
  value       = { provider = "gcpsm", project_id = var.project_id }
}
