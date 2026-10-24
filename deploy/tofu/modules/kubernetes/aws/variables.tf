variable "name" {
  description = "Cluster name."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes minor version."
  type        = string
  default     = "1.33"
}

variable "private_subnet_ids" {
  description = "Private subnets for nodes and the control plane ENIs."
  type        = list(string)
}

variable "node_instance_types" {
  description = "Instance types for the managed node group."
  type        = list(string)
  default     = ["m7g.large"]
}

variable "node_ami_type" {
  description = "AMI type matching the instance architecture (AL2023_ARM_64_STANDARD for Graviton)."
  type        = string
  default     = "AL2023_ARM_64_STANDARD"
}

variable "node_min" {
  description = "Minimum nodes."
  type        = number
  default     = 3
}

variable "node_max" {
  description = "Maximum nodes."
  type        = number
  default     = 12
}

variable "node_desired" {
  description = "Initial desired nodes (autoscaling takes over)."
  type        = number
  default     = 3
}

variable "public_endpoint" {
  description = "Expose the API server publicly (restricted by api_allowed_cidrs)."
  type        = bool
  default     = true
}

variable "api_allowed_cidrs" {
  description = "CIDRs allowed to reach the public API endpoint."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
