locals {
  expiry_days = ceil(var.ttl_hours / 24) + 1
  members     = { for sa in var.service_accounts : "${sa.namespace}-${sa.name}" => "serviceAccount:${var.workload_identity["workload_pool"]}[${sa.namespace}/${sa.name}]" }
}

resource "google_storage_bucket" "this" {
  project                     = var.project_id
  name                        = var.name
  location                    = var.region
  force_destroy               = var.force_destroy
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.tags

  # Encrypted at rest with Google-managed keys by default. Set default_kms_key_name for CMEK.

  lifecycle_rule {
    condition {
      age = local.expiry_days
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }
}

resource "google_service_account" "workload" {
  project      = var.project_id
  account_id   = substr("${var.name}-web", 0, 30)
  display_name = "${var.name} web pods"
}

resource "google_storage_bucket_iam_member" "workload" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.workload.email}"
}

resource "google_service_account_iam_member" "workload_identity" {
  for_each           = local.members
  service_account_id = google_service_account.workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = each.value
}
