variable "name" {
  description = "Base name. The storage account name is derived (lowercase alphanumerics, max 24 chars)."
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

variable "ttl_hours" {
  description = "GAME_TTL_HOURS. Objects expire after ceil(ttl_hours / 24) + 1 days (backstop; the app deletes precisely)."
  type        = number
  default     = 24
}

variable "force_destroy" {
  description = "Allow destroying a non-empty bucket. Keep false outside throwaway environments."
  type        = bool
  default     = false
}

variable "service_accounts" {
  description = "Kubernetes service accounts allowed read/write on this bucket."
  type = list(object({
    namespace = string
    name      = string
  }))
}

variable "workload_identity" {
  description = "Output workload_identity of the kubernetes module of the same cloud."
  type        = map(string)
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

