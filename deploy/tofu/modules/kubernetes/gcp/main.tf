# ADR note: this module builds a regional GKE Standard cluster so node sizing,
# NetworkPolicy and zone spread behave like EKS and AKS. Autopilot is a valid
# alternative (less to operate, per-pod billing) but restricts privileged addons
# and node-level tuning; switch by replacing this module, the interface stays.
resource "google_service_account" "nodes" {
  project      = var.project_id
  account_id   = "${var.name}-nodes"
  display_name = "${var.name} GKE nodes"
}

resource "google_project_iam_member" "nodes" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
  ])
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.nodes.email}"
}

resource "google_container_cluster" "this" {
  project  = var.project_id
  name     = var.name
  location = var.region

  network    = var.network_name
  subnetwork = var.subnetwork_name

  remove_default_node_pool = true
  initial_node_count       = 1
  min_master_version       = var.kubernetes_version
  deletion_protection      = true
  resource_labels          = var.tags

  release_channel {
    channel = "REGULAR"
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = !var.public_endpoint
    master_ipv4_cidr_block  = "172.20.0.0/28"
  }

  dynamic "master_authorized_networks_config" {
    for_each = length(var.api_allowed_cidrs) > 0 ? [1] : []
    content {
      dynamic "cidr_blocks" {
        for_each = var.api_allowed_cidrs
        content {
          cidr_block = cidr_blocks.value
        }
      }
    }
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  addons_config {
    network_policy_config {
      disabled = false
    }
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  monitoring_config {
    managed_prometheus {
      enabled = true
    }
  }
}

resource "google_container_node_pool" "default" {
  project  = var.project_id
  name     = "default"
  location = var.region
  cluster  = google_container_cluster.this.name

  initial_node_count = var.node_desired

  autoscaling {
    min_node_count = var.node_min
    max_node_count = var.node_max
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type    = var.node_machine_type
    service_account = google_service_account.nodes.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    labels          = var.tags

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}
