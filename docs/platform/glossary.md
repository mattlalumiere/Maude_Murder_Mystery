# Glossary

| Term | Meaning |
|---|---|
| Game | One party session. In code today a `Room`. Has a `gameId` and a join `code`. |
| gameId | Internal 26 character ULID. Never shown to users. Key for all storage. |
| Join code | 4 to 6 character code shown to users. Resolves to a `gameId` through the directory. |
| Directory | Small global lookup: code to (`gameId`, cell, region). The only cross-game read. O(1). |
| Cell | Independently deployable unit: web pods, a state store, a bucket prefix. About 2,000 active games. |
| Region | A geographic deployment containing many cells. |
| Placement | Choosing the cell (and region) for a new game. Fixed for the game's life. |
| Tenant key | Storage address `{cell}/games/{gameId}/{kind}/{name}`, built only by the shared key builder (W3). |
| Port | A TypeScript interface the app depends on (`Store`, `MediaStore`, `TextModel`, `ImageModel`, `Moderator`, `Clock`, `Ids`). |
| Adapter | An implementation of a port for one environment (memory, file, postgres, s3, openai-compatible, ...). |
| Legacy adapter | DynamoDB, Bedrock and SST code. Works, is marked deprecated, is not extended. |
| Host | The person running the game. Uses the host console. Signs in with Auth.js. |
| Player | A guest. Authenticated by a per-player token. Sees `playerView`. |
| Big screen | The TV surface. Shows `publicView`. |
| Views | `publicView`, `playerView`, `hostView`: the only data clients may receive. |
| Vault | The host's sealed copy of the solution, unlocked by the Host Override Code. |
| Host Override Code | Server-side validated (salted scrypt) code that lets the host see the solution. Never logged or sent to a model. |
| Reveal | The final phase in which truth fields become visible. |
| claim() | The spend gate in `media-runner.ts`. All paid generation goes through it. |
| Degraded mode | Behaviour when a dependency fails: sample case and mock media keep the game playable. |
| Circuit breaker | Fail-fast guard around an external call after repeated failures. |
| OpenTofu | Open source Terraform fork used for infrastructure modules. |
| Helm chart | The single Kubernetes package `deploy/helm/maude`. |
| kind | Kubernetes in Docker, used to test the chart locally. |
| EKS, AKS, GKE | Managed Kubernetes on AWS, Azure and GCP. |
| MADR | Markdown Architectural Decision Records, the ADR format used here. |
