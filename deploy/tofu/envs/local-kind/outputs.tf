output "namespaces" {
  description = "Namespace per cell."
  value       = module.region.namespaces
}

output "port_forward" {
  description = "Open the app on http://localhost:3000"
  value       = { for k, ns in module.region.namespaces : k => "kubectl -n ${ns} port-forward svc/maude 3000:80" }
}
