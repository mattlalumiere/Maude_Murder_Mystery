variable "name" {
  description = "Instance identifier."
  type        = string
}

variable "network_id" {
  description = "VPC id."
  type        = string
}

variable "database_subnet_ids" {
  description = "Subnets for the DB subnet group."
  type        = list(string)
}

variable "allowed_cidrs" {
  description = "CIDRs allowed to connect on 5432 (the private node subnets)."
  type        = list(string)
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

