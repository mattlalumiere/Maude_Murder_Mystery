provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

# Same cell machinery as the clouds, minus every cloud module: file adapters, no secrets.
module "region" {
  source           = "../../cells/region"
  region_id        = "local"
  chart_path       = var.chart_path
  values_files     = ["${var.chart_path}/values-local.yaml"]
  image_repository = var.image_repository

  cells = { for k, c in var.cells : k => {
    image_tag    = c.image_tag
    replicas     = c.replicas
    max_replicas = c.max_replicas
  } }

  cell_infra = { for k, c in var.cells : k => {
    config = { CELL_ID = k }
  } }
}
