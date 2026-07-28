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
| `PORT` | `3000` | Backend HTTP port inside the backend container or during local backend development. |
| `FRONTEND_PORT` | `8080` | Host port mapped to the frontend container. |
| `DB_PATH` | `/app/data/kvitt.db` | SQLite database path used by the backend. |

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

The Vite development server proxies `/api` requests to `http://localhost:3000`.

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
| `PORT` | `3000` | HTTP-port för backend i containern eller vid lokal backend-utveckling. |
| `FRONTEND_PORT` | `8080` | Värdport som mappas till frontendcontainern. |
| `DB_PATH` | `/app/data/kvitt.db` | Sökväg till SQLite-databasen som backend använder. |

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

Vites utvecklingsserver proxar `/api` till `http://localhost:3000`.
