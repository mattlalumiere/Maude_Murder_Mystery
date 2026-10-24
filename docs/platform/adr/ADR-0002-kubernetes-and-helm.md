# ADR-0002: Kubernetes and Helm are the one packaging

- Status: accepted
- Date: 2026-10-20

## Context

We must run on EKS, AKS, GKE and locally, without code changes.

## Decision

Package the app as one OCI image (`maude-web`) and one Helm chart (`deploy/helm/maude`). Environment differences live in values files. Locally, docker compose runs the same image for daily work, and kind runs the chart to prove it.

## Alternatives

- ECS, Cloud Run, Container Apps: simpler, but three different deployment models, which defeats portability.
- Plain manifests or Kustomize: workable, but Helm values map better to cell instances (one release per cell).
- Nomad or Swarm: less common, fewer managed offerings.

## Consequences

- One chart, values per cloud and per cell. No template forks per cloud.
- Operators need Kubernetes skills. Acceptable for the target scale.
- `helm lint` and `helm template` are the validation gates.
