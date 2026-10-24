variable "subscription_id" {
  description = "Azure subscription id."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "name" {
  description = "Environment name, prefix for all resources."
  type        = string
  default     = "maude"
}

variable "cidr" {
  description = "VNet CIDR."
  type        = string
  default     = "10.0.0.0/16"
}

variable "name_suffix" {
  description = "Short suffix that makes global names (storage, registry, vault) unique."
  type        = string
}

variable "ttl_hours" {
  description = "GAME_TTL_HOURS."
  type        = number
  default     = 24
}

variable "domain_name" {
  description = "DNS zone apex."
  type        = string
}

variable "create_zone" {
  description = "Create the DNS zone."
  type        = bool
  default     = true
}

variable "ai_base_url" {
  description = "OpenAI-compatible endpoint reachable from the cluster."
  type        = string
}

variable "ai_model" {
  description = "Model name sent to the endpoint."
  type        = string
}

variable "alert_email" {
  description = "Alert email."
  type        = string
  default     = ""
}

variable "api_allowed_cidrs" {
  description = "CIDRs allowed to reach the Kubernetes API."
  type        = list(string)
  default     = []
}

variable "admin_group_object_ids" {
  description = "Entra ID groups with cluster admin."
  type        = list(string)
  default     = []
}

variable "node_vm_size" {
  description = "User pool VM size."
  type        = string
  default     = "Standard_D2ps_v6"
}

variable "node_min" {
  description = "Minimum user pool nodes."
  type        = number
  default     = 3
}

variable "node_max" {
  description = "Maximum user pool nodes."
  type        = number
  default     = 12
}

variable "database_size" {
  description = "Database size per cell: small, medium or large."
  type        = string
  default     = "small"
}

variable "image_repository_override" {
  description = "Use this image repository instead of the one created here (empty to use the created registry)."
  type        = string
  default     = ""
}

variable "chart_path" {
  description = "Path to the Helm chart."
  type        = string
  default     = "../../../helm/maude"
}

variable "namespace_prefix" {
  description = "Cell namespace prefix."
  type        = string
  default     = "maude-"
}

variable "cells" {
  description = "Cells in this region. Add a key to add a cell."
  type = map(object({
    image_tag    = string
    replicas     = optional(number, 3)
    max_replicas = optional(number, 36)
    hostname     = optional(string, "")
  }))
}

variable "tags" {
  description = "Extra tags."
  type        = map(string)
  default     = {}
}
