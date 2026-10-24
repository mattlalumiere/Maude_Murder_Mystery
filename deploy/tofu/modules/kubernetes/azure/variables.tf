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
  description = "Node subnet (first element is used)."
  type        = list(string)
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group."
  type        = string
}

variable "node_vm_size" {
  description = "VM size for user pool nodes."
  type        = string
  default     = "Standard_D2ps_v6"
}

variable "system_vm_size" {
  description = "VM size for the system pool."
  type        = string
  default     = "Standard_D2ps_v6"
}

variable "zones" {
  description = "Availability zones for node pools."
  type        = list(string)
  default     = ["1", "2", "3"]
}

variable "node_min" {
  description = "Minimum user pool nodes."
  type        = number
  default     = 3
}

variable "node_max" {
  description = "Maximum user pool nodes."
  type        = number
  default     = 12
}

variable "node_desired" {
  description = "Accepted for interface parity (autoscaler manages count)."
  type        = number
  default     = 3
}

variable "public_endpoint" {
  description = "Expose the API server publicly (restricted by api_allowed_cidrs)."
  type        = bool
  default     = true
}

variable "api_allowed_cidrs" {
  description = "CIDRs allowed to reach the API server."
  type        = list(string)
  default     = []
}

variable "log_analytics_workspace_id" {
  description = "Optional workspace id for Container insights."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}

variable "admin_group_object_ids" {
  description = "Entra ID group object ids with cluster admin rights."
  type        = list(string)
  default     = []
}
