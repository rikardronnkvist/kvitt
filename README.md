# Kvitt

## English

Kvitt is a self-hosted bill-splitting web application for small groups, trips, households, and shared projects. It includes a Node.js/Express backend, a React/Vite frontend, and SQLite persistence for simple deployment.

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
| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | `changeme-use-a-strong-secret` | Secret used to sign and verify JWT tokens. Change this in production. |
| `SESSION_SECRET` | _(optional)_ | Optional alias for `JWT_SECRET` used by auth modules. |
| `PORT` | `3000` | Backend HTTP port inside the backend container or during local backend development. |
| `FRONTEND_PORT` | `8080` | Host port mapped to the frontend container. |
| `DB_PATH` | `/app/data/kvitt.db` | SQLite database path used by the backend. |
| `PASSKEY_RP_ID` | `localhost` | WebAuthn relying party ID. Use your domain in production. |
| `PASSKEY_RP_NAME` | `Kvitt` | Displayed relying party name for passkey prompts. |
| `PASSKEY_ORIGIN` | `http://localhost:5173` | Allowed WebAuthn origin(s), comma-separated if needed. |

### Passkey setup notes (local vs production)
- **Local development**: use `PASSKEY_RP_ID=localhost` and `PASSKEY_ORIGIN=http://localhost:5173`.
- **Production**: set `PASSKEY_RP_ID` to your real domain and `PASSKEY_ORIGIN` to your HTTPS app origin (for example `https://kvitt.example.com`).
- WebAuthn verification will fail if RP ID or origin does not match the browser context.

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

---

## Svenska

Kvitt är en självhostad webbapplikation för att dela upp utgifter i mindre grupper, på resor, i hushåll eller i gemensamma projekt. Projektet består av en Node.js/Express-backend, ett React/Vite-gränssnitt och SQLite för enkel lagring.

### Funktioner
- Registrering och inloggning med JWT-autentisering
- Skapande av grupper och hantering av medlemmar
- Utgifter med lika delning eller manuella andelar
- Saldoberäkning som tar hänsyn till registrerade betalningar
- CSV-export av gruppens utgifter
- Docker-baserad självhosting

### Snabbstart med Docker Compose
```bash
cp .env.example .env
# Ändra JWT_SECRET innan du exponerar tjänsten
docker compose up --build
```

Frontend finns som standard på `http://localhost:8080` och proxar API-anrop till backend.

### Miljövariabler
| Variabel | Standardvärde | Beskrivning |
| --- | --- | --- |
| `JWT_SECRET` | `changeme-use-a-strong-secret` | Hemlighet som används för att signera och verifiera JWT-token. Byt i produktion. |
| `SESSION_SECRET` | _(valfri)_ | Valfritt alias för `JWT_SECRET` som kan användas av auth-moduler. |
| `PORT` | `3000` | HTTP-port för backend i containern eller vid lokal backend-utveckling. |
| `FRONTEND_PORT` | `8080` | Värdport som mappas till frontendcontainern. |
| `DB_PATH` | `/app/data/kvitt.db` | Sökväg till SQLite-databasen som backend använder. |
| `PASSKEY_RP_ID` | `localhost` | WebAuthn RP-ID. Använd din domän i produktion. |
| `PASSKEY_RP_NAME` | `Kvitt` | Visningsnamn för RP i passkey-dialogen. |
| `PASSKEY_ORIGIN` | `http://localhost:5173` | Tillåtna WebAuthn-origin(s), kommaseparerade vid behov. |

### Passkey-konfiguration (lokalt vs produktion)
- **Lokal utveckling**: använd `PASSKEY_RP_ID=localhost` och `PASSKEY_ORIGIN=http://localhost:5173`.
- **Produktion**: sätt `PASSKEY_RP_ID` till din riktiga domän och `PASSKEY_ORIGIN` till appens HTTPS-origin (t.ex. `https://kvitt.example.com`).
- WebAuthn-verifiering misslyckas om RP-ID eller origin inte matchar webbläsarkontexten.

### Säkerhetskopiera databasen
SQLite-databasen ligger i Docker-volymen `kvitt_data`.

Skapa en backup:
```bash
docker run --rm -v kvitt_kvitt_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /data/kvitt.db /backup/kvitt-backup.db'
```

Återställ en backup:
```bash
docker run --rm -v kvitt_kvitt_data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /backup/kvitt-backup.db /data/kvitt.db'
```

Justera volymnamnet om ditt Compose-projektnamn skiljer sig.

### Utvecklingsmiljö
Kör backend och frontend tillsammans från projektroten:
```bash
npm install
npm run install:all
npm run dev
```

Backend startar på `http://localhost:3000` och Vites utvecklingsserver startar på `http://localhost:5173` och proxar `/api` till backend.

Alternativt, kör var och en i ett eget terminalfönster:

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
