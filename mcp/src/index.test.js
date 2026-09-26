import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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

before(async () => {
  const backend = express();
  backend.get('/api/auth/mcp/me', (req, res) => {
    const token = tokenFrom(req);
    validationCounts.set(token, (validationCounts.get(token) || 0) + 1);
    const identity = identities.get(token);
    return identity ? res.json(identity) : res.status(401).json({ error: 'invalid' });
  });
  backend.get('/api/groups', (req, res) => {
    lastGroupsAuthorization = req.headers.authorization;
    res.json([{ id: 1, name: 'Test group' }]);
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
