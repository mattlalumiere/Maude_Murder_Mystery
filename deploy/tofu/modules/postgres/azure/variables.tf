variable "name" {
  description = "Server name."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group."
  type        = string
}

variable "database_subnet_ids" {
  description = "Delegated subnet (first element is used)."
  type        = list(string)
}

variable "private_dns_zone_id" {
  description = "Private DNS zone id from the network module."
  type        = string
}

variable "zone" {
  description = "Primary availability zone."
  type        = string
  default     = "1"
}

variable "standby_zone" {
  description = "Standby zone when high_availability is true."
  type        = string
  default     = "2"
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

