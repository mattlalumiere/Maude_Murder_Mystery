output "host" {
  description = "Private IP address of the instance."
  value       = google_sql_database_instance.this.private_ip_address
}

output "port" {
  description = "Database port."
  value       = 5432
}

output "database" {
  description = "Database name."
  value       = google_sql_database.this.name
}

output "username" {
  description = "Administrator user."
  value       = google_sql_user.this.name
}

output "password" {
  description = "Administrator password (also stored in state; protect the state backend)."
  value       = random_password.this.result
  sensitive   = true
}

output "connection_url" {
  description = "DATABASE_URL value. TLS required."
  value       = "postgres://${google_sql_user.this.name}:${random_password.this.result}@${google_sql_database_instance.this.private_ip_address}:5432/${google_sql_database.this.name}?sslmode=require"
  sensitive   = true
}
