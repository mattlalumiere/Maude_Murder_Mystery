output "cluster_name" {
  description = "Cluster name."
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "API server URL."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_ca_certificate" {
  description = "Base64 CA certificate of the API server."
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "kubeconfig_command" {
  description = "Command that writes a kubeconfig entry."
  value       = "aws eks update-kubeconfig --name ${aws_eks_cluster.this.name} --region ${data.aws_region.current.region}"
}

output "workload_identity" {
  description = "Opaque map consumed by object_storage and secrets modules of the same cloud."
  value = {
    oidc_provider_arn = aws_iam_openid_connect_provider.irsa.arn
    oidc_issuer       = replace(aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")
  }
}

output "node_principal_id" {
  description = "Principal that nodes run as (used by registry pull access where needed)."
  value       = aws_iam_role.node.arn
}
