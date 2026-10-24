output "log_destination" {
  description = "Where container logs are shipped (workspace name)."
  value       = azurerm_log_analytics_workspace.this.name
}

output "alert_channel" {
  description = "Alert channel id (action group id)."
  value       = azurerm_monitor_action_group.alerts.id
}

output "log_workspace_id" {
  description = "Workspace id for AKS Container insights."
  value       = azurerm_log_analytics_workspace.this.id
}
