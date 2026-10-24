resource "azurerm_container_registry" "this" {
  name                          = substr(replace(lower(var.name), "/[^a-z0-9]/", ""), 0, 50)
  resource_group_name           = var.resource_group_name
  location                      = var.location
  sku                           = "Premium"
  admin_enabled                 = false
  public_network_access_enabled = true
  zone_redundancy_enabled       = true
  tags                          = var.tags

  retention_policy_in_days = 7
}

resource "azurerm_role_assignment" "pull" {
  count                = length(var.pull_principal_ids)
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = var.pull_principal_ids[count.index]
}
