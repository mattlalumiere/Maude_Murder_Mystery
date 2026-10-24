output "network_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "Subnets for nodes and pods (no public IPs)."
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Subnets for internet-facing load balancers."
  value       = aws_subnet.public[*].id
}

output "database_subnet_ids" {
  description = "Subnets for databases."
  value       = aws_subnet.private[*].id
}

output "private_cidr_blocks" {
  description = "CIDRs of the private subnets (for allow-lists)."
  value       = aws_subnet.private[*].cidr_block
}

output "network_cidr" {
  description = "CIDR of the whole network."
  value       = var.cidr
}
