variable "region_id" {
  description = "Region id, becomes REGION_ID in every cell."
  type        = string
}

variable "chart_path" {
  description = "Path to the Helm chart."
  type        = string
}

variable "values_files" {
  description = "Values files applied to every cell (for example the cloud values file)."
  type        = list(string)
  default     = []
}

variable "image_repository" {
  description = "Container image repository."
  type        = string
}

variable "namespace_prefix" {
  description = "Namespace prefix, shared with the infrastructure that grants workload identity."
  type        = string
  default     = "maude-"
}

variable "cells" {
  description = "The cells of this region. Adding a key adds a cell; removing a key removes it. The key is the cell id."
  type = map(object({
    image_tag    = string
    replicas     = optional(number, 3)
    max_replicas = optional(number, 36)
    ingress_host = optional(string, "")
    extra_values = optional(any, {})
  }))
}

variable "cell_infra" {
  description = "Per cell infrastructure facts, same keys as cells (bucket, identity, secrets). Produced by the cloud modules in the env root."
  type = map(object({
    config                      = map(string)
    service_account_annotations = optional(map(string), {})
    pod_labels                  = optional(map(string), {})
    secret_remote_keys          = optional(map(string), {})
  }))
}
