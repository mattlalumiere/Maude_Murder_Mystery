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


variable "zone_id" {
  description = "Route 53 hosted zone id (dns_certs output zone_id)."
  type        = string
}
