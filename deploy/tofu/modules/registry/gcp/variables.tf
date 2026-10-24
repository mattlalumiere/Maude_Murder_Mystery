variable "name" {
  description = "Repository id."
  type        = string
}

variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "keep_last_images" {
  description = "Number of versions retained."
  type        = number
  default     = 30
}

variable "pull_principal_ids" {
  description = "IAM members granted reader (for example the GKE node service account member)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags or labels applied to every resource."
  type        = map(string)
  default     = {}
}

