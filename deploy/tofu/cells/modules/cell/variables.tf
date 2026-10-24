variable "cell_id" {
  description = "Cell id, for example aws-use1-0. Becomes CELL_ID and part of the namespace."
  type        = string
}

variable "region_id" {
  description = "Region id, becomes REGION_ID."
  type        = string
}

variable "namespace_prefix" {
  description = "Namespace is namespace_prefix + cell_id. Must match the prefix used when granting workload identity."
  type        = string
  default     = "maude-"
}

variable "chart_path" {
  description = "Path to the Helm chart."
  type        = string
}

variable "values_files" {
  description = "Values files applied first, in order (for example values.yaml is implicit; pass values-aws.yaml)."
  type        = list(string)
  default     = []
}

variable "image_repository" {
  description = "Container image repository (registry module output repository_url)."
  type        = string
}

variable "image_tag" {
  description = "Image tag or digest-pinned tag."
  type        = string
}

variable "replicas" {
  description = "Minimum replicas (HPA min)."
  type        = number
  default     = 3
}

variable "max_replicas" {
  description = "Maximum replicas (HPA max)."
  type        = number
  default     = 36
}

variable "config" {
  description = "Non-secret environment for the ConfigMap (S3_BUCKET, S3_ENDPOINT, AI_BASE_URL and so on)."
  type        = map(string)
  default     = {}
}

variable "service_account_annotations" {
  description = "Workload identity annotations (object_storage module output)."
  type        = map(string)
  default     = {}
}

variable "pod_labels" {
  description = "Extra pod labels (for example azure.workload.identity/use)."
  type        = map(string)
  default     = {}
}

variable "secret_remote_keys" {
  description = "Env name to remote secret key for external-secrets. Empty disables ExternalSecret (secrets.mode existing)."
  type        = map(string)
  default     = {}
}

variable "ingress_host" {
  description = "Host name served by this cell's ingress. Empty disables ingress."
  type        = string
  default     = ""
}

variable "extra_values" {
  description = "Any other Helm values, merged last."
  type        = any
  default     = {}
}

variable "wait" {
  description = "Wait for the release to become ready."
  type        = bool
  default     = true
}
