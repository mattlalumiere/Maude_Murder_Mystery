variable "name" {
  description = "Name prefix for all resources."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to span."
  type        = number
  default     = 3
}

variable "single_nat_gateway" {
  description = "One NAT gateway (cheap, one AZ dependency) instead of one per AZ."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
