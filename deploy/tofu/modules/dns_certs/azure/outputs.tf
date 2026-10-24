output "zone_id" {
  description = "DNS zone id."
  value       = local.zone_id
}

output "name_servers" {
  description = "Delegate the domain to these name servers."
  value       = var.create_zone ? azurerm_dns_zone.this[0].name_servers : []
}

output "certificate_ref" {
  description = "Empty: cert-manager issues certificates on Azure."
  value       = ""
}
