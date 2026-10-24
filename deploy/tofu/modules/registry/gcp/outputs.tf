output "repository_url" {
  description = "Value for Helm image.repository (append /maude-web)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}/maude-web"
}

output "registry_url" {
  description = "Registry host for docker login."
  value       = "${var.region}-docker.pkg.dev"
}
