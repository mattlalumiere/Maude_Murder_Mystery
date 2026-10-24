variable "hostname" {
  description = "Public host name players use, for example play.example.com."
  type        = string
}

variable "endpoints" {
  description = "One entry per region: the regional ingress DNS name, the cloud region it lives in, and a weight."
  type = map(object({
    target = string
    region = string
    weight = optional(number, 100)
  }))
}


variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "zone_id" {
  description = "Cloud DNS managed zone name (dns_certs output zone_id)."
  type        = string
}
