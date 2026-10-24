output "namespace" {
  description = "Namespace of the cell."
  value       = kubernetes_namespace.this.metadata[0].name
}

output "release_name" {
  description = "Helm release name."
  value       = helm_release.web.name
}

output "cell_id" {
  description = "Cell id."
  value       = var.cell_id
}
