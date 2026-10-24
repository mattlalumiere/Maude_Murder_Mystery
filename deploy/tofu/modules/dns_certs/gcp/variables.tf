variable "domain_name" {
  description = "Zone apex, for example maude.example.com."
  type        = string
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "create_zone" {
  description = "Create the managed zone (false to look up an existing one)."
  type        = bool
  default     = true
}

variable "issue_certificate" {
  description = "Issue a Google managed certificate map entry for the domain (for the global LB). cert-manager is the portable alternative."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

