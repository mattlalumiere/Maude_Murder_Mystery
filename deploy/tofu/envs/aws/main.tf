provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
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
  source   = "../../modules/network/aws"
  name     = var.name
  cidr     = var.cidr
  az_count = var.az_count
}

module "kubernetes" {
  source              = "../../modules/kubernetes/aws"
  name                = var.name
  private_subnet_ids  = module.network.private_subnet_ids
  node_instance_types = var.node_instance_types
  node_min            = var.node_min
  node_max            = var.node_max
  api_allowed_cidrs   = var.api_allowed_cidrs
}

provider "kubernetes" {
  host                   = module.kubernetes.cluster_endpoint
  cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.kubernetes.cluster_name, "--region", var.region]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.kubernetes.cluster_endpoint
    cluster_ca_certificate = base64decode(module.kubernetes.cluster_ca_certificate)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.kubernetes.cluster_name, "--region", var.region]
    }
  }
}

module "registry" {
  source = "../../modules/registry/aws"
  name   = "${var.name}-web"
}

module "observability" {
  source      = "../../modules/observability/aws"
  name        = var.name
  alert_email = var.alert_email
}

module "dns_certs" {
  source      = "../../modules/dns_certs/aws"
  domain_name = var.domain_name
  create_zone = var.create_zone
}

module "postgres" {
  source              = "../../modules/postgres/aws"
  for_each            = var.cells
  name                = "${var.name}-${each.key}"
  network_id          = module.network.network_id
  database_subnet_ids = module.network.database_subnet_ids
  allowed_cidrs       = module.network.private_cidr_blocks
  size                = var.database_size
}

module "object_storage" {
  source            = "../../modules/object_storage/aws"
  for_each          = var.cells
  name              = "${var.name}-${each.key}-${var.bucket_suffix}"
  ttl_hours         = var.ttl_hours
  workload_identity = module.kubernetes.workload_identity
  service_accounts  = [{ namespace = "${var.namespace_prefix}${each.key}", name = "maude" }]
}

module "secrets" {
  source             = "../../modules/secrets/aws"
  name               = var.name
  secret_names       = local.secret_names
  secret_value_names = local.db_secret_names
  secret_values      = { for c in keys(var.cells) : "${c}/database-url" => module.postgres[c].connection_url }
  reader             = { namespace = "external-secrets", name = "external-secrets" }
  workload_identity  = module.kubernetes.workload_identity
}

module "addons" {
  source                       = "../../cells/modules/addons"
  external_secrets_annotations = module.secrets.reader_annotations
  ingress_service_annotations = {
    "service.beta.kubernetes.io/aws-load-balancer-type"   = "nlb"
    "service.beta.kubernetes.io/aws-load-balancer-scheme" = "internet-facing"
  }
  depends_on = [module.kubernetes]
}

module "region" {
  source           = "../../cells/region"
  region_id        = var.region
  chart_path       = var.chart_path
  values_files     = ["${var.chart_path}/values-aws.yaml"]
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
