resource "azurerm_log_analytics_workspace" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = var.retention_days
  tags                = var.tags
}

resource "azurerm_monitor_action_group" "alerts" {
  name                = "${var.name}-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "maude"
  tags                = var.tags

  dynamic "email_receiver" {
    for_each = var.alert_email == "" ? [] : [var.alert_email]
    content {
      name          = "primary"
      email_address = email_receiver.value
    }
  }
}
