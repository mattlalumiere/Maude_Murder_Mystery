variable "name" {
  description = "Prefix for the log bucket and channel."
  type        = string
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "retention_days" {
  description = "Log retention in days."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Email address subscribed to alerts (empty for none)."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

