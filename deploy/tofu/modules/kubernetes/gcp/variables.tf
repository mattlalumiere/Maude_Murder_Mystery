variable "name" {
  description = "Cluster name."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes minor version prefix, or null for the release channel default."
  type        = string
  default     = null
}

variable "private_subnet_ids" {
  description = "Accepted for interface parity; GKE uses subnetwork_name below."
  type        = list(string)
  default     = []
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region (the cluster is regional)."
  type        = string
}

variable "network_name" {
  description = "VPC network name."
  type        = string
}

variable "subnetwork_name" {
  description = "Subnetwork name with secondary ranges named pods and services."
  type        = string
}

variable "node_machine_type" {
  description = "Machine type for the standard node pool."
  type        = string
  default     = "e2-standard-2"
}

variable "node_min" {
  description = "Minimum nodes per zone."
  type        = number
  default     = 1
}

variable "node_max" {
  description = "Maximum nodes per zone."
  type        = number
  default     = 4
}

variable "node_desired" {
  description = "Initial nodes per zone."
  type        = number
  default     = 1
}

variable "public_endpoint" {
  description = "Expose the API server publicly (restricted by api_allowed_cidrs)."
  type        = bool
  default     = true
}

variable "api_allowed_cidrs" {
  description = "CIDRs allowed to reach the API server."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Labels applied to the cluster."
  type        = map(string)
  default     = {}
}
