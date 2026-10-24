# Cluster addons that are identical on every cloud. Only annotations differ.
resource "helm_release" "traefik" {
  count            = var.install_ingress_controller ? 1 : 0
  name             = "traefik"
  namespace        = "traefik"
  create_namespace = true
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  version          = var.traefik_version

  values = [yamlencode({
    ingressClass = { enabled = true, isDefaultClass = true, name = "traefik" }
    service      = { annotations = var.ingress_service_annotations }
    deployment   = { replicas = 2 }
    providers    = { kubernetesIngress = { publishedService = { enabled = true } } }
  })]
}

resource "helm_release" "cert_manager" {
  count            = var.install_cert_manager ? 1 : 0
  name             = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = var.cert_manager_version

  values = [yamlencode({
    crds = { enabled = true }
  })]
}

resource "helm_release" "external_secrets" {
  count            = var.install_external_secrets ? 1 : 0
  name             = "external-secrets"
  namespace        = "external-secrets"
  create_namespace = true
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.external_secrets_version

  values = [yamlencode({
    serviceAccount = {
      name        = "external-secrets"
      annotations = var.external_secrets_annotations
    }
  })]
}
