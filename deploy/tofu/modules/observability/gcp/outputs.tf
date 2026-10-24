output "log_destination" {
  description = "Where container logs are shipped (log bucket id)."
  value       = google_logging_project_bucket_config.app.id
}

output "alert_channel" {
  description = "Alert channel id (empty when no email was given)."
  value       = var.alert_email == "" ? "" : google_monitoring_notification_channel.email[0].id
}

output "log_workspace_id" {
  description = "Workspace id for cluster log integration (empty on GCP)."
  value       = ""
}
