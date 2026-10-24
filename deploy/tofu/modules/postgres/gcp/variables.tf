variable "name" {
  description = "Instance name."
  type        = string
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "network_id" {
  description = "VPC network id with private services access configured."
  type        = string
}

variable "private_services_connection_id" {
  description = "Output of the network module so the instance waits for peering."
  type        = string
}

variable "size" {
  description = "T-shirt size: small, medium or large. Mapped to a cloud instance class in locals."
  type        = string
  default     = "small"
  validation {
    condition     = contains(["small", "medium", "large"], var.size)
    error_message = "size must be small, medium or large."
  }
}

variable "storage_gb" {
  description = "Allocated storage in GB."
  type        = number
  default     = 50
}

variable "postgres_version" {
  description = "Major PostgreSQL version."
  type        = string
  default     = "16"
}

variable "backup_retention_days" {
  description = "Automated backup retention in days."
  type        = number
  default     = 7
}

variable "high_availability" {
  description = "Standby in another zone."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Block accidental deletion. Set false only to destroy a cell on purpose."
  type        = bool
  default     = true
}

variable "database_name" {
  description = "Initial database name."
  type        = string
  default     = "maude"
}

variable "username" {
  description = "Administrator user name."
  type        = string
  default     = "maude"
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

