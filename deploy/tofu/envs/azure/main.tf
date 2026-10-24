provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

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
  source   = "../../modules/network/azure"
  name     = var.name
  cidr     = var.cidr
  location = var.location
  tags     = local.tags
}

module "observability" {
  source              = "../../modules/observability/azure"
  name                = var.name
  location            = var.location
  resource_group_name = module.network.resource_group_name
  alert_email         = var.alert_email
  tags                = local.tags
}

module "kubernetes" {
  source                     = "../../modules/kubernetes/azure"
  name                       = var.name
  location                   = var.location
  resource_group_name        = module.network.resource_group_name
  private_subnet_ids         = module.network.private_subnet_ids
  node_vm_size               = var.node_vm_size
  node_min                   = var.node_min
  node_max                   = var.node_max
  api_allowed_cidrs          = var.api_allowed_cidrs
  admin_group_object_ids     = var.admin_group_object_ids
  log_analytics_workspace_id = module.observability.log_workspace_id
  tags                       = local.tags
}

provider "kubernetes" {
  host                   = module.kubernetes.cluster_endpoint
  cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "kubelogin"
    args        = ["get-token", "--login", "azurecli", "--server-id", "6dae42f8-4368-4678-94ff-3960e28e3630"]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.kubernetes.cluster_endpoint
    cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "kubelogin"
      args        = ["get-token", "--login", "azurecli", "--server-id", "6dae42f8-4368-4678-94ff-3960e28e3630"]
    }
  }
}

module "registry" {
  source              = "../../modules/registry/azure"
  name                = "${var.name}${var.name_suffix}"
  location            = var.location
  resource_group_name = module.network.resource_group_name
  pull_principal_ids  = [module.kubernetes.node_principal_id]
  tags                = local.tags
}

module "dns_certs" {
  source              = "../../modules/dns_certs/azure"
  domain_name         = var.domain_name
  resource_group_name = module.network.resource_group_name
  create_zone         = var.create_zone
  tags                = local.tags
}

module "postgres" {
  source              = "../../modules/postgres/azure"
  for_each            = var.cells
  name                = "${var.name}-${each.key}-${var.name_suffix}"
  location            = var.location
  resource_group_name = module.network.resource_group_name
  database_subnet_ids = module.network.database_subnet_ids
  private_dns_zone_id = module.network.postgres_private_dns_zone_id
  size                = var.database_size
  tags                = local.tags
}

module "object_storage" {
  source              = "../../modules/object_storage/azure"
  for_each            = var.cells
  name                = "${var.name}${replace(each.key, "-", "")}${var.name_suffix}"
  location            = var.location
  resource_group_name = module.network.resource_group_name
  ttl_hours           = var.ttl_hours
  workload_identity   = module.kubernetes.workload_identity
  service_accounts    = [{ namespace = "${var.namespace_prefix}${each.key}", name = "maude" }]
  tags                = local.tags
}

module "secrets" {
  source              = "../../modules/secrets/azure"
  name                = "${var.name}-kv-${var.name_suffix}"
  location            = var.location
  resource_group_name = module.network.resource_group_name
  secret_names        = local.secret_names
  secret_value_names  = local.db_secret_names
  secret_values       = { for c in keys(var.cells) : "${c}/database-url" => module.postgres[c].connection_url }
  reader              = { namespace = "external-secrets", name = "external-secrets" }
  workload_identity   = module.kubernetes.workload_identity
  tags                = local.tags
}

module "addons" {
  source                       = "../../cells/modules/addons"
  external_secrets_annotations = module.secrets.reader_annotations
  depends_on                   = [module.kubernetes]
}

module "region" {
  source           = "../../cells/region"
  region_id        = var.location
  chart_path       = var.chart_path
  values_files     = ["${var.chart_path}/values-azure.yaml"]
  image_repository = var.image_repository_override != "" ? var.image_repository_override : module.registry.repository_url
  namespace_prefix = var.namespace_prefix

  cells = { for k, c in var.cells : k => {
    image_tag    = c.image_tag
    replicas     = c.replicas
    max_replicas = c.max_replicas
    ingress_host = c.hostname
    extra_values = {
      networkPolicy = { egress = {
        store = { cidrs = [module.network.network_cidr], port = 5432 }
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
    pod_labels                  = { "azure.workload.identity/use" = "true" }
    secret_remote_keys = {
      DATABASE_URL  = module.secrets.secret_ids["${k}/database-url"]
      AUTH_SECRET   = module.secrets.secret_ids["${k}/auth-secret"]
      AI_API_KEY    = module.secrets.secret_ids["${k}/ai-api-key"]
      CLEANUP_TOKEN = module.secrets.secret_ids["${k}/cleanup-token"]
    }
  } }

  depends_on = [module.addons]
}
