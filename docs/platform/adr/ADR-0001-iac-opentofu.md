# ADR-0001: Use OpenTofu for infrastructure as code

- Status: accepted
- Date: 2026-10-20

## Context

We need one way to describe clusters, databases, buckets, DNS and identity on AWS, Azure and GCP, validated by agents without applying anything. Candidates: OpenTofu, Terraform, Pulumi, Crossplane.

## Decision

Use OpenTofu 1.x with modules in `deploy/tofu`: one module interface per concern, one implementation per cloud. Avoid Terraform-only features so HCL stays compatible both ways.

## Options considered

- OpenTofu: open source (MPL), Linux Foundation governed, HCL compatible with Terraform, same provider ecosystem, `tofu validate` works offline. Chosen.
- Terraform: same language, but BUSL license and single vendor control. No technical gain for us, so no reason to pay the licensing risk.
- Pulumi: real programming languages, nice tests, but a second language runtime and state service to learn, and weaker as shared reading material for ops people. Good if infrastructure needed heavy logic; ours does not.
- Crossplane: manages cloud resources as Kubernetes objects. Elegant, but it needs a running control plane cluster before anything exists (bootstrap problem), adds a large operator surface, and cannot be validated offline as cheaply.

## Is there a better solution?

Honest answer: not for this problem. The infrastructure is small and mostly declarative (cluster, Postgres, bucket, DNS, identity, a Helm release). The risk is not the tool but divergence between clouds, which is solved by the module interface and by keeping everything inside the cluster in one Helm chart. Revisit Crossplane only if we later offer self service provisioning of cells by tenants from inside Kubernetes; revisit Pulumi if module logic grows beyond what HCL expresses cleanly. Neither is true today.

## Consequences

- Agents run `tofu validate` and `tofu fmt`; humans run plan and apply.
- State backend is per environment and out of scope here.
- Provider versions are pinned.
