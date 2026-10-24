# Local environment (Colima + Docker)

Runs the app in a container with state and media as files on a volume, and text generation from the local model on the Mac. Everything here is driven by `make` from the repo root.

## First-time setup from a clean Mac

```bash
brew install colima docker docker-compose docker-buildx node@22
# make the compose v2 plugin visible to docker (once)
mkdir -p ~/.docker && cat ~/.docker/config.json   # needs "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"]
colima start --cpu 2 --memory 3 --disk 40 --vm-type vz --runtime docker
make doctor      # every line should say ok (the AI line may warn until the model runs)
make up          # builds the image, starts the stack, waits for /api/readyz
make seed        # prints a demo game code (needs dev login, see Known issues)
```

`make up` creates `deploy/local/.env` (git-ignored, mode 600) and generates `AUTH_SECRET` the first time. Nothing secret is committed or baked into the image.

## Memory tradeoff with the 17 GB model

The Mac has 24 GB. The Qwen3-Coder-30B model needs about 17 GB, Colima's VM is 3 GB, and macOS needs the rest. The stack itself is small (measured: web about 45 MB of its 512 MB limit; postgres about 60 MB; the S3 store about 60 MB). To free RAM before a game: quit browsers and IDEs, `ollama stop qwen3.8:27b-mlx`, stop other containers (`docker ps`), and do not run the `s3`, `pg` and `loadtest` profiles at the same time as the model unless needed. If Colima must shrink: `colima stop && colima start --memory 2` (web needs under 512 MB).

Optional GPU wired limit tip, run by you, not by scripts (resets on reboot, needs sudo): `sudo sysctl iogpu.wired_limit_mb=21504`.

## Start the AI server

```bash
/Users/matt/Documents/Development/claude/local-llm/serve-author.sh   # mlx_lm.server on 127.0.0.1:8080
make ai-check                                                         # tiny prompt, prints latency
```

Ollama (`http://127.0.0.1:11434/v1`, model `qwen3.8:27b-mlx`) also works: set `AI_BASE_URL=http://host.docker.internal:11434/v1` and `AI_MODEL=qwen3.8:27b-mlx` in `deploy/local/.env`, then `make up`. If the model is down the game falls back to the sample case.

`host.docker.internal` was verified under Colima (vz): it resolves to `192.168.5.2` inside containers and reaches the host's `127.0.0.1:8080` and `:11434` listeners. The compose file also adds `host.docker.internal:host-gateway` as a safety net. If it ever fails, try `host.lima.internal`.

## Play with 4 phones on the same Wi-Fi

1. `make up` prints the Mac's LAN address, for example `http://192.168.2.77:3000`.
2. On the host laptop and on the TV, open the app through that LAN address, not `localhost`. The app currently builds join links and QR codes from `location.origin`, so a console opened at `localhost` produces QR codes phones cannot reach.
3. Proposed fix: env var `PUBLIC_BASE_URL` (request filed in `docs/platform/feedback/to-W7-from-W8.md`). `deploy/local/.env` already passes it to the container; set it to your LAN URL once the app honours it.
4. macOS firewall: allow incoming connections for Colima/`limactl` if phones cannot connect. Port 3000 is published on all interfaces.

## Profiles

| Command | Adds | Notes |
|---|---|---|
| `make up` | web only | file store and file media on volume `maude_data` |
| `make up PROFILE=s3` | RustFS S3 store plus `bucket-init` job | sets `MEDIA_ADAPTER=s3`, endpoint `http://objectstore:9000`, bucket `maude-media`, path style. MinIO no longer publishes images, so RustFS is used. Console on 127.0.0.1:9001 |
| `make up PROFILE=pg` | postgres:17-alpine on tmpfs | sets `STORE_ADAPTER=postgres` and `DATABASE_URL`. Data is lost on restart by design |
| `make up PROFILE=s3,pg` | both | |
| `docker compose -f deploy/local/docker-compose.yml --profile loadtest run --rm k6` | k6 | runs `deploy/load/$K6_SCRIPT` (default `smoke.js`) against `http://web:3000` |

The app only honours these adapters once workstream W3 lands them; until then `/api/readyz` just reports the configured names.

## Commands

`make help` lists everything. `make test` runs typecheck, unit, contract, security and bdd. `make test-e2e` needs the stack up. `make logs`, `make ps`, `make down` (keeps volumes).

## Reset

`make down` keeps games. `make clean` prints the volumes it would delete and does nothing; `make clean CONFIRM=yes` deletes them (all local games and media). `deploy/local/.env` is kept. To also rebuild from scratch: `docker builder prune` then `make up`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `make up` says docker daemon unreachable | `colima start --cpu 2 --memory 3 --disk 40`; check `docker context show` is `colima` |
| `unknown shorthand flag` or `compose` not found | add the plugin dir to `~/.docker/config.json` (`cliPluginsExtraDirs`) |
| `/api/readyz` returns 503 | `curl localhost:3000/api/readyz` shows which check failed (`store` or `media`); `make logs` |
| Port 3000 busy | set `WEB_PORT=3001` in `deploy/local/.env` (doctor lists busy ports) |
| Games always use the sample case | model not running or unreachable: `make ai-check`, `make doctor` |
| Very slow or OOM-killed generation | memory pressure: see the memory section; reduce concurrency, stop other apps |
| Phones open the page but QR points at localhost | open the host console via the LAN IP (see above) |
| Cannot sign in as host | dev login is disabled in production builds, see Known issues |
| `bucket` job prints 403 or 409 | 409 means it already exists (fine); 403 means S3 keys differ between runs, `make clean CONFIRM=yes` |
| Read-only filesystem errors | only `/data` and `/tmp` are writable; write nowhere else |
| Container restarts forever | `docker compose -f deploy/local/docker-compose.yml logs web`; usually a missing `AUTH_SECRET` (delete `.env` and rerun `make up`) |

## Image facts

`web/Dockerfile` has three stages (deps, build, runtime) on `node:22.12-alpine3.21`, Next.js standalone output, tini as PID 1, non-root uid 10001, `HEALTHCHECK` on `/api/healthz`. Compose runs it read-only with a 64 MB tmpfs `/tmp`, `cap_drop: ALL`, `no-new-privileges`, 512 MB memory limit. Build manually: `docker build -f web/Dockerfile web`. `/api/healthz` is liveness (always 200). `/api/readyz` is readiness (store and blob reachable, adapter names, cell, region, never secrets).

## Known issues

- Dev login does not work in the container: `web/src/auth.ts` disables it whenever `NODE_ENV=production`. Request in `docs/platform/feedback/to-W10-from-W8.md`. Until it lands `make seed` fails at login; the create-game API itself was verified with a hand-minted Auth.js session.
- Join URLs depend on `location.origin` (see above).
- `deploy/load/smoke.js` does not exist yet, so the `loadtest` profile needs a script from the load owner.

## Stray root files (old Express scaffold, to be removed by the owner)

The repo root contains `Dockerfile`, `docker-compose.yml`, `package.json`, `jest.config.js`, `config/`, `src/` and `test/`. They belong to an earlier Express scaffold that does not match the real app (`web/`). They are not used by anything here and no agent has run, extended or deleted them. The root `package.json` even triggers duplicate-key warnings in Vitest because it sits one level above `web/`.
