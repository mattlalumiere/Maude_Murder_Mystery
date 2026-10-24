variable "domain_name" {
  description = "Zone apex, for example maude.example.com."
  type        = string
}

variable "create_zone" {
  description = "Create the hosted zone (false to look up an existing one)."
  type        = bool
  default     = true
}

variable "issue_certificate" {
  description = "Issue an ACM certificate for the domain and a wildcard (for ALB). cert-manager is the portable alternative."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

