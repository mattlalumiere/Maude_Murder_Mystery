output "zone_id" {
  description = "DNS zone id."
  value       = local.zone_id
}

output "name_servers" {
  description = "Delegate the domain to these name servers."
  value       = var.create_zone ? aws_route53_zone.this[0].name_servers : []
}

output "certificate_ref" {
  description = "Cloud certificate reference (ACM ARN) or empty when cert-manager issues certificates."
  value       = var.issue_certificate ? aws_acm_certificate_validation.this[0].certificate_arn : ""
}
