output "bucket_name" {
  description = "S3_BUCKET value."
  value       = aws_s3_bucket.this.id
}

output "endpoint" {
  description = "S3_ENDPOINT value (empty means the SDK default for AWS)."
  value       = ""
}

output "region" {
  description = "S3_REGION value."
  value       = data.aws_region.current.region
}

output "force_path_style" {
  description = "S3_FORCE_PATH_STYLE value."
  value       = "false"
}

output "service_account_annotations" {
  description = "Annotations for the Kubernetes service account (Helm serviceAccount.annotations)."
  value       = { "eks.amazonaws.com/role-arn" = aws_iam_role.workload.arn }
}

output "expiry_days" {
  description = "Lifecycle expiry applied."
  value       = local.expiry_days
}
