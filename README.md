# Kvitt

Kvitt is a self-hosted bill-splitting web application for small groups, trips, households, and shared projects.

### Features
- User registration and login with JWT authentication
- Group creation and membership management
- Expense tracking with equal or manual splits
- Balance calculation with settlement support
- Environment-driven phone/Swish settings with configurable phone number format
- Docker-based self-hosted deployment

### Quick start with Docker Compose
```bash
cp .env.example .env
# Edit JWT_SECRET before exposing the app
docker compose up --build
```

The frontend is available on `http://localhost:8080` by default and proxies API calls to the backend.

### Container image tags
The GitHub Actions workflow publishes backend and frontend images to GHCR with predictable tags:

- On `main` pushes: `main`, `main-<run_number>`, `sha-<commit>` (Docker metadata sha tag), and `latest`.
- On `v*` tag pushes: the release tag (for example `v1.4.2`) plus metadata tags.

Image names:

- `ghcr.io/<owner>/<repo>-backend`
- `ghcr.io/<owner>/<repo>-frontend`
- `ghcr.io/<owner>/<repo>-mcp`

Use `main-<run_number>` for immutable CI deployments and `v*` tags for release deployments.

### Version policy
Kvitt uses two related version identifiers:

- `Release`: the deploy tag or image tag currently running, for example `v1.1.0` or `main-482`. This should come from deployment metadata such as `RELEASE_ID`.
- `Version`: the package version stored in `backend/package.json` and `frontend/package.json`.

Policy:

- Bump `backend/package.json` and `frontend/package.json` together for every tagged release.
- Keep backend and frontend on the same semantic version unless there is a clear reason to split them.
- Treat GitHub release tags such as `v1.1.0` as the source of truth for what is deployed.
- Pass the deployed release tag into the backend as `RELEASE_ID` so the admin page shows the exact running release.
- The root `package.json` is workspace metadata and does not currently drive the admin status card.

### Environment variables
| Variable | Container | Default | Description |
| --- | --- | --- | --- |
| `JWT_SECRET` | `backend` | `changeme-use-a-strong-secret` | Secret used to sign and verify JWT tokens. Change this in production. |
| `SESSION_SECRET` | `backend` | _(optional)_ | Optional alias for `JWT_SECRET` used by auth modules. |
| `PORT` | `backend` | `3000` | Backend HTTP port inside the backend container or during local backend development. |
| `FRONTEND_PORT` | Compose (host) | `8080` | Host port mapped to the frontend container. |
| `DB_PATH` | `backend` | `/app/data/kvitt.db` | SQLite database path used by the backend. |
| `TRUST_PROXY` | `backend` | `loopback, linklocal, uniquelocal` | Comma-separated Express proxy IPs/subnets trusted while resolving forwarding headers. The default supports the internal Traefik → nginx → backend path and direct local requests. Keep the backend private and, where possible, replace the defaults with the exact nginx and Traefik network CIDRs/addresses; never use a numeric hop count or `true`. |
| `OAUTH_CIMD_ALLOW_PRIVATE` | `backend` | `false` | Allows CIMD metadata on private IPs only when exactly `true`. Leave disabled in production; this is intended only for isolated local development. DNS results are still pinned for the outbound request. |
| `PASSKEY_RP_ID` | `backend` | `localhost` | WebAuthn relying party ID. Use your domain in production. |
| `PASSKEY_RP_NAME` | `backend` | `Kvitt` | Displayed relying party name for passkey prompts. |
| `PASSKEY_ORIGIN` | `backend` | `http://localhost:5173` | Allowed WebAuthn origin(s), comma-separated if needed. |
| `KVITT_LANGUAGE` | `frontend` (runtime env) | `sv-se` | Active UI language served via runtime config. Current supported value is `sv-se`. |
| `VITE_LANGUAGE` | `frontend` (build env / local dev) | `sv-se` | Build-time fallback language used in local Vite development. |
| `VITE_TAGLINE` | `frontend` (build arg or runtime env) | `Dela kostnader, bli kvitt` | Tagline shown on the login page and in the app header. |
| `KVITT_PHONE_ENABLED` | `backend` and `frontend` runtime env | `true` | Enables or disables phone number collection and Swish suggestions. |
| `KVITT_PHONE_FORMAT` | `backend` and `frontend` runtime env | `swedish` | Phone display format. Supported values: `swedish`, `international`, `national`, `norwegian`. |
| `VITE_PAYMENT_LINK_CONFIG` | `frontend` (build env / local dev) | `{"base_link":"https://app.swish.nu/1/p/sw/","query_params":{"phone":"sw","amount":"amt","message":"msg"}}` | Payment deep-link config as JSON. Lets you change provider base URL and query parameter names while defaulting to Swish. |
| `VAPID_PUBLIC_KEY` | `backend` | _(none)_ | VAPID public key for Web Push notifications. Leave empty to disable push. |
| `VAPID_PRIVATE_KEY` | `backend` | _(none)_ | VAPID private key. Keep this secret. |
| `VAPID_CONTACT_EMAIL` | `backend` | `admin@mydomain.se` | Contact email sent in VAPID headers. Change to a real address in production. |

