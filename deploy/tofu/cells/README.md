# Cells

A cell is the unit of scale and isolation: web pods, one PostgreSQL, one bucket, one namespace, serving up to 2,000 active games (CONTRACT). A game lives in exactly one cell. Capacity grows by adding cells, never by growing one store.

## What one cell is made of

| Part | Created by | Keyed by |
|---|---|---|
| Namespace `maude-<cell>`, Helm release | `cells/modules/cell` | cell id |
| PostgreSQL | `modules/postgres/<cloud>` via `for_each` in the env | cell id |
| Bucket and workload identity | `modules/object_storage/<cloud>` via `for_each` | cell id |
| Secrets (`<cell>/database-url` and so on) | `modules/secrets/<cloud>` | cell id |

Tenant keys inside the bucket are still `{cell}/games/{gameId}/{kind}/{name}` (the app enforces it), so a shared bucket would also work; a bucket per cell is the default because deleting or isolating a cell is then one operation and IAM can be scoped per cell.

## Add a cell

Add a key to `cells` in the env `terraform.tfvars` and apply:

```hcl
cells = {
  "aws-use1-0" = { image_tag = "0.1.0", hostname = "use1-0.maude.example.com" }
  "aws-use1-1" = { image_tag = "0.1.0", hostname = "use1-1.maude.example.com" }
}
```

The `for_each` loops create the database, bucket, identity, secrets, namespace and release. Then register the cell in the global directory (below).

## Add a region

Copy the env (`envs/aws` to a new state with its own `region`, `name` and cell ids) or call the env's modules from a root per region. Each region is a separate state so a regional outage or bad apply never touches another region. Add the region's ingress name to the global routing endpoints.

## Global directory and routing

The directory (join `code` to `gameId` and cell) is application data, not infrastructure: see W3/W10 docs. Infrastructure only needs two global things:

1. DNS or traffic steering so players reach a healthy region: `modules/global_routing` (Route 53, Traffic Manager or Cloud DNS). This is the single place with cloud specific services, hidden behind one interface (`hostname`, `endpoints`).
2. Joining a game whose cell is in another region: the receiving region either proxies to the owning cell host name (`<cell>.maude.example.com`) or returns a redirect. Every cell therefore keeps its own stable host name (`ingress_host`), independent of the global name.

Directory notes for routing:
- The short join code resolves to `{cellId, gameId}` with an O(1) lookup. Embed the cell in the host name, not the code, so codes stay short.
- Keep the directory replicated read-mostly (small rows). Writes happen at game creation in the owning cell's region.
- A cell can be drained: stop creating games there (flip a flag in the directory), wait for `GAME_TTL_HOURS`, then remove the key from `cells`.
