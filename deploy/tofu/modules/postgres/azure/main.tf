locals {
  sku = { small = "GP_Standard_D2ds_v5", medium = "GP_Standard_D4ds_v5", large = "GP_Standard_D8ds_v5" }[var.size]
  # Flexible Server storage tiers are fixed sizes in MB.
  storage_mb = max(32768, var.storage_gb * 1024)
}

resource "random_password" "this" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                          = var.name
  location                      = var.location
  resource_group_name           = var.resource_group_name
  version                       = var.postgres_version
  sku_name                      = local.sku
  storage_mb                    = local.storage_mb
  delegated_subnet_id           = var.database_subnet_ids[0]
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false
  administrator_login           = var.username
  administrator_password        = random_password.this.result
  backup_retention_days         = var.backup_retention_days
  geo_redundant_backup_enabled  = var.high_availability
  zone                          = var.zone
  tags                          = var.tags

  dynamic "high_availability" {
    for_each = var.high_availability ? [1] : []
    content {
      mode                      = "ZoneRedundant"
      standby_availability_zone = var.standby_zone
    }
  }

  lifecycle {
    prevent_destroy = false
    ignore_changes  = [zone, high_availability[0].standby_availability_zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "this" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
