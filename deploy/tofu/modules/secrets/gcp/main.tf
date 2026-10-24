locals {
  safe = { for n in var.secret_names : n => replace("${var.name}-${n}", "/[^A-Za-z0-9_-]/", "-") }
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.safe
  project   = var.project_id
  secret_id = each.value
  labels    = var.tags

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = toset(var.secret_value_names)
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = var.secret_values[each.key]
}

resource "google_service_account" "reader" {
  project      = var.project_id
  account_id   = substr("${var.name}-secrets", 0, 30)
  display_name = "${var.name} secrets reader"
}

resource "google_secret_manager_secret_iam_member" "reader" {
  for_each  = google_secret_manager_secret.this
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.reader.email}"
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.reader.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity["workload_pool"]}[${var.reader.namespace}/${var.reader.name}]"
}
