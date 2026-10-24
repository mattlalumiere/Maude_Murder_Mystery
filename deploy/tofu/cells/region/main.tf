# Fans the cell module out over var.cells. Capacity is added by adding map entries.
check "infra_matches_cells" {
  assert {
    condition     = toset(keys(var.cells)) == toset(keys(var.cell_infra))
    error_message = "cells and cell_infra must have exactly the same keys."
  }
}

module "cell" {
  source   = "../modules/cell"
  for_each = var.cells

  cell_id          = each.key
  region_id        = var.region_id
  namespace_prefix = var.namespace_prefix
  chart_path       = var.chart_path
  values_files     = var.values_files
  image_repository = var.image_repository
  image_tag        = each.value.image_tag
  replicas         = each.value.replicas
  max_replicas     = each.value.max_replicas
  ingress_host     = each.value.ingress_host
  extra_values     = each.value.extra_values

  config                      = var.cell_infra[each.key].config
  service_account_annotations = var.cell_infra[each.key].service_account_annotations
  pod_labels                  = var.cell_infra[each.key].pod_labels
  secret_remote_keys          = var.cell_infra[each.key].secret_remote_keys
}
