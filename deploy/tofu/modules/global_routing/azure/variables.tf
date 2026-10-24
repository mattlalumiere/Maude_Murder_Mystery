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


variable "resource_group_name" {
  description = "Resource group for Traffic Manager and the DNS zone."
  type        = string
}

variable "zone_name" {
  description = "Azure DNS zone name that contains the host name."
  type        = string
}

variable "relative_name" {
  description = "Record name relative to the zone, for example play."
  type        = string
}
