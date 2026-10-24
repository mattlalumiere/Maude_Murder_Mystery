# Traffic Manager (DNS level, performance routing) rather than Front Door, so the
# regional ingresses stay the only data path and no proprietary proxy is required.
resource "azurerm_traffic_manager_profile" "this" {
  name                   = replace(var.hostname, ".", "-")
  resource_group_name    = var.resource_group_name
  traffic_routing_method = "Performance"

  dns_config {
    relative_name = replace(var.hostname, ".", "-")
    ttl           = 30
  }

  monitor_config {
    protocol = "HTTPS"
    port     = 443
    path     = "/api/readyz"
  }
}

resource "azurerm_traffic_manager_external_endpoint" "this" {
  for_each          = var.endpoints
  name              = each.key
  profile_id        = azurerm_traffic_manager_profile.this.id
  target            = each.value.target
  weight            = each.value.weight
  endpoint_location = each.value.region
}

resource "azurerm_dns_cname_record" "this" {
  name                = var.relative_name
  zone_name           = var.zone_name
  resource_group_name = var.resource_group_name
  ttl                 = 30
  record              = azurerm_traffic_manager_profile.this.fqdn
}
