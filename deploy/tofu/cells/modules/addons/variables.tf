variable "install_ingress_controller" {
  description = "Install Traefik as the ingress controller (class traefik). Set false to bring your own."
  type        = bool
  default     = true
}

variable "install_cert_manager" {
  description = "Install cert-manager."
  type        = bool
  default     = true
}

variable "install_external_secrets" {
  description = "Install the external-secrets operator."
  type        = bool
  default     = true
}

variable "external_secrets_annotations" {
  description = "Workload identity annotations for the external-secrets service account (secrets module reader_annotations)."
  type        = map(string)
  default     = {}
}

variable "ingress_service_annotations" {
  description = "Annotations for the ingress controller Service (cloud load balancer settings)."
  type        = map(string)
  default     = {}
}

variable "traefik_version" {
  description = "Traefik chart version."
  type        = string
  default     = "34.4.1"
}

variable "cert_manager_version" {
  description = "cert-manager chart version."
  type        = string
  default     = "v1.17.2"
}

variable "external_secrets_version" {
  description = "external-secrets chart version."
  type        = string
  default     = "0.16.1"
}
