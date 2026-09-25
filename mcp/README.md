# Kvitt MCP

Den lokala MCP-servern använder en personlig token från Kvitt och kommunicerar direkt med Kvitts backend.

```sh
cd mcp
npm install
KVITT_BASE_URL=http://localhost:3000 KVITT_API_TOKEN=kvitt_pat_... npm start
```

Konfigurera VS Code med `.vscode/mcp.json` och ange `KVITT_BASE_URL` och `KVITT_API_TOKEN` i din lokala MCP-miljö. Tokenen behandlas som ett lösenord och visas bara en gång vid skapande i Kvitt.

Verktyg: `whoami`, `list_groups`, `get_group`, `list_expense_categories`, `list_expenses`, `list_settlements`, `get_balances`, `create_expense`, `update_expense` och `delete_expense`. Belopp anges som hela valutaenheter; skrivverktygen kräver en token med skrivbehörighet.