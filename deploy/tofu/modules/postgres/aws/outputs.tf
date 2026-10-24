output "host" {
  description = "Database host name."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Database port."
  value       = aws_db_instance.this.port
}

output "database" {
  description = "Database name."
  value       = aws_db_instance.this.db_name
}

output "username" {
  description = "Administrator user."
  value       = aws_db_instance.this.username
}

output "password" {
  description = "Administrator password (also stored in state; protect the state backend)."
  value       = random_password.this.result
  sensitive   = true
}

output "connection_url" {
  description = "DATABASE_URL value. TLS required."
  value       = "postgres://${aws_db_instance.this.username}:${random_password.this.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?sslmode=require"
  sensitive   = true
}
