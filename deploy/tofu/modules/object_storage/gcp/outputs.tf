output "bucket_name" {
  description = "S3_BUCKET value (GCS through its S3 interoperability endpoint)."
  value       = google_storage_bucket.this.name
}

output "endpoint" {
  description = "S3_ENDPOINT value for GCS interoperability."
  value       = "https://storage.googleapis.com"
}

output "region" {
  description = "S3_REGION value (GCS ignores it, use auto)."
  value       = "auto"
}

output "force_path_style" {
  description = "S3_FORCE_PATH_STYLE value."
  value       = "true"
}

output "service_account_annotations" {
  description = "Annotations for the Kubernetes service account (Helm serviceAccount.annotations)."
  value       = { "iam.gke.io/gcp-service-account" = google_service_account.workload.email }
}

output "expiry_days" {
  description = "Lifecycle expiry applied."
  value       = local.expiry_days
}
