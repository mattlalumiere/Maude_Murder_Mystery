resource "azurerm_dns_zone" "this" {
  count               = var.create_zone ? 1 : 0
  name                = var.domain_name
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

data "azurerm_dns_zone" "existing" {
  count               = var.create_zone ? 0 : 1
  name                = var.domain_name
  resource_group_name = var.resource_group_name
}

locals {
  zone_id = var.create_zone ? azurerm_dns_zone.this[0].id : data.azurerm_dns_zone.existing[0].id
}
