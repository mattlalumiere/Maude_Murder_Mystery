locals {
  expiry_days  = ceil(var.ttl_hours / 24) + 1
  account_name = substr(replace(lower(var.name), "/[^a-z0-9]/", ""), 0, 24)
  subjects     = { for sa in var.service_accounts : "${sa.namespace}-${sa.name}" => "system:serviceaccount:${sa.namespace}:${sa.name}" }
}

resource "azurerm_storage_account" "this" {
  name                            = local.account_name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "ZRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  tags                            = var.tags

  blob_properties {
    versioning_enabled = false
  }
}

resource "azurerm_storage_container" "games" {
  name                  = "games"
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "expiry" {
  storage_account_id = azurerm_storage_account.this.id

  rule {
    name    = "expire-game-objects"
    enabled = true
    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["games/"]
    }
    actions {
      base_blob {
        delete_after_days_since_creation_greater_than = local.expiry_days
      }
    }
  }
}

resource "azurerm_user_assigned_identity" "workload" {
  name                = "${var.name}-web"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags
}

resource "azurerm_federated_identity_credential" "workload" {
  for_each            = local.subjects
  name                = each.key
  resource_group_name = var.resource_group_name
  parent_id           = azurerm_user_assigned_identity.workload.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = var.workload_identity["oidc_issuer_url"]
  subject             = each.value
}

resource "azurerm_role_assignment" "blob" {
  scope                = azurerm_storage_container.games.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}
