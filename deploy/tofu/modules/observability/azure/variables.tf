variable "name" {
  description = "Prefix for the workspace and action group."
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

