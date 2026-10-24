variable "name" {
  description = "Name prefix for all resources."
  type        = string
}

variable "cidr" {
  description = "Primary CIDR for nodes."
  type        = string
  default     = "10.0.0.0/20"
}

variable "pods_cidr" {
  description = "Secondary range for pods (GCP only)."
  type        = string
  default     = "10.4.0.0/14"
}

variable "services_cidr" {
  description = "Secondary range for services (GCP only)."
  type        = string
  default     = "10.8.0.0/20"
}

variable "az_count" {
  description = "Accepted for interface parity. GCP subnets are regional."
  type        = number
  default     = 3
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "tags" {
  description = "Labels applied where supported."
  type        = map(string)
  default     = {}
}
