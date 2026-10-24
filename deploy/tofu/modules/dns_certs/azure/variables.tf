variable "domain_name" {
  description = "Zone apex, for example maude.example.com."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group."
  type        = string
}

variable "create_zone" {
  description = "Create the DNS zone (false to look up an existing one)."
  type        = bool
  default     = true
}

variable "issue_certificate" {
  description = "Accepted for parity. Certificates come from cert-manager (Let's Encrypt DNS01) on Azure."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

