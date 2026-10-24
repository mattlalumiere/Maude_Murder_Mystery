resource "google_dns_managed_zone" "this" {
  count    = var.create_zone ? 1 : 0
  project  = var.project_id
  name     = replace(var.domain_name, ".", "-")
  dns_name = "${var.domain_name}."
  labels   = var.tags

  dnssec_config {
    state = "on"
  }
}

data "google_dns_managed_zone" "existing" {
  count   = var.create_zone ? 0 : 1
  project = var.project_id
  name    = replace(var.domain_name, ".", "-")
}

resource "google_certificate_manager_dns_authorization" "this" {
  count   = var.issue_certificate ? 1 : 0
  project = var.project_id
  name    = replace(var.domain_name, ".", "-")
  domain  = var.domain_name
}

resource "google_certificate_manager_certificate" "this" {
  count   = var.issue_certificate ? 1 : 0
  project = var.project_id
  name    = replace(var.domain_name, ".", "-")

  managed {
    domains            = [var.domain_name]
    dns_authorizations = [google_certificate_manager_dns_authorization.this[0].id]
  }
}

locals {
  zone_name = var.create_zone ? google_dns_managed_zone.this[0].name : data.google_dns_managed_zone.existing[0].name
}
