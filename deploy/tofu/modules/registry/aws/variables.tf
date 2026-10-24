variable "name" {
  description = "Repository name."
  type        = string
}

variable "keep_last_images" {
  description = "Number of images retained."
  type        = number
  default     = 30
}

variable "pull_principal_ids" {
  description = "Accepted for interface parity. EKS nodes already pull through AmazonEC2ContainerRegistryReadOnly."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

