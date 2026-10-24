resource "google_logging_project_bucket_config" "app" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "${var.name}-app"
  retention_days = var.retention_days
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email == "" ? 0 : 1
  project      = var.project_id
  display_name = "${var.name} alerts"
  type         = "email"
  labels       = { email_address = var.alert_email }
}
