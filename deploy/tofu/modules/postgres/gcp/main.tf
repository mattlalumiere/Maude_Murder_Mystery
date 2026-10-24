locals {
  tier = { small = "db-custom-2-7680", medium = "db-custom-4-15360", large = "db-custom-8-30720" }[var.size]
}

resource "random_password" "this" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "this" {
  project             = var.project_id
  name                = var.name
  region              = var.region
  database_version    = "POSTGRES_${var.postgres_version}"
  deletion_protection = var.deletion_protection

  settings {
    tier              = local.tier
    availability_type = var.high_availability ? "REGIONAL" : "ZONAL"
    disk_size         = var.storage_gb
    disk_autoresize   = true
    disk_type         = "PD_SSD"
    user_labels       = var.tags

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }
  }

  depends_on = [var.private_services_connection_id]
}

resource "google_sql_database" "this" {
  project  = var.project_id
  name     = var.database_name
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "this" {
  project  = var.project_id
  name     = var.username
  instance = google_sql_database_instance.this.name
  password = random_password.this.result
}
