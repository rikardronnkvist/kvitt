# Kvitt

## English

Kvitt is a self-hosted bill-splitting web application for small groups, trips, households, and shared projects.

### Features
- User registration and login with JWT authentication
- Group creation and membership management
- Expense tracking with equal or manual splits
- Balance calculation with settlement support
- CSV export for group expenses
- Docker-based self-hosted deployment

### Quick start with Docker Compose
```bash
cp .env.example .env
# Edit JWT_SECRET before exposing the app
docker compose up --build
```

The frontend is available on `http://localhost:8080` by default and proxies API calls to the backend.

### Environment variables
| Variable | Container | Default | Description |
| --- | --- | --- | --- |
| `JWT_SECRET` | `backend` | `changeme-use-a-strong-secret` | Secret used to sign and verify JWT tokens. Change this in production. |
| `SESSION_SECRET` | `backend` | _(optional)_ | Optional alias for `JWT_SECRET` used by auth modules. |
| `PORT` | `backend` | `3000` | Backend HTTP port inside the backend container or during local backend development. |
| `FRONTEND_PORT` | Compose (host) | `8080` | Host port mapped to the frontend container. |
| `DB_PATH` | `backend` | `/app/data/kvitt.db` | SQLite database path used by the backend. |
| `PASSKEY_RP_ID` | `backend` | `localhost` | WebAuthn relying party ID. Use your domain in production. |
| `PASSKEY_RP_NAME` | `backend` | `Kvitt` | Displayed relying party name for passkey prompts. |
| `PASSKEY_ORIGIN` | `backend` | `http://localhost:5173` | Allowed WebAuthn origin(s), comma-separated if needed. |
| `DEVBOX` | `backend` | `false` | Enables devbox-only quick-login endpoints and user picker on login screen. |
| `VITE_TAGLINE` | `frontend` (build arg or runtime env) | `Dela kostnader, bli kvitt` | Tagline shown on the login page and in the app header. |
| `VAPID_PUBLIC_KEY` | `backend` | _(none)_ | VAPID public key for Web Push notifications. Leave empty to disable push. |
| `VAPID_PRIVATE_KEY` | `backend` | _(none)_ | VAPID private key. Keep this secret. |
| `VAPID_CONTACT_EMAIL` | `backend` | `admin@example.com` | Contact email sent in VAPID headers. Change to a real address in production. |

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
VAPID_CONTACT_EMAIL=you@example.com
```

- If `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is empty, push notifications are silently disabled and the opt-in banner is not shown.
- Users must grant notification permission in the browser. On iOS the app must be added to the home screen (PWA) first.
- Keys are permanent — regenerating them invalidates all existing subscriptions.

### Passkey setup notes (local vs production)
- **Local development**: use `PASSKEY_RP_ID=localhost` and `PASSKEY_ORIGIN=http://localhost:5173`.
- **Production**: set `PASSKEY_RP_ID` to your real domain and `PASSKEY_ORIGIN` to your HTTPS app origin (for example `https://kvitt.example.com`).
- WebAuthn verification will fail if RP ID or origin does not match the browser context.

### Registration access control
- New account registration requires an admin-managed invite URL (`/register?<token>`).
- Admins can view, rotate, and copy the active registration link in the admin panel.

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
Local npm dev/start scripts now default to `DEVBOX=true`.

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
    image: ghcr.io/rikardronnkvist/kvitt-frontend
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.kvitt.rule=Host(`kvitt.mydomain.se`)"
        - "traefik.http.routers.kvitt.entrypoints=websecure"
        - "traefik.http.routers.kvitt.tls=true"
        - "traefik.http.routers.kvitt.tls.certresolver=le"
        - "traefik.http.routers.kvitt.middlewares=geo-block@file,tor-block@file"
        - "traefik.http.services.kvitt.loadbalancer.server.port=80"
    environment:
      VITE_TAGLINE: "#teambail on tour"
    networks:
      - backend
      - traefik

  backend:
    image: ghcr.io/rikardronnkvist/kvitt-backend
    volumes:
      - /mnt/gluster01/kvitt:/app/data
    labels:
      - "ssb.backup-db=sqlite"
      - "ssb.backup-db-path=/app/data/kvitt.db"
    environment:
      JWT_SECRET: ABCyyyyyyyyyyyyyy987
      PASSKEY_RP_ID: kvitt.mydomain.se
      PASSKEY_RP_NAME: Kvitt
      PASSKEY_ORIGIN: https://kvitt.mydomain.se
      PORT: ${PORT:-3000}
      DEVBOX: "false"
      DB_PATH: /app/data/kvitt.db
      VAPID_PUBLIC_KEY: ABCxxxxxxxxxxxxxx123
      VAPID_PRIVATE_KEY: ZXYxxxxxxxxxxxxxx987
      VAPID_CONTACT_EMAIL: someone@mydomain.se
    networks:
      - backend
    deploy:
      replicas: 1

networks:
  traefik:
    external: true
  backend:
    driver: overlay
```
