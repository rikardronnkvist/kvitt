import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const baseUrl = process.env.KVITT_BASE_URL?.replace(/\/$/u, '');
const publicUrl = process.env.KVITT_PUBLIC_URL?.replace(/\/$/u, '');
const resourceUrl = process.env.MCP_RESOURCE_URL?.replace(/\/$/u, '')
  || (publicUrl ? `${publicUrl}/mcp` : null);
const port = Number(process.env.PORT) || 3001;
const supportedScopes = ['groups:read', 'expenses:read', 'settlements:read', 'expenses:write'];
const defaultScopes = [...supportedScopes];
const tokenCacheTtlMs = 60_000;
const allowedOrigins = new Set(
  (process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (!baseUrl || !publicUrl || !resourceUrl) {
  throw new Error('KVITT_BASE_URL och KVITT_PUBLIC_URL måste vara satta.');
}

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL('/mcp', `${publicUrl}/`));
const tokenCache = new Map();

async function request(accessToken, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

async function fetchIdentity(accessToken) {
  const response = await fetch(`${baseUrl}/api/auth/mcp/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Kvitt API token validation failed with ${response.status}.`);
  }

  const identity = await response.json();
  const tokenType = accessToken.startsWith('kvitt_oat_') ? 'oauth' : 'pat';
  if ((tokenType === 'oauth' && identity.token?.type !== 'oauth')
    || (tokenType === 'pat' && identity.token?.type === 'oauth')) {
    return null;
  }
  const credentialId = tokenType === 'oauth' ? identity.token?.grant_id : identity.token?.id;
  const clientId = tokenType === 'oauth' ? identity.token?.client_id : `pat:${credentialId}`;
  const expiresAt = Number.isInteger(identity.token?.expires_at)
    ? identity.token.expires_at
    : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(identity.user?.id)
    || !credentialId
    || !clientId
    || !Array.isArray(identity.token?.scopes)) {
    return null;
  }

  return {
    clientId,
    expiresAt,
    scopes: identity.token.scopes,
    extra: {
      userId: identity.user.id,
      credentialId,
      credentialType: tokenType,
    },
  };
}

const tokenVerifier = {
  async verifyAccessToken(token) {
    const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    for (const [key, entry] of tokenCache) {
      if (entry.expiresAt <= now) {
        tokenCache.delete(key);
      }
    }
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > now) {
      return { ...cached.authInfo, token };
    }
    if (cached) {
      tokenCache.delete(cacheKey);
    }

    const authInfo = await fetchIdentity(token);
    if (!authInfo) {
      return null;
    }
    tokenCache.set(cacheKey, {
      authInfo,
      expiresAt: Math.min(now + tokenCacheTtlMs, authInfo.expiresAt * 1000),
    });
    return { ...authInfo, token };
  },
};

function sendAuthError(res, { invalidToken = false } = {}) {
  const params = [`resource_metadata="${resourceMetadataUrl}"`, `scope="${defaultScopes.join(' ')}"`];
  if (invalidToken) {
    params.splice(1, 0, 'error="invalid_token"');
  }
  res.set('WWW-Authenticate', `Bearer ${params.join(', ')}`);
  return res.status(401).json({ error: invalidToken ? 'invalid_token' : 'unauthorized' });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return sendAuthError(res);
  }

  const match = /^Bearer\s+(\S+)$/iu.exec(header);
  const token = match?.[1];
  if (!token || (!token.startsWith('kvitt_pat_') && !token.startsWith('kvitt_oat_'))) {
    return sendAuthError(res, { invalidToken: true });
  }

  try {
    const authInfo = await tokenVerifier.verifyAccessToken(token);
    if (!authInfo || authInfo.expiresAt <= Date.now() / 1000) {
      return sendAuthError(res, { invalidToken: true });
    }
    req.auth = authInfo;
    return next();
  } catch (error) {
    return next(error);
  }
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

function authenticatedRequest(extra, path, options) {
  if (!extra.authInfo?.token) {
    throw new Error('MCP request is missing authentication context.');
  }
  return request(extra.authInfo.token, path, options);
}

