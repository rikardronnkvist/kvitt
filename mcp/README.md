# Kvitt MCP

Kvitt MCP körs som en separat Streamable HTTP-tjänst bakom samma host som Kvitt. Den publika endpointen är:

```text
https://kvitt.mydomain.se/mcp
```

OAuth-kompatibla klienter behöver bara connector-URL:en ovan. De upptäcker automatiskt Kvitts auktoriseringsserver, skickar användaren till inloggning och samtycke och använder därefter en OAuth access token (`kvitt_oat_…`).

Befintliga personliga API-token (`kvitt_pat_…`) stöds fortfarande för skript och avancerad klientkonfiguration. Båda token-typerna skickas som:

```http
Authorization: Bearer kvitt_pat_...
```

Servern validerar tokenen mot Kvitt och använder samma scope-regler som övriga API-anrop. MCP-containern ska inte konfigureras med en gemensam användartoken.

För lokal utveckling:

```sh
KVITT_BASE_URL=http://localhost:3000 \
KVITT_PUBLIC_URL=http://localhost:8080 \
MCP_RESOURCE_URL=http://localhost:8080/mcp \
PORT=3001 npm start
```

`MCP_RESOURCE_URL` är valfri och får standardvärdet `${KVITT_PUBLIC_URL}/mcp`.

Ange tillåtna browser-origins som en kommaseparerad miljövariabel i `MCP_ALLOWED_ORIGINS`. För server-till-server-klienter behövs normalt ingen Origin-header.

Verktyg: `whoami`, `list_groups`, `get_group`, `list_expense_categories`, `list_expenses`, `list_settlements`, `get_balances`, `create_expense`, `update_expense` och `delete_expense`. Belopp anges som hela valutaenheter; skrivverktygen kräver en token med skrivbehörighet.

Om `group_id` utelämnas från `create_expense` används användarens senast använda grupp, och om `paid_by_user_id` utelämnas används den inloggade användaren.
