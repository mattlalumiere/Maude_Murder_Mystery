output "secret_ids" {
  description = "Map of logical name to remote key (use as Helm secrets.externalSecrets.remoteKeys values)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.name }
}

output "reader_annotations" {
  description = "Annotations for the external-secrets service account."
  value       = { "eks.amazonaws.com/role-arn" = aws_iam_role.reader.arn }
}

output "store_config" {
  description = "Provider details for a ClusterSecretStore."
  value       = { provider = "aws", service = "SecretsManager" }
}
