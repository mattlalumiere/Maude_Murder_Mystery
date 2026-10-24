# Latency based routing with health checks: a failed region drops out of DNS answers.
resource "aws_route53_health_check" "this" {
  for_each          = var.endpoints
  fqdn              = each.value.target
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/readyz"
  failure_threshold = 3
  request_interval  = 30
}

resource "aws_route53_record" "this" {
  for_each        = var.endpoints
  zone_id         = var.zone_id
  name            = var.hostname
  type            = "CNAME"
  ttl             = 30
  records         = [each.value.target]
  set_identifier  = each.key
  health_check_id = aws_route53_health_check.this[each.key].id

  latency_routing_policy {
    region = each.value.region
  }
}
