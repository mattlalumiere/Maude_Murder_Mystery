variable "name" {
  description = "Prefix for secret ids and the reader service account."
  type        = string
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "secret_names" {
  description = "Logical secret names to create (for example cell-0/database-url). Values are set out of band unless listed in secret_value_names."
  type        = list(string)
}

variable "secret_value_names" {
  description = "Subset of secret_names whose value is supplied in secret_values."
  type        = list(string)
  default     = []
}

variable "secret_values" {
  description = "Initial values by name. They land in state; prefer setting values out of band."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "reader" {
  description = "Service account of the external-secrets operator (or CSI driver) allowed to read."
  type = object({
    namespace = string
    name      = string
  })
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

