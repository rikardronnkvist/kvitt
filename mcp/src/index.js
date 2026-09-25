import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const baseUrl = process.env.KVITT_BASE_URL?.replace(/\/$/u, '');
const apiToken = process.env.KVITT_API_TOKEN;

if (!baseUrl || !apiToken) {
  throw new Error('KVITT_BASE_URL och KVITT_API_TOKEN måste vara satta.');
}

async function request(path, options = {}) {
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

const server = new McpServer({ name: 'kvitt', version: '1.0.0' });

server.registerTool('list_groups', {
  description: 'List groups available to the personal Kvitt API token holder. current_user_balance is whole currency units: positive means the current user is owed money; negative means they owe money.',
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return textResult(await request('/api/groups'));
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
    return textResult(await request(`/api/groups/${encodeURIComponent(groupId)}`));
  } catch (error) {
    return errorResult(error);
  }
});

server.registerTool('list_expense_categories', {
  description: 'List available Kvitt expense categories.',
  annotations: { readOnlyHint: true },
}, async () => {
  try {
    return textResult(await request('/api/expenses/categories'));
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
    const expenses = await request(`/api/expenses/${groupId}`);
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
    return textResult(await request(`/api/expenses/${groupId}`, {
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
    return textResult(await request(`/api/expenses/${groupId}/${expenseId}`, {
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
    await request(`/api/expenses/${groupId}/${expenseId}`, { method: 'DELETE' });
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
    return textResult(await request('/api/auth/mcp/me'));
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
    const settlements = await request(`/api/settlements/${groupId}`);
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
    const balances = await request(`/api/settlements/${groupId}/balances`);
    return textResult(balances.map((balance) => ({
      from_user_id: balance.from.id,
      to_user_id: balance.to.id,
      amount: balance.amount,
    })));
  } catch (error) {
    return errorResult(error);
  }
});

await server.connect(new StdioServerTransport());