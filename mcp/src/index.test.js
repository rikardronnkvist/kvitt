import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';

const publicUrl = 'https://kvitt.example';
const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
const identities = new Map([
  ['kvitt_pat_test', {
    user: { id: 7, full_name: 'Pat User', user_handle: 'pat-user' },
    token: { id: 'pat-id', scopes: ['groups:read'] },
  }],
  ['kvitt_oat_first', {
    user: { id: 8, full_name: 'OAuth User', user_handle: 'oauth-user' },
    token: {
      type: 'oauth',
      id: 'access-id-1',
      grant_id: 'grant-id',
      client_id: 'client-id',
      expires_at: futureExpiry,
      scopes: ['groups:read'],
    },
  }],
  ['kvitt_oat_refreshed', {
    user: { id: 8, full_name: 'OAuth User', user_handle: 'oauth-user' },
    token: {
      type: 'oauth',
      id: 'access-id-2',
      grant_id: 'grant-id',
      client_id: 'client-id',
      expires_at: futureExpiry,
      scopes: ['groups:read'],
    },
  }],
  ['kvitt_oat_other_grant', {
    user: { id: 8, full_name: 'OAuth User', user_handle: 'oauth-user' },
    token: {
      type: 'oauth',
      id: 'access-id-3',
      grant_id: 'other-grant-id',
      client_id: 'client-id',
      expires_at: futureExpiry,
      scopes: ['groups:read'],
    },
  }],
]);

const validationCounts = new Map();
let lastGroupsAuthorization;
let groupsResponse;
let groupsRequestCount;
let expenseRequests;
let groupDetailRequests;
let backendServer;
let mcpServer;
let mcpUrl;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

function tokenFrom(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/iu, '');
}

async function mcpRequest(token, body, sessionId) {
  return fetch(`${mcpUrl}/mcp`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function initialize(token) {
  const response = await mcpRequest(token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'kvitt-mcp-test', version: '1.0.0' },
    },
  });
  assert.equal(response.status, 200);
  const sessionId = response.headers.get('mcp-session-id');
  assert.ok(sessionId);
  await response.text();
  return sessionId;
}

async function responseJson(response) {
  const body = await response.text();
  const data = body.split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length);
  return JSON.parse(data || body);
}

async function callTool(token, name, args) {
  const sessionId = await initialize(token);
  const initialized = await mcpRequest(token, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, sessionId);
  assert.equal(initialized.status, 202);

  const response = await mcpRequest(token, {
    jsonrpc: '2.0',
    id: 100,
    method: 'tools/call',
    params: { name, arguments: args },
  }, sessionId);
  assert.equal(response.status, 200);
  return (await responseJson(response)).result;
}

before(async () => {
  const backend = express();
  backend.use(express.json());
  backend.get('/api/auth/mcp/me', (req, res) => {
    const token = tokenFrom(req);
    validationCounts.set(token, (validationCounts.get(token) || 0) + 1);
    const identity = identities.get(token);
    return identity ? res.json(identity) : res.status(401).json({ error: 'invalid' });
  });
  backend.get('/api/groups', (req, res) => {
    lastGroupsAuthorization = req.headers.authorization;
    groupsRequestCount += 1;
    res.json(groupsResponse);
  });
  backend.get('/api/groups/:groupId', (req, res) => {
    groupDetailRequests.push(req.params.groupId);
    res.json({ id: Number(req.params.groupId), name: `Group ${req.params.groupId}` });
  });
  backend.post('/api/expenses/:groupId', (req, res) => {
    expenseRequests.push({ groupId: req.params.groupId, body: req.body });
    res.status(201).json({ id: 42, group_id: Number(req.params.groupId), ...req.body });
  });
  backendServer = await listen(backend);

  const backendAddress = backendServer.address();
  process.env.KVITT_BASE_URL = `http://127.0.0.1:${backendAddress.port}`;
  process.env.KVITT_PUBLIC_URL = publicUrl;
  process.env.MCP_RESOURCE_URL = `${publicUrl}/mcp`;
  const { app } = await import('./index.js');
  mcpServer = await listen(app);
  mcpUrl = `http://127.0.0.1:${mcpServer.address().port}`;
});

beforeEach(() => {
  groupsResponse = [{ id: 1, name: 'Test group', is_default: true }];
  groupsRequestCount = 0;
  expenseRequests = [];
  groupDetailRequests = [];
});

after(async () => {
  await close(mcpServer);
  await close(backendServer);
});

test('serves protected resource metadata at both RFC 9728 paths', async () => {
  const pathMetadata = await fetch(`${mcpUrl}/.well-known/oauth-protected-resource/mcp`);
  const rootMetadata = await fetch(`${mcpUrl}/.well-known/oauth-protected-resource`);

  assert.equal(pathMetadata.status, 200);
  assert.deepEqual(await pathMetadata.json(), {
    resource: `${publicUrl}/mcp`,
    authorization_servers: [publicUrl],
    scopes_supported: ['groups:read', 'expenses:read', 'settlements:read', 'expenses:write'],
    bearer_methods_supported: ['header'],
    resource_name: 'Kvitt',
  });
  assert.deepEqual(await rootMetadata.json(), await (await fetch(`${mcpUrl}/.well-known/oauth-protected-resource/mcp`)).json());
});

