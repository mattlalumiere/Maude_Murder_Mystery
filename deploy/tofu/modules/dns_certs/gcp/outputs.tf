output "zone_id" {
  description = "Managed zone name."
  value       = local.zone_name
}

output "name_servers" {
  description = "Delegate the domain to these name servers."
  value       = var.create_zone ? google_dns_managed_zone.this[0].name_servers : []
}

output "certificate_ref" {
  description = "Certificate Manager certificate id, or empty when cert-manager issues certificates."
  value       = var.issue_certificate ? google_certificate_manager_certificate.this[0].id : ""
}
