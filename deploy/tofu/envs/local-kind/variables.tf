variable "kube_context" {
  description = "kubeconfig context of the kind cluster (created by deploy/kind/kind-up.sh)."
  type        = string
  default     = "kind-maude"
}

variable "kubeconfig_path" {
  description = "Path to the kubeconfig file."
  type        = string
  default     = "~/.kube/config"
}

variable "image_repository" {
  description = "Image repository loaded into kind."
  type        = string
  default     = "maude-web"
}

variable "chart_path" {
  description = "Path to the Helm chart."
  type        = string
  default     = "../../../helm/maude"
}

variable "cells" {
  description = "Cells in the local cluster. Usually one."
  type = map(object({
    image_tag    = string
    replicas     = optional(number, 1)
    max_replicas = optional(number, 1)
  }))
  default = {
    "local-0" = { image_tag = "latest" }
  }
}