### Language configuration
Kvitt now loads UI strings from a language file:

- `frontend/src/i18n/sv-se.json`

Language resolution order is:

1. Frontend runtime config (`KVITT_LANGUAGE`, injected as `window.__kvittConfig.language`)
2. Build env (`VITE_LANGUAGE`)
3. Default fallback (`sv-se`)

Important:

- Users cannot change language in the UI.
- There is no client-side language selector or per-user language preference.
- If an unsupported language value is provided, Kvitt falls back to `sv-se`.

### Push notifications
Kvitt can send Web Push notifications to group members when a new expense is added. Push requires VAPID keys, which are generated once and stored in your environment.

Generate a VAPID keypair:
```bash
npx web-push generate-vapid-keys
```

Copy the output into your `.env` (or Docker Compose environment):
```
VAPID_PUBLIC_KEY=<your public key>
VAPID_PRIVATE_KEY=<your private key>
VAPID_CONTACT_EMAIL=you@mydomain.se
```

- If `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is empty, push notifications are silently disabled and the opt-in banner is not shown.
- Users must grant notification permission in the browser. On iOS the app must be added to the home screen (PWA) first.
- Keys are permanent — regenerating them invalidates all existing subscriptions.

### Passkey setup notes (local vs production)
- **Local development**: use `PASSKEY_RP_ID=localhost` and `PASSKEY_ORIGIN=http://localhost:5173`.
- **Production**: set `PASSKEY_RP_ID` to your real domain and `PASSKEY_ORIGIN` to your HTTPS app origin (for example `https://kvitt.mydomain.se`).
- WebAuthn verification will fail if RP ID or origin does not match the browser context.

### Registration access control
- New account registration requires an admin-managed invite URL (`/register?<token>`).
- Admins can view, rotate, and copy the active registration link in the admin panel.

### Phone numbers and Swish
- Phone numbers are controlled by `KVITT_PHONE_ENABLED` and are enabled by default.
- The display format is controlled by `KVITT_PHONE_FORMAT`.
- Supported formats are `swedish`, `international`, `national`, and `norwegian`.
- The same settings are used for profile phone input, registration phone input, and Swish suggestions.
- Set the same values in the backend environment and the frontend runtime environment if you want the frontend config to match immediately on load.
- Swish payment suggestions are hidden automatically when phone handling is disabled.

### Payment deep-link provider configuration
The settlement modal can generate payment links from a configurable provider mapping.

Set `VITE_PAYMENT_LINK_CONFIG` to a JSON object:

```bash
VITE_PAYMENT_LINK_CONFIG={"base_link":"https://app.swish.nu/1/p/sw/","query_params":{"phone":"sw","amount":"amt","message":"msg"}}
```

Fields:

- `base_link`: provider URL prefix
- `query_params.phone`: query parameter name for recipient phone
- `query_params.amount`: query parameter name for amount
- `query_params.message`: query parameter name for message text

If the variable is missing or invalid JSON, Kvitt falls back to the Swish default structure above.

### Database backup
The SQLite database is stored in the named Docker volume `kvitt_data`.

Create a backup:
```bash
docker run --rm -v kvitt_kvitt_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /data/kvitt.db /backup/kvitt-backup.db'
```

Restore a backup:
```bash
docker run --rm -v kvitt_kvitt_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /backup/kvitt-backup.db /data/kvitt.db'
```

Adjust the volume name if your Compose project name differs.

### Development setup
Run both backend and frontend together from the project root:
```bash
npm install
npm run install:all
npm run dev
```

The backend starts on `http://localhost:3000` and the frontend Vite dev server starts on `http://localhost:5173`, proxying `/api` requests to the backend.
Devbox quick-login endpoints are enabled automatically when the backend is started with `npm run dev` (watch mode).

