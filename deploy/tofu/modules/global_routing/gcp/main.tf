# Geo routing policy in Cloud DNS. A global external load balancer is the alternative
# when health based failover is needed; the interface does not change.
resource "google_dns_record_set" "this" {
  project      = var.project_id
  managed_zone = var.zone_id
  name         = "${var.hostname}."
  type         = "CNAME"
  ttl          = 30

  routing_policy {
    dynamic "geo" {
      for_each = var.endpoints
      content {
        location = geo.value.region
        rrdatas  = ["${geo.value.target}."]
      }
    }
  }
}
