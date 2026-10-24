resource "google_artifact_registry_repository" "this" {
  project       = var.project_id
  location      = var.region
  repository_id = var.name
  format        = "DOCKER"
  labels        = var.tags

  docker_config {
    immutable_tags = true
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.keep_last_images
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "pull" {
  count      = length(var.pull_principal_ids)
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.this.name
  role       = "roles/artifactregistry.reader"
  member     = var.pull_principal_ids[count.index]
}
