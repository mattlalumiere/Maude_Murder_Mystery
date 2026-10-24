output "log_destination" {
  description = "Where container logs are shipped (log group name)."
  value       = aws_cloudwatch_log_group.app.name
}

output "alert_channel" {
  description = "Alert channel id (SNS topic ARN)."
  value       = aws_sns_topic.alerts.arn
}

output "log_workspace_id" {
  description = "Workspace id for cluster log integration (empty on AWS)."
  value       = ""
}