Alternatively, run each in a separate terminal:

Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```
### Docker Swarm deployment
Deployment in Docker Swarm using the ghcr.io-hosted containers, Gulster as a shared filesystem and Traefik for traffic routing.

```yaml
services:
  frontend:
    image: ghcr.io/rikardronnkvist/kvitt-frontend:latest
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.kvitt.rule=Host(`kvitt.mydomain.se`)"
        - "traefik.http.routers.kvitt.priority=10"
        - "traefik.http.routers.kvitt.entrypoints=websecure"
        - "traefik.http.routers.kvitt.tls=true"
        - "traefik.http.routers.kvitt.tls.certresolver=le"
        - "traefik.http.services.kvitt.loadbalancer.server.port=80"
    environment:
      VITE_TAGLINE: "#teambail on tour"
    networks:
      - backend
      - traefik

  backend:
    image: ghcr.io/rikardronnkvist/kvitt-backend:latest
    volumes:
      - /mnt/gluster/kvitt:/app/data
    environment:
      JWT_SECRET: ABCyyyyyyyyyyyyyy987
      PASSKEY_RP_ID: kvitt.mydomain.se
      PASSKEY_RP_NAME: Kvitt
      PASSKEY_ORIGIN: https://kvitt.mydomain.se
      OAUTH_ISSUER: https://kvitt.mydomain.se
      MCP_RESOURCE_URL: https://kvitt.mydomain.se/mcp
      # Prefer the exact nginx/frontend and Traefik overlay CIDRs in production.
      TRUST_PROXY: "10.20.0.0/24, 10.30.0.0/24"
      DB_PATH: /app/data/kvitt.db
      VAPID_PUBLIC_KEY: ABCxxxxxxxxxxxxxx123
      VAPID_PRIVATE_KEY: ZXYxxxxxxxxxxxxxx987
      VAPID_CONTACT_EMAIL: someone@mydomain.se
    networks:
      - backend
    deploy:
      replicas: 1

  mcp:
    image: ghcr.io/rikardronnkvist/kvitt-mcp:latest
    environment:
      KVITT_BASE_URL: http://backend:3000
      KVITT_PUBLIC_URL: https://kvitt.mydomain.se
      MCP_RESOURCE_URL: https://kvitt.mydomain.se/mcp
      PORT: 3001
    networks:
      - backend
      - traefik
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.docker.network=traefik"
        - "traefik.http.routers.kvitt-mcp.rule=Host(`kvitt.mydomain.se`) && (PathPrefix(`/mcp`) || PathPrefix(`/.well-known/oauth-protected-resource`))"
        - "traefik.http.routers.kvitt-mcp.priority=100"
        - "traefik.http.routers.kvitt-mcp.entrypoints=websecure"
        - "traefik.http.routers.kvitt-mcp.tls=true"
        - "traefik.http.routers.kvitt-mcp.tls.certresolver=le"
        - "traefik.http.services.kvitt-mcp.loadbalancer.server.port=3001"

networks:
  traefik:
    external: true
  backend:
    driver: overlay
```

### Public MCP service with Traefik

The MCP server is deployed separately from the main application stack and exposed through Streamable HTTP on the existing Kvitt host:

```text
https://kvitt.mydomain.se/mcp
```

The Traefik MCP router sends `/mcp` and `/.well-known/oauth-protected-resource*` to the MCP service with higher priority than the frontend router. Set `MCP_HOST`, `KVITT_PUBLIC_URL`, and `MCP_RESOURCE_URL` during deployment when using another domain. The frontend nginx proxy uses `$proxy_add_x_forwarded_for`, so the backend receives `client, Traefik` before nginx's socket address; Traefik must retain its default secure forwarded-header handling (or configure `forwardedHeaders.trustedIPs` for the load balancers in front of it). Set backend `TRUST_PROXY` to only the nginx and Traefik internal addresses/ranges. The frontend proxy sends authorization-server metadata and `/oauth/token`, `/oauth/register`, and `/oauth/revoke` to the backend, while `/oauth/authorize` remains in the SPA. No additional DNS record is needed. The existing Swarm networks must be named `kvitt_backend` and `traefik` (adjust `docker-compose.mcp.yml` if the stack name differs).

After the MCP image has been published by the release workflow, deploy it with:

```bash
docker stack deploy -c docker-compose.mcp.yml kvitt-mcp
```

To select a specific image tag:

```bash
KVITT_MCP_IMAGE=ghcr.io/rikardronnkvist/kvitt-mcp:v1.2.2 \
  docker stack deploy -c docker-compose.mcp.yml kvitt-mcp
```

Traefik terminates TLS and forwards the MCP endpoint to port `3001`. OAuth-capable clients only need the connector URL and discover Kvitt's login and consent flow automatically. Existing personal `kvitt_pat_` API tokens remain supported as Bearer tokens for scripts and advanced client configuration; the MCP container does not need a shared user token.