function createServer() {
  const server = new McpServer({ name: 'kvitt', version }, {
    instructions: 'When the user does not name a group, omit group_id in create_expense; the most recently used group is chosen. Always tell the user which group the expense was added to.',
  });

server.registerTool('list_groups', {
  description: 'List groups available to the authenticated Kvitt user. is_default marks the group used when group_id is omitted from create_expense. current_user_balance is whole currency units: positive means the current user is owed money; negative means they owe money.',
  annotations: { readOnlyHint: true },
}, async (extra) => {
  try {
    return textResult(await authenticatedRequest(extra, '/api/groups'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('get_group', {
  description: 'Get group details and members for a group where the authenticated Kvitt user is a member.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.union([z.coerce.number().int().positive(), z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)]) },
}, async ({ group_id: groupId }, extra) => {
  try {
    return textResult(await authenticatedRequest(extra, `/api/groups/${encodeURIComponent(groupId)}`));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_expense_categories', {
  description: 'List available Kvitt expense categories.',
  annotations: { readOnlyHint: true },
}, async (extra) => {
  try {
    return textResult(await authenticatedRequest(extra, '/api/expenses/categories'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_expenses', {
  description: 'List expenses in a group where the authenticated Kvitt user is a member. Amounts are whole currency units. Results are ordered newest first; member names are available from get_group.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
}, async ({ group_id: groupId }, extra) => {
  try {
    const expenses = await authenticatedRequest(extra, `/api/expenses/${groupId}`);
    return textResult(expenses.map(compactExpense));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('create_expense', {
  description: "Create a persistent expense in a group where the authenticated Kvitt user is a member. Amounts are whole currency units. If group_id is omitted, the user's most recently used group (is_default in list_groups) is used. If paid_by_user_id is omitted, the authenticated user is the payer. If splits are omitted, the expense is split equally across all members and any remainder is assigned in member order. Requires permission to create expenses.",
  annotations: { destructiveHint: false },
  inputSchema: {
    group_id: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    amount: z.coerce.number().int().positive(),
    paid_by_user_id: z.coerce.number().int().positive().optional(),
    currency: z.string().trim().min(1).max(10).default('SEK'),
    category_id: z.coerce.number().int().positive().optional(),
    occurred_at: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
    splits: z.array(z.object({
      user_id: z.coerce.number().int().positive(),
      amount_owed: z.coerce.number().int().positive(),
    })).optional(),
  },
}, async ({ group_id: requestedGroupId, paid_by_user_id: requestedPayerId, ...expense }, extra) => {
  try {
    let groupId = requestedGroupId;
    let groupName;
    if (groupId === undefined) {
      const groups = await authenticatedRequest(extra, '/api/groups');
      const defaultGroup = groups.find((group) => group.is_default === true);
      if (!defaultGroup) {
        return errorResult(new Error('Ingen standardgrupp hittades. Ange group_id (se list_groups).'));
      }
      groupId = defaultGroup.id;
      groupName = defaultGroup.name;
    }

    if (!groupName) {
      const group = await authenticatedRequest(extra, `/api/groups/${encodeURIComponent(groupId)}`);
      groupName = group.name;
    }

    const createdExpense = await authenticatedRequest(extra, `/api/expenses/${groupId}`, {
      method: 'POST',
      body: JSON.stringify({
        ...expense,
        paid_by_user_id: requestedPayerId ?? extra.authInfo.extra.userId,
      }),
    });
    return textResult({ ...createdExpense, group_name: groupName });
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
  description: 'Replace an existing expense in a group where the authenticated Kvitt user is a member. The complete expense payload is required; amounts are whole currency units.',
  annotations: { destructiveHint: false },
  inputSchema: expenseInputSchema,
}, async ({ group_id: groupId, expense_id: expenseId, ...expense }, extra) => {
  try {
    return textResult(await authenticatedRequest(extra, `/api/expenses/${groupId}/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    }));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('delete_expense', {
  description: 'Permanently delete an expense in a group where the authenticated Kvitt user is a member. Use only to undo an incorrect entry.',
  annotations: { destructiveHint: true },
  inputSchema: {
    group_id: z.coerce.number().int().positive(),
    expense_id: z.coerce.number().int().positive(),
  },
}, async ({ group_id: groupId, expense_id: expenseId }, extra) => {
  try {
    await authenticatedRequest(extra, `/api/expenses/${groupId}/${expenseId}`, { method: 'DELETE' });
    return textResult({ deleted: true, expense_id: expenseId });
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('whoami', {
  description: 'Get the identity of the authenticated Kvitt user.',
  annotations: { readOnlyHint: true },
}, async (extra) => {
  try {
    return textResult(await authenticatedRequest(extra, '/api/auth/mcp/me'));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_settlements', {
  description: 'List recorded settlements for a group where the authenticated Kvitt user is a member. Amounts are whole currency units.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
}, async ({ group_id: groupId }, extra) => {
  try {
    const settlements = await authenticatedRequest(extra, `/api/settlements/${groupId}`);
    return textResult(settlements.map(compactSettlement));
  } catch (error) {
    return errorResult(error);
  }
});

  server.registerTool('get_balances', {
  description: 'Get simplified settlement suggestions for a group. Each item says who should pay whom and how much, in whole currency units.',
  annotations: { readOnlyHint: true },
  inputSchema: { group_id: z.coerce.number().int().positive() },
  }, async ({ group_id: groupId }, extra) => {
  try {
    const balances = await authenticatedRequest(extra, `/api/settlements/${groupId}/balances`);
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

const protectedResourceMetadata = {
  resource: resourceUrl,
  authorization_servers: [publicUrl],
  scopes_supported: supportedScopes,
  bearer_methods_supported: ['header'],
  resource_name: 'Kvitt',
};

app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  res.json(protectedResourceMetadata);
});
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json(protectedResourceMetadata);
});

app.use('/mcp', mcpRateLimit, authenticate, async (req, res, next) => {
  try {
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    const sessionId = req.headers['mcp-session-id'];
    let session = sessionId ? sessions.get(sessionId) : null;
    const requestIdentity = {
      userId: req.auth.extra.userId,
      credentialId: req.auth.extra.credentialId,
      credentialType: req.auth.extra.credentialType,
    };

    if (session
      && (session.identity.userId !== requestIdentity.userId
        || session.identity.credentialId !== requestIdentity.credentialId
        || session.identity.credentialType !== requestIdentity.credentialType)) {
      return sendAuthError(res, { invalidToken: true });
    }

    if (!session) {
      if (req.method !== 'POST' || req.body?.method !== 'initialize') {
        return res.status(400).json({ error: 'MCP session is required.' });
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { identity: requestIdentity, transport });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      session = { identity: requestIdentity, transport };
      await createServer().connect(transport);
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

export function startServer() {
  return app.listen(port, () => {
    console.log(`Kvitt MCP v${version} listening on port ${port}`);
  });
}

export { app, protectedResourceMetadata, resourceMetadataUrl, tokenVerifier };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
