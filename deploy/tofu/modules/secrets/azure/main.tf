data "azurerm_client_config" "current" {}

locals {
  # Key Vault secret names allow only alphanumerics and dashes.
  safe = { for n in var.secret_names : n => replace(n, "/[^A-Za-z0-9-]/", "-") }
}

resource "azurerm_key_vault" "this" {
  name                          = substr(replace(lower(var.name), "/[^a-z0-9-]/", ""), 0, 24)
  location                      = var.location
  resource_group_name           = var.resource_group_name
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true
  tags                          = var.tags
}

resource "azurerm_key_vault_secret" "this" {
  for_each     = toset(var.secret_value_names)
  name         = local.safe[each.key]
  value        = var.secret_values[each.key]
  key_vault_id = azurerm_key_vault.this.id
}

resource "azurerm_user_assigned_identity" "reader" {
  name                = "${var.name}-secrets-reader"
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_federated_identity_credential" "reader" {
  name                = "external-secrets"
  resource_group_name = var.resource_group_name
  parent_id           = azurerm_user_assigned_identity.reader.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = var.workload_identity["oidc_issuer_url"]
  subject             = "system:serviceaccount:${var.reader.namespace}:${var.reader.name}"
}

resource "azurerm_role_assignment" "reader" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.reader.principal_id
}
