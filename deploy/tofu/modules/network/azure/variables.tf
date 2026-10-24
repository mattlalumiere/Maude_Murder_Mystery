variable "name" {
  description = "Name prefix for all resources."
  type        = string
}

variable "cidr" {
  description = "VNet CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Accepted for interface parity. Azure subnets are regional; zones are chosen on node pools."
  type        = number
  default     = 3
}

variable "location" {
  description = "Azure region, for example westeurope."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
