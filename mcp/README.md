# Kvitt MCP

Kvitt MCP körs som en separat Streamable HTTP-tjänst bakom samma host som Kvitt. Den publika endpointen är:

```text
https://kvitt.mydomain.se/mcp
```

Klienten skickar användarens personliga Kvitt API-token som:

```http
Authorization: Bearer kvitt_pat_...
```

Servern validerar tokenen mot Kvitt och använder samma scope-regler som övriga API-anrop. MCP-containern ska inte konfigureras med en gemensam användartoken.

För lokal utveckling:

```sh
KVITT_BASE_URL=http://localhost:3000 PORT=3001 npm start
```

Ange tillåtna browser-origins som en kommaseparerad miljövariabel i `MCP_ALLOWED_ORIGINS`. För server-till-server-klienter behövs normalt ingen Origin-header.

Verktyg: `whoami`, `list_groups`, `get_group`, `list_expense_categories`, `list_expenses`, `list_settlements`, `get_balances`, `create_expense`, `update_expense` och `delete_expense`. Belopp anges som hela valutaenheter; skrivverktygen kräver en token med skrivbehörighet.