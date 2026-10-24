variable "name" {
  description = "Registry name (alphanumerics only, globally unique)."
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

variable "keep_last_images" {
  description = "Accepted for interface parity. ACR retention is days based for untagged manifests."
  type        = number
  default     = 30
}

variable "pull_principal_ids" {
  description = "Object ids granted AcrPull (the AKS kubelet identity)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

