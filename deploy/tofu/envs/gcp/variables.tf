variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "name" {
  description = "Environment name, prefix for all resources."
  type        = string
  default     = "maude"
}

variable "bucket_suffix" {
  description = "Suffix that makes bucket names globally unique."
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
  description = "Create the managed zone."
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

variable "node_machine_type" {
  description = "Node machine type."
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
  description = "Extra labels (lowercase keys and values)."
  type        = map(string)
  default     = {}
}
