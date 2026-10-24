# W8 to W7: PUBLIC_BASE_URL for join links and QR codes

Today `HostConsole.tsx` (`joinUrl`, handoff link) and `screen/[code]/page.tsx` (QR) build URLs from
`location.origin`. If the host opens the console at `http://localhost:3000`, every QR code and join link
says `localhost`, which a phone cannot reach. Workaround in the docs: open the console and the TV screen
via the Mac LAN IP (`http://192.168.x.y:3000`). Printed by `make up`.

Proposal (add `PUBLIC_BASE_URL` to the contract env table, optional, default unset):

1. Server exposes it: add `publicBaseUrl: process.env.PUBLIC_BASE_URL || null` to `publicView` or a tiny
   `GET /api/config` route (not secret).
2. Client helper in `web/src/lib/client.ts`: `export const baseUrl = (cfg) => (cfg.publicBaseUrl ?? location.origin).replace(/\/$/, "")`
   and use it for join URL, handoff URL and QR text.
3. Fallback when unset and `location.hostname` is `localhost` or `127.0.0.1`: show a hint "Open this page via your
   LAN address so phones can join".

`deploy/local/docker-compose.yml` already passes `PUBLIC_BASE_URL` through to the container.