test('advertises title, website and icons in serverInfo', async () => {
  const response = await mcpRequest('kvitt_pat_test', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'kvitt-mcp-test', version: '1.0.0' },
    },
  });
  assert.equal(response.status, 200);
  const { serverInfo } = (await responseJson(response)).result;

  assert.equal(serverInfo.name, 'kvitt');
  assert.equal(serverInfo.title, 'Kvitt');
  assert.equal(serverInfo.websiteUrl, publicUrl);
  assert.deepEqual(serverInfo.icons, [
    { src: `${publicUrl}/icon-192-v2.png`, mimeType: 'image/png', sizes: ['192x192'] },
    { src: `${publicUrl}/icon-512-v2.png`, mimeType: 'image/png', sizes: ['512x512'] },
  ]);
});

test('returns discovery challenges for missing and invalid tokens', async () => {
  const missing = await fetch(`${mcpUrl}/mcp`, { method: 'POST' });
  const missingChallenge = missing.headers.get('www-authenticate');
  assert.equal(missing.status, 401);
  assert.match(missingChallenge, /resource_metadata="https:\/\/kvitt\.example\/\.well-known\/oauth-protected-resource\/mcp"/u);
  assert.match(missingChallenge, /scope="groups:read expenses:read settlements:read expenses:write"/u);
  assert.doesNotMatch(missingChallenge, /error="invalid_token"/u);

  const invalid = await mcpRequest('kvitt_oat_invalid', { jsonrpc: '2.0', method: 'initialize' });
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get('www-authenticate'), /error="invalid_token"/u);
});

test('keeps an OAuth session across refresh and forwards the current token', async () => {
  const sessionId = await initialize('kvitt_oat_first');

  const initialized = await mcpRequest('kvitt_oat_refreshed', {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, sessionId);
  assert.equal(initialized.status, 202);

  const toolCall = await mcpRequest('kvitt_oat_refreshed', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'list_groups', arguments: {} },
  }, sessionId);
  assert.equal(toolCall.status, 200);
  await toolCall.text();
  assert.equal(lastGroupsAuthorization, 'Bearer kvitt_oat_refreshed');
  assert.equal(validationCounts.get('kvitt_oat_refreshed'), 1);

  const otherGrant = await mcpRequest('kvitt_oat_other_grant', {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
  }, sessionId);
  assert.equal(otherGrant.status, 401);
  assert.match(otherGrant.headers.get('www-authenticate'), /error="invalid_token"/u);
});

test('preserves PAT authentication and caches its validation', async () => {
  const sessionId = await initialize('kvitt_pat_test');
  const toolList = await mcpRequest('kvitt_pat_test', {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/list',
  }, sessionId);

  assert.equal(toolList.status, 200);
  await toolList.text();
  assert.equal(validationCounts.get('kvitt_pat_test'), 1);
});

test('create_expense uses the default group when group_id is omitted', async () => {
  groupsResponse = [
    { id: 1, name: 'First group', is_default: false },
    { id: 2, name: 'Default group', is_default: true },
  ];

  const result = await callTool('kvitt_pat_test', 'create_expense', {
    title: 'Lunch',
    amount: 120,
    paid_by_user_id: 7,
  });

  assert.equal(expenseRequests[0].groupId, '2');
  assert.equal(JSON.parse(result.content[0].text).group_name, 'Default group');
});

test('create_expense uses the authenticated user when paid_by_user_id is omitted', async () => {
  const result = await callTool('kvitt_pat_test', 'create_expense', {
    title: 'Lunch',
    amount: 120,
  });

  assert.equal(expenseRequests[0].body.paid_by_user_id, 7);
  assert.equal(JSON.parse(result.content[0].text).paid_by_user_id, 7);
});

test('create_expense returns an error when no default group exists', async () => {
  groupsResponse = [{ id: 1, name: 'Archived group', is_default: false }];

  const result = await callTool('kvitt_pat_test', 'create_expense', {
    title: 'Lunch',
    amount: 120,
  });

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Ingen standardgrupp hittades. Ange group_id (se list_groups).');
  assert.equal(expenseRequests.length, 0);
});

test('create_expense preserves an explicit group_id without listing groups', async () => {
  const result = await callTool('kvitt_pat_test', 'create_expense', {
    group_id: 9,
    title: 'Lunch',
    amount: 120,
    paid_by_user_id: 8,
  });

  assert.equal(groupsRequestCount, 0);
  assert.deepEqual(groupDetailRequests, ['9']);
  assert.equal(expenseRequests[0].groupId, '9');
  assert.equal(expenseRequests[0].body.paid_by_user_id, 8);
  assert.equal(JSON.parse(result.content[0].text).group_name, 'Group 9');
});
