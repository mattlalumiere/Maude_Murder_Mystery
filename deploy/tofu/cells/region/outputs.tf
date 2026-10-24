output "namespaces" {
  description = "Namespace per cell."
  value       = { for k, c in module.cell : k => c.namespace }
}

output "cell_ids" {
  description = "Cell ids deployed in this region."
  value       = keys(module.cell)
}
