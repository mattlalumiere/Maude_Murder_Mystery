provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_client_config" "this" {}

locals {
  tags = merge({
    project     = "maude"
    environment = var.name
    managed_by  = "opentofu"
  }, var.tags)

  secret_suffixes = ["database-url", "auth-secret", "ai-api-key", "cleanup-token"]
  secret_names    = flatten([for c in keys(var.cells) : [for s in local.secret_suffixes : "${c}/${s}"]])
  db_secret_names = [for c in keys(var.cells) : "${c}/database-url"]
}

module "network" {
  source     = "../../modules/network/gcp"
  name       = var.name
  project_id = var.project_id
  region     = var.region
  tags       = local.tags
}

module "kubernetes" {
  source            = "../../modules/kubernetes/gcp"
  name              = var.name
  project_id        = var.project_id
  region            = var.region
  network_name      = module.network.network_name
  subnetwork_name   = module.network.subnetwork_name
  node_machine_type = var.node_machine_type
  node_min          = var.node_min
  node_max          = var.node_max
  api_allowed_cidrs = var.api_allowed_cidrs
  tags              = local.tags
}

provider "kubernetes" {
  host                   = module.kubernetes.cluster_endpoint
  cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
  token                  = data.google_client_config.this.access_token
}

provider "helm" {
  kubernetes {
    host                   = module.kubernetes.cluster_endpoint
    cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
    token                  = data.google_client_config.this.access_token
  }
}

module "registry" {
  source             = "../../modules/registry/gcp"
  name               = "${var.name}-web"
  project_id         = var.project_id
  region             = var.region
  pull_principal_ids = [module.kubernetes.node_principal_id]
  tags               = local.tags
}

module "observability" {
  source      = "../../modules/observability/gcp"
  name        = var.name
  project_id  = var.project_id
  alert_email = var.alert_email
}

module "dns_certs" {
  source      = "../../modules/dns_certs/gcp"
  domain_name = var.domain_name
  project_id  = var.project_id
  create_zone = var.create_zone
  tags        = local.tags
}

module "postgres" {
  source                         = "../../modules/postgres/gcp"
  for_each                       = var.cells
  name                           = "${var.name}-${each.key}"
  project_id                     = var.project_id
  region                         = var.region
  network_id                     = module.network.network_id
  private_services_connection_id = module.network.private_services_connection_id
  size                           = var.database_size
  tags                           = local.tags
}

module "object_storage" {
  source            = "../../modules/object_storage/gcp"
  for_each          = var.cells
  name              = "${var.name}-${each.key}-${var.bucket_suffix}"
  project_id        = var.project_id
  region            = var.region
  ttl_hours         = var.ttl_hours
  workload_identity = module.kubernetes.workload_identity
  service_accounts  = [{ namespace = "${var.namespace_prefix}${each.key}", name = "maude" }]
  tags              = local.tags
}

module "secrets" {
  source             = "../../modules/secrets/gcp"
  name               = var.name
  project_id         = var.project_id
  secret_names       = local.secret_names
  secret_value_names = local.db_secret_names
  secret_values      = { for c in keys(var.cells) : "${c}/database-url" => module.postgres[c].connection_url }
  reader             = { namespace = "external-secrets", name = "external-secrets" }
  workload_identity  = module.kubernetes.workload_identity
  tags               = local.tags
}

module "addons" {
  source                       = "../../cells/modules/addons"
  external_secrets_annotations = module.secrets.reader_annotations
  depends_on                   = [module.kubernetes]
}

module "region" {
  source           = "../../cells/region"
  region_id        = var.region
  chart_path       = var.chart_path
  values_files     = ["${var.chart_path}/values-gcp.yaml"]
  image_repository = var.image_repository_override != "" ? var.image_repository_override : module.registry.repository_url
  namespace_prefix = var.namespace_prefix

  cells = { for k, c in var.cells : k => {
    image_tag    = c.image_tag
    replicas     = c.replicas
    max_replicas = c.max_replicas
    ingress_host = c.hostname
    extra_values = {
      networkPolicy = { egress = {
        store = { cidrs = module.network.private_cidr_blocks, port = 5432 }
        blob  = { cidrs = ["0.0.0.0/0"], port = 443 }
        ai    = { cidrs = ["0.0.0.0/0"], port = 443 }
      } }
    }
  } }

  cell_infra = { for k, c in var.cells : k => {
    config = {
      CELL_ID             = k
      S3_BUCKET           = module.object_storage[k].bucket_name
      S3_REGION           = module.object_storage[k].region
      S3_ENDPOINT         = module.object_storage[k].endpoint
      S3_FORCE_PATH_STYLE = module.object_storage[k].force_path_style
      AI_BASE_URL         = var.ai_base_url
      AI_MODEL            = var.ai_model
      GAME_TTL_HOURS      = tostring(var.ttl_hours)
    }
    service_account_annotations = module.object_storage[k].service_account_annotations
    secret_remote_keys = {
      DATABASE_URL  = module.secrets.secret_ids["${k}/database-url"]
      AUTH_SECRET   = module.secrets.secret_ids["${k}/auth-secret"]
      AI_API_KEY    = module.secrets.secret_ids["${k}/ai-api-key"]
      CLEANUP_TOKEN = module.secrets.secret_ids["${k}/cleanup-token"]
    }
  } }

  depends_on = [module.addons]
}
