output "ingress_class" {
  description = "Ingress class to use in Helm values."
  value       = "traefik"
}

output "ingress_namespace" {
  description = "Namespace of the ingress controller (NetworkPolicy ingressFrom)."
  value       = "traefik"
}
