output "repository_url" {
  description = "Value for Helm image.repository."
  value       = aws_ecr_repository.this.repository_url
}

output "registry_url" {
  description = "Registry host for docker login."
  value       = split("/", aws_ecr_repository.this.repository_url)[0]
}
