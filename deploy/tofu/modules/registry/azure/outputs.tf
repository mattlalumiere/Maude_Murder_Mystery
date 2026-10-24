output "repository_url" {
  description = "Value for Helm image.repository (append /maude-web)."
  value       = "${azurerm_container_registry.this.login_server}/maude-web"
}

output "registry_url" {
  description = "Registry host for docker login."
  value       = azurerm_container_registry.this.login_server
}
