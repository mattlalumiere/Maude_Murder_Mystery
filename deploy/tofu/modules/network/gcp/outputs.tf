output "network_id" {
  description = "VPC network id."
  value       = google_compute_network.this.id
}

output "private_subnet_ids" {
  description = "Subnetwork for nodes and pods."
  value       = [google_compute_subnetwork.nodes.id]
}

output "public_subnet_ids" {
  description = "Empty for parity (GCP load balancers are global or regional, not subnet bound)."
  value       = []
}

output "database_subnet_ids" {
  description = "Cloud SQL uses private services access on the network, not a subnet."
  value       = [google_compute_subnetwork.nodes.id]
}

output "private_cidr_blocks" {
  description = "CIDRs of the private subnets."
  value       = [google_compute_subnetwork.nodes.ip_cidr_range]
}

output "network_cidr" {
  description = "Node CIDR."
  value       = var.cidr
}

output "subnetwork_name" {
  description = "GCP only: subnetwork name for GKE."
  value       = google_compute_subnetwork.nodes.name
}

output "network_name" {
  description = "GCP only: network name."
  value       = google_compute_network.this.name
}

output "private_services_connection_id" {
  description = "GCP only: dependency handle so Cloud SQL waits for peering."
  value       = google_service_networking_connection.private_services.id
}
