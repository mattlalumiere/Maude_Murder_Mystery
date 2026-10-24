# Platform documentation

Index and overview for the portable multi-game platform. The binding rules are in [CONTRACT.md](CONTRACT.md) and [../../AGENTS.md](../../AGENTS.md).

## Acceptance checklist (written first)

The docs written by W1 must answer these questions. Each is ticked at the end of the work, with the place that answers it.

- [x] What are the main parts of the system and who talks to whom? ([architecture.md](architecture.md), context and container diagrams)
- [x] What happens on create game, join, poll state, host action and AI generation? ([architecture.md](architecture.md), request flows)
- [x] What is a cell, what is a region, and how is a game placed? ([architecture.md](architecture.md), cell and region model)
- [x] How do we add a cell, add a region, and find a game from its join code? ([architecture.md](architecture.md))
- [x] Where does state, blob and AI data flow, and what is secret? ([architecture.md](architecture.md), data flow)
- [x] What happens when AI is down, the store is slow or a cell is full? ([architecture.md](architecture.md), failure modes)
- [x] What is intentionally not built yet? ([architecture.md](architecture.md), not built)
- [x] For each concern, what do local, AWS, Azure and GCP use, and where do we accept a cloud adapter? ([portability-matrix.md](portability-matrix.md))
- [x] Why OpenTofu, and is there something better? ([ADR-0001](adr/ADR-0001-iac-opentofu.md))
- [x] Why Kubernetes and Helm, ports and adapters, cells, Postgres, S3 API, polling, standalone container, Auth.js, OpenAI-compatible AI, secrets, multi-region, legacy deprecation? ([adr/README.md](adr/README.md))
- [x] What do the terms mean? ([glossary.md](glossary.md))
- [x] How does an agent work here (TDD loop, ownership, feedback)? (section below)
- [x] Where is every other platform doc? (index below)

## Overview (one page)

Murder Mystery Night is a party game. An AI Game Master knows the solution, phones show private cards, and a TV shows the shared scene. The platform turns the single Next.js app in `web/` into a service that can host 10,000+ concurrent games.

The shape in one paragraph: one container image (`maude-web`, Next.js standalone) runs everywhere. It depends only on ports (`Store`, `MediaStore`, `TextModel`, `ImageModel`, `Moderator`, `Clock`, `Ids`). Adapters are chosen by environment variables. Locally the adapters are files and a model server on the Mac. In a cloud they are Postgres, an S3-compatible bucket and an OpenAI-compatible model endpoint. A game lives in exactly one cell (web pods, a Postgres, a bucket prefix) for its whole life. A thin directory maps the short join code to the `gameId` and its cell. Scale is added by adding cells, regions are sets of cells, and the same Helm chart deploys to EKS, AKS, GKE and local kind. Infrastructure is OpenTofu modules with one interface per concern and one implementation per cloud.

Priority for this iteration: specs, then tests, then a local environment ready for first user testing. Cloud code is validated (`tofu validate`, `helm lint`) and never applied.

## How to work here (agents)

### TDD loop

1. Read [CONTRACT.md](CONTRACT.md) and [../../AGENTS.md](../../AGENTS.md) completely.
2. Find the behaviour in [specs/](specs/) (domain, API, Gherkin in `web/features/`).
3. Write the failing test or scenario first (Vitest project `unit`, `contract`, `security` or `scale`; Cucumber for BDD; Playwright for E2E).
4. Run it and watch it fail for the right reason.
5. Write the smallest code that passes. Keep ports small, adapters thin.
6. Run `npm run typecheck` and `npm test` in `web/`. Break the behaviour on purpose once to prove the test can fail.
7. Report which tests you wrote first.

### Ownership

Each workstream owns its paths exclusively (table in [CONTRACT.md](CONTRACT.md)). Never edit a file you do not own. Unrelated failures caused by another agent editing at the same time are transient: note them, do not fix them.

### Feedback files

- Need a change in someone else's files: write `docs/platform/feedback/to-<owner>-from-<you>.md` with what, why and a suggested diff. Continue with a local stub.
- Need a dependency, npm script or env var: write `docs/platform/feedback/requests-<workstream>.md`.
- Disagree with the contract: follow it and leave a note in `docs/platform/feedback/`.
- Decisions that outlive a chat go into an ADR (propose it to W1 through feedback).

### Style reminders

No em dashes anywhere. Secrecy, spend and safety rules from AGENTS.md always apply. Do not commit or push. Do not run anything against a real cloud account.

## Index of platform docs

| Doc | Owner | Purpose |
|---|---|---|
| [CONTRACT.md](CONTRACT.md) | lead | Binding build contract |
| [README.md](README.md) | W1 | This index |
| [architecture.md](architecture.md) | W1 | Diagrams, flows, cells, failure modes |
| [portability-matrix.md](portability-matrix.md) | W1 | Concern by environment table |
| [glossary.md](glossary.md) | W1 | Terms |
| [adr/README.md](adr/README.md) | W1 | ADR index with status |
| [specs/](specs/) | W2 | Domain, API and behaviour specs |
| [../../web/features/](../../web/features/) | W2 | Gherkin scenarios |
| [design/](design/) | W6 | Design system, theme, tokens |
| [local-environment.md](local-environment.md) | W8 | Colima, compose, make targets |
| [cloud-deployment.md](cloud-deployment.md) | W9 | OpenTofu, Helm, kind, per-cloud notes |
| [security/](security/) | W10 | Threat model, tenancy, quotas |
| [scale/](scale/) | W10 | Capacity model, limits, 10,000 game extrapolation |
| [testing/](testing/) | T1 to T5 | Test strategy and reports |
| [reviews/](reviews/) | S1 to S5 | Supervisor findings and owners |
| [feedback/](feedback/) | all | Cross-workstream requests |
