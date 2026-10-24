# One cell = namespace + Helm release. Its state store and blob bucket are created by the
# caller with the same for_each key and handed in through var.config and annotations.
locals {
  namespace = "${var.namespace_prefix}${var.cell_id}"

  overrides = merge(
    {
      cell      = { id = var.cell_id, region = var.region_id }
      image     = { repository = var.image_repository, tag = var.image_tag }
      config    = var.config
      podLabels = var.pod_labels
      autoscaling = {
        minReplicas = var.replicas
        maxReplicas = var.max_replicas
      }
      serviceAccount = { annotations = var.service_account_annotations }
    },
    length(var.secret_remote_keys) > 0 ? {
      secrets = {
        mode = "externalSecrets"
        externalSecrets = {
          remoteKeys = var.secret_remote_keys
        }
      }
    } : {},
    var.ingress_host != "" ? {
      ingress = {
        enabled = true
        hosts   = [{ host = var.ingress_host, path = "/", pathType = "Prefix" }]
      }
    } : {},
  )
}

resource "kubernetes_namespace" "this" {
  metadata {
    name = local.namespace
    labels = {
      "maude.io/cell"                      = var.cell_id
      "maude.io/region"                    = var.region_id
      "pod-security.kubernetes.io/enforce" = "restricted"
      "pod-security.kubernetes.io/audit"   = "restricted"
    }
  }
}

resource "helm_release" "web" {
  name      = "maude"
  namespace = kubernetes_namespace.this.metadata[0].name
  chart     = var.chart_path
  wait      = var.wait
  timeout   = 600
  atomic    = true

  values = concat(
    [for f in var.values_files : file(f)],
    [yamlencode(merge(local.overrides, var.extra_values))],
  )
}
