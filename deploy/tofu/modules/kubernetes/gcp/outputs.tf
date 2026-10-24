output "cluster_name" {
  description = "Cluster name."
  value       = google_container_cluster.this.name
}

output "cluster_endpoint" {
  description = "API server URL."
  value       = "https://${google_container_cluster.this.endpoint}"
}

output "cluster_ca_certificate" {
  description = "Base64 CA certificate of the API server."
  value       = google_container_cluster.this.master_auth[0].cluster_ca_certificate
}

output "kubeconfig_command" {
  description = "Command that writes a kubeconfig entry."
  value       = "gcloud container clusters get-credentials ${google_container_cluster.this.name} --region ${var.region} --project ${var.project_id}"
}

output "workload_identity" {
  description = "Opaque map consumed by object_storage and secrets modules of the same cloud."
  value = {
    project_id    = var.project_id
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}

output "node_principal_id" {
  description = "Node service account member (for registry pull access)."
  value       = "serviceAccount:${google_service_account.nodes.email}"
}
