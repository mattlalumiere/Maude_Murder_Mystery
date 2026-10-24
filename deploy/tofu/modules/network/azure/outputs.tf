output "network_id" {
  description = "VNet id."
  value       = azurerm_virtual_network.this.id
}

output "private_subnet_ids" {
  description = "Subnets for nodes and pods."
  value       = [azurerm_subnet.nodes.id]
}

output "public_subnet_ids" {
  description = "Azure load balancers live in the node subnet; empty for parity."
  value       = []
}

output "database_subnet_ids" {
  description = "Delegated subnet for PostgreSQL Flexible Server."
  value       = [azurerm_subnet.database.id]
}

output "private_cidr_blocks" {
  description = "CIDRs of the private subnets."
  value       = azurerm_subnet.nodes.address_prefixes
}

output "network_cidr" {
  description = "CIDR of the whole network."
  value       = var.cidr
}

output "resource_group_name" {
  description = "Azure only: resource group holding everything."
  value       = azurerm_resource_group.this.name
}

output "location" {
  description = "Azure only: region."
  value       = azurerm_resource_group.this.location
}

output "postgres_private_dns_zone_id" {
  description = "Azure only: private DNS zone id for PostgreSQL."
  value       = azurerm_private_dns_zone.postgres.id
}
