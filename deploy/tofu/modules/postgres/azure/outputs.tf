output "host" {
  description = "Database host name."
  value       = azurerm_postgresql_flexible_server.this.fqdn
}

output "port" {
  description = "Database port."
  value       = 5432
}

output "database" {
  description = "Database name."
  value       = azurerm_postgresql_flexible_server_database.this.name
}

output "username" {
  description = "Administrator user."
  value       = var.username
}

output "password" {
  description = "Administrator password (also stored in state; protect the state backend)."
  value       = random_password.this.result
  sensitive   = true
}

output "connection_url" {
  description = "DATABASE_URL value. TLS required."
  value       = "postgres://${var.username}:${random_password.this.result}@${azurerm_postgresql_flexible_server.this.fqdn}:5432/${var.database_name}?sslmode=require"
  sensitive   = true
}
