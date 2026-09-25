import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const baseUrl = process.env.KVITT_BASE_URL?.replace(/\/$/u, '');
const port = Number(process.env.PORT) || 3001;
const allowedOrigins = new Set(
  (process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (!baseUrl) {
  throw new Error('KVITT_BASE_URL måste vara satt.');
}

async function request(apiToken, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Kvitt API svarade med ${response.status}.`);
  }
  return body;
}

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error) {
  return { content: [{ type: 'text', text: error.message }], isError: true };
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token.startsWith('kvitt_pat_') ? token : null;
}

function tokensMatch(firstToken, secondToken) {
  const firstBuffer = Buffer.from(firstToken);
  const secondBuffer = Buffer.from(secondToken);
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

async function validateToken(apiToken) {
  const response = await fetch(`${baseUrl}/api/auth/mcp/me`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  return response.ok;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins.has(origin);
}

function compactExpense(expense) {
  return {
    id: expense.id,
    group_id: expense.group_id,
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    category_id: expense.category_id,
    occurred_at: expense.occurred_at,
    paid_by_user_id: expense.paid_by_user_id,
    notes: expense.notes,
    splits: expense.splits.map(({ user_id: userId, amount_owed: amountOwed }) => ({ user_id: userId, amount_owed: amountOwed })),
  };
}

function compactSettlement(settlement) {
  return {
    id: settlement.id,
    group_id: settlement.group_id,
    payer_id: settlement.payer_id,
    receiver_id: settlement.receiver_id,
    amount: settlement.amount,
    settled_at: settlement.settled_at,
  };
}

function createServer(apiToken) {
  const server = new McpServer({ name: 'kvitt', version: '1.0.0' });

server.registerTool('list_groups', {
  description: 'List groups available to the personal Kvitt API token holder. current_user_balance is whole currency units: positive means the current user is owed money; negative means they owe money.',
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return textResult(await request(apiToken, '/api/groups'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('get_group', {
  description: 'Get group details and members for a group where the token holder is a member.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.union([z.coerce.number().int().positive(), z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)]) },
}, async ({ group_id: groupId }) => {
  try {
    return textResult(await request(apiToken, `/api/groups/${encodeURIComponent(groupId)}`));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_expense_categories', {
  description: 'List available Kvitt expense categories.',
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return textResult(await request(apiToken, '/api/expenses/categories'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_expenses', {
  description: 'List expenses in a group where the token holder is a member. Amounts are whole currency units. Results are ordered newest first; member names are available from get_group.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
}, async ({ group_id: groupId }) => {
  try {
    const expenses = await request(apiToken, `/api/expenses/${groupId}`);
    return textResult(expenses.map(compactExpense));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('create_expense', {
  description: 'Create a persistent expense in a group where the token holder is a member. Amounts are whole currency units. If splits are omitted, the expense is split equally across all members and any remainder is assigned in member order. Requires a token with permission to create expenses.',
  annotations: { destructiveHint: false },
  inputSchema: {
    group_id: z.coerce.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    amount: z.coerce.number().int().positive(),
    paid_by_user_id: z.coerce.number().int().positive(),
    currency: z.string().trim().min(1).max(10).default('SEK'),
    category_id: z.coerce.number().int().positive().optional(),
    occurred_at: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
    splits: z.array(z.object({
      user_id: z.coerce.number().int().positive(),
      amount_owed: z.coerce.number().int().positive(),
    })).optional(),
  },
}, async ({ group_id: groupId, ...expense }) => {
  try {
    return textResult(await request(apiToken, `/api/expenses/${groupId}`, {
      method: 'POST',
      body: JSON.stringify(expense),
    }));
  } catch (error) {
    return errorResult(error);
  }
});

const expenseInputSchema = {
  group_id: z.coerce.number().int().positive(),
  expense_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  amount: z.coerce.number().int().positive(),
  paid_by_user_id: z.coerce.number().int().positive(),
  currency: z.string().trim().min(1).max(10).default('SEK'),
  category_id: z.coerce.number().int().positive().optional(),
  occurred_at: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  splits: z.array(z.object({
    user_id: z.coerce.number().int().positive(),
    amount_owed: z.coerce.number().int().positive(),
  })).optional(),
};

server.registerTool('update_expense', {
  description: 'Replace an existing expense in a group where the token holder is a member. The complete expense payload is required; amounts are whole currency units.',
  annotations: { destructiveHint: false },
  inputSchema: expenseInputSchema,
}, async ({ group_id: groupId, expense_id: expenseId, ...expense }) => {
  try {
    return textResult(await request(apiToken, `/api/expenses/${groupId}/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    }));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('delete_expense', {
  description: 'Permanently delete an expense in a group where the token holder is a member. Use only to undo an incorrect entry.',
  annotations: { destructiveHint: true },
  inputSchema: {
    group_id: z.coerce.number().int().positive(),
    expense_id: z.coerce.number().int().positive(),
  },
}, async ({ group_id: groupId, expense_id: expenseId }) => {
  try {
    await request(apiToken, `/api/expenses/${groupId}/${expenseId}`, { method: 'DELETE' });
    return textResult({ deleted: true, expense_id: expenseId });
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('whoami', {
  description: 'Get the identity associated with the current personal Kvitt API token.',
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return textResult(await request(apiToken, '/api/auth/mcp/me'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_settlements', {
  description: 'List recorded settlements for a group where the token holder is a member. Amounts are whole currency units.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
}, async ({ group_id: groupId }) => {
  try {
    const settlements = await request(apiToken, `/api/settlements/${groupId}`);
    return textResult(settlements.map(compactSettlement));
  } catch (error) {
    return errorResult(error);
  }
});

  server.registerTool('get_balances', {
  description: 'Get simplified settlement suggestions for a group. Each item says who should pay whom and how much, in whole currency units.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
  }, async ({ group_id: groupId }) => {
  try {
    const balances = await request(apiToken, `/api/settlements/${groupId}/balances`);
    return textResult(balances.map((balance) => ({
      from_user_id: balance.from.id,
      to_user_id: balance.to.id,
      amount: balance.amount,
    })));
  } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}

const app = express();
const sessions = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
const mcpRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/mcp', mcpRateLimit, async (req, res, next) => {
  try {
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    const apiToken = getBearerToken(req);
    if (!apiToken) {
      return res.status(401).json({ error: 'Missing Kvitt API token.' });
    }

    const sessionId = req.headers['mcp-session-id'];
    let session = sessionId ? sessions.get(sessionId) : null;

    if (session && !tokensMatch(session.apiToken, apiToken)) {
      return res.status(401).json({ error: 'Token does not match MCP session.' });
    }

    if (!session) {
      if (req.method !== 'POST' || req.body?.method !== 'initialize') {
        return res.status(400).json({ error: 'MCP session is required.' });
      }
      if (!(await validateToken(apiToken))) {
        return res.status(401).json({ error: 'Invalid or expired Kvitt API token.' });
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { apiToken, transport });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      session = { apiToken, transport };
      await createServer(apiToken).connect(transport);
    }

    await session.transport.handleRequest(req, res, req.body);

    if (req.method === 'DELETE' && sessionId) {
      sessions.delete(sessionId);
    }
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'MCP server error.' });
  }
});

app.listen(port, () => {
  console.log(`Kvitt MCP listening on port ${port}`);
});