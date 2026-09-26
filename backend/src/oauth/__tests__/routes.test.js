import fs from 'node:fs';
import { createHash } from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databasePath = `./data/oauth-route-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'oauth-route-test-secret';
process.env.OAUTH_ISSUER = 'https://kvitt.example';
process.env.MCP_RESOURCE_URL = 'https://kvitt.example/mcp';

const { db, initializeDatabase } = await import('../../db/database.js');
const { signToken } = await import('../../auth/token.js');
const { registerDcrClient } = await import('../clients.js');
const { authorizationRequestStore } = await import('../authorization-requests.js');
const { verifyOAuthAccessToken } = await import('../tokens.js');
const {
  default: oauthRouter,
  oauthApiRouter,
  oauthMetadataRouter,
} = await import('../../routes/oauth.js');
const { default: authRouter } = await import('../../routes/auth.js');

const userId = 92001;
const verifier = 'correct-horse-battery-staple-with-43-characters';
const challenge = createHash('sha256').update(verifier).digest('base64url');
let server;
let baseUrl;
let sessionToken;
let registration;

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

function authorizationInput(overrides = {}) {
  return {
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: 'https://app.example/callback?existing=1',
    state: 'opaque-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'groups:read expenses:read settlements:read expenses:write',
    resource: 'https://kvitt.example/mcp',
    ...overrides,
  };
}

async function postJson(path, body) {
  return request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use(oauthMetadataRouter);
  app.use('/oauth', oauthRouter);
  app.use('/api/oauth', oauthApiRouter);
  app.use('/api/auth', authRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  authorizationRequestStore.clear();
  db.exec(`
    DELETE FROM activity_logs;
    DELETE FROM oauth_authorization_codes;
    DELETE FROM oauth_tokens;
    DELETE FROM oauth_grants;
    DELETE FROM oauth_clients;
    DELETE FROM users WHERE id = ${userId};
  `);
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, 'Route User', 'route-user', 0)
  `).run(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  sessionToken = signToken(user);
  registration = registerDcrClient({
    redirect_uris: ['https://app.example/callback?existing=1'],
    client_name: 'Route client',
  });
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('OAuth authorization server routes', () => {
  it('stores a public authorization query behind an opaque authenticated handle', async () => {
    const query = new URLSearchParams(authorizationInput()).toString();
    const creationResponse = await request('/api/oauth/authorize/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    expect(creationResponse.status).toBe(201);
    expect(creationResponse.headers.get('cache-control')).toBe('no-store');
    const creation = await creationResponse.json();
    expect(creation.request).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(creation).not.toHaveProperty('query');

    const unauthenticatedResponse = await request(
      `/api/oauth/authorize/request/${creation.request}`,
    );
    expect(unauthenticatedResponse.status).toBe(401);

    const resolutionResponse = await request(
      `/api/oauth/authorize/request/${creation.request}`,
      { headers: { Authorization: ['Bearer', sessionToken].join(' ') } },
    );
    expect(resolutionResponse.status).toBe(200);
    expect(resolutionResponse.headers.get('cache-control')).toBe('no-store');
    await expect(resolutionResponse.json()).resolves.toMatchObject({
      request: authorizationInput(),
    });
  });

  it('rejects duplicate, unknown and oversized authorization request parameters', async () => {
    for (const query of [
      'client_id=one&client_id=two',
      'client_id=client&return_to=https%3A%2F%2Fattacker.example',
      `state=${'x'.repeat(2049)}`,
    ]) {
      const response = await request('/api/oauth/authorize/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
    }
  });

  it('serves authorization server metadata at both discovery endpoints', async () => {
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ]) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('ratelimit')).not.toBeNull();
      await expect(response.json()).resolves.toMatchObject({
        issuer: 'https://kvitt.example',
        authorization_endpoint: 'https://kvitt.example/oauth/authorize',
        token_endpoint: 'https://kvitt.example/oauth/token',
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ['S256'],
      });
    }
  });

  it('never redirects when the redirect URI is not registered', async () => {
    const response = await postJson('/api/oauth/authorize/validate', authorizationInput({
      redirect_uri: 'https://attacker.example/callback',
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_request');
    expect(body).not.toHaveProperty('redirect_to');
  });

  it('defaults OAuth requests to full read and write permissions', async () => {
    const requestInput = authorizationInput({ scope: undefined });
    const validationResponse = await postJson('/api/oauth/authorize/validate', requestInput);
    expect(validationResponse.status).toBe(200);
    await expect(validationResponse.json()).resolves.toMatchObject({
      requested_scopes: ['groups:read', 'expenses:read', 'settlements:read', 'expenses:write'],
    });

    const decisionResponse = await postJson('/api/oauth/authorize/decision', {
      ...requestInput,
      approved: true,
      allow_write: true,
    });
    expect(decisionResponse.status).toBe(200);
    const grant = db.prepare(`
      SELECT scopes FROM oauth_grants
      WHERE user_id = ? AND client_id = ? AND resource = ?
    `).get(userId, registration.client_id, 'https://kvitt.example/mcp');
    expect(JSON.parse(grant.scopes)).toContain('expenses:write');
  });

  it('returns redirectable errors only after validating the redirect URI', async () => {
    const response = await postJson('/api/oauth/authorize/validate', authorizationInput({
      response_type: 'token',
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('unsupported_response_type');
    expect(body.redirect_uri).toBe('https://app.example/callback?existing=1');
    expect(new URL(body.redirect_to).origin).toBe('https://app.example');
    expect(new URL(body.redirect_to).searchParams.get('state')).toBe('opaque-state');
    expect(new URL(body.redirect_to).searchParams.get('iss')).toBe('https://kvitt.example');
  });

  it('approves, exchanges, refreshes and revokes an OAuth grant', async () => {
    const validationResponse = await postJson(
      '/api/oauth/authorize/validate',
      authorizationInput(),
    );
    expect(validationResponse.status).toBe(200);
    await expect(validationResponse.json()).resolves.toMatchObject({
      client: { name: 'Route client', kind: 'dcr' },
      requested_scopes: expect.arrayContaining(['groups:read', 'expenses:write']),
    });

    const decisionResponse = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: false,
    });
    expect(decisionResponse.status).toBe(200);
    const redirect = new URL((await decisionResponse.json()).redirect_to);
    const code = redirect.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(redirect.searchParams.get('existing')).toBe('1');
    expect(redirect.searchParams.get('iss')).toBe('https://kvitt.example');

    const tokenResponse = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
        resource: 'https://kvitt.example/mcp/',
      }),
    });
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get('cache-control')).toBe('no-store');
    const tokens = await tokenResponse.json();
    expect(tokens.scope).not.toContain('expenses:write');
    expect(verifyOAuthAccessToken(tokens.access_token)).toMatchObject({
      user: { id: userId },
      resource: 'https://kvitt.example/mcp',
    });
    const identityResponse = await request('/api/auth/mcp/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(identityResponse.status).toBe(200);
    await expect(identityResponse.json()).resolves.toMatchObject({
      user: { id: userId },
      token: {
        type: 'oauth',
        grant_id: expect.any(String),
        client_id: registration.client_id,
        expires_at: expect.any(Number),
        scopes: expect.arrayContaining(['groups:read']),
      },
    });

    const refreshResponse = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: registration.client_id,
        refresh_token: tokens.refresh_token,
        scope: 'groups:read',
      }),
    });
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json();
    expect(refreshed.scope).toBe('groups:read');

    const revokeResponse = await request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: registration.client_id,
        token: refreshed.refresh_token,
      }),
    });
    expect(revokeResponse.status).toBe(200);
    expect(verifyOAuthAccessToken(refreshed.access_token)).toBeNull();
  });

  it('requires authenticated client identification for revocation and enforces ownership', async () => {
    const decisionResponse = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });
    const code = new URL((await decisionResponse.json()).redirect_to).searchParams.get('code');
    const tokenResponse = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
      }),
    });
    const tokens = await tokenResponse.json();

    const unidentified = await request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.access_token }),
    });
    expect(unidentified.status).toBe(401);
    await expect(unidentified.json()).resolves.toMatchObject({ error: 'invalid_client' });
    expect(verifyOAuthAccessToken(tokens.access_token)).not.toBeNull();

    const otherClient = registerDcrClient({
      redirect_uris: ['https://other.example/callback'],
      token_endpoint_auth_method: 'none',
    });
    const wrongOwner = await request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: otherClient.client_id,
        token: tokens.access_token,
      }),
    });
    expect(wrongOwner.status).toBe(200);
    expect(verifyOAuthAccessToken(tokens.access_token)).not.toBeNull();

    const confidentialClient = registerDcrClient({
      redirect_uris: ['https://confidential.example/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
    const invalidSecret = await request('/oauth/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${confidentialClient.client_id}:wrong`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: tokens.access_token }),
    });
    expect(invalidSecret.status).toBe(401);

    const authenticatedOtherClient = await request('/oauth/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${confidentialClient.client_id}:${confidentialClient.client_secret}`,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: tokens.access_token }),
    });
    expect(authenticatedOtherClient.status).toBe(200);
    expect(verifyOAuthAccessToken(tokens.access_token)).not.toBeNull();
  });

  it('revokes existing tokens and authorization codes when consent scopes change', async () => {
    const firstDecision = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });
    const firstCode = new URL((await firstDecision.json()).redirect_to).searchParams.get('code');
    const firstTokenResponse = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code: firstCode,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
      }),
    });
    const oldTokens = await firstTokenResponse.json();

    const outstandingDecision = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });
    const outstandingCode = new URL(
      (await outstandingDecision.json()).redirect_to,
    ).searchParams.get('code');

    const downgradedDecision = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: false,
    });
    expect(downgradedDecision.status).toBe(200);
    const downgradedCode = new URL(
      (await downgradedDecision.json()).redirect_to,
    ).searchParams.get('code');
    expect(verifyOAuthAccessToken(oldTokens.access_token)).toBeNull();

    const oldRefresh = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: registration.client_id,
        refresh_token: oldTokens.refresh_token,
      }),
    });
    expect(oldRefresh.status).toBe(400);
    await expect(oldRefresh.json()).resolves.toMatchObject({ error: 'invalid_grant' });

    const oldCodeExchange = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code: outstandingCode,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
      }),
    });
    expect(oldCodeExchange.status).toBe(400);
    await expect(oldCodeExchange.json()).resolves.toMatchObject({ error: 'invalid_grant' });

    const downgradedExchange = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code: downgradedCode,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
      }),
    });
    expect(downgradedExchange.status).toBe(200);
    expect((await downgradedExchange.json()).scope).not.toContain('expenses:write');
  });

  it('revokes grant tokens on a valid replay after expiry but not on unbound attempts', async () => {
    const decisionResponse = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });
    const code = new URL((await decisionResponse.json()).redirect_to).searchParams.get('code');
    const form = {
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      code,
      redirect_uri: 'https://app.example/callback?existing=1',
      code_verifier: verifier,
    };
    const first = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    const accessToken = (await first.json()).access_token;
    const otherClient = registerDcrClient({
      redirect_uris: ['https://app.example/callback?existing=1'],
    });
    db.prepare(`
      UPDATE oauth_authorization_codes
      SET expires_at = datetime('now', '-1 second')
      WHERE code_hash = ?
    `).run(createHash('sha256').update(code).digest('hex'));

    for (const invalidBinding of [
      { code_verifier: `${verifier}x` },
      { redirect_uri: 'https://attacker.example/callback' },
      { resource: 'https://other.example/mcp' },
      { client_id: otherClient.client_id },
    ]) {
      const invalidReplay = await request('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...form, ...invalidBinding }),
      });
      expect(invalidReplay.status).toBe(400);
      expect(verifyOAuthAccessToken(accessToken)).not.toBeNull();
    }

    const replay = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ error: 'invalid_grant' });
    expect(verifyOAuthAccessToken(accessToken)).toBeNull();
  });

  it('rejects an unused expired authorization code without revoking its grant', async () => {
    const decisionResponse = await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });
    const code = new URL((await decisionResponse.json()).redirect_to).searchParams.get('code');
    const codeHash = createHash('sha256').update(code).digest('hex');
    const { grant_id: codeGrantId } = db.prepare(
      'SELECT grant_id FROM oauth_authorization_codes WHERE code_hash = ?',
    ).get(codeHash);
    db.prepare(`
      UPDATE oauth_authorization_codes
      SET expires_at = datetime('now', '-1 second')
      WHERE code_hash = ?
    `).run(codeHash);

    const response = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code,
        redirect_uri: 'https://app.example/callback?existing=1',
        code_verifier: verifier,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' });
    expect(db.prepare('SELECT revoked_at FROM oauth_grants WHERE id = ?').get(codeGrantId).revoked_at)
      .toBeNull();
  });

  it('returns a trustworthy consent host based on client kind', async () => {
    db.prepare('DELETE FROM oauth_clients WHERE client_id = ?').run(registration.client_id);
    registration = registerDcrClient({
      redirect_uris: ['https://redirect.example/callback?existing=1'],
      client_name: 'Claimed name',
      client_uri: 'https://self-asserted.example',
    });

    const response = await postJson('/api/oauth/authorize/validate', authorizationInput({
      redirect_uri: 'https://redirect.example/callback?existing=1',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      client: {
        trust_host: 'redirect.example',
        trust_source: 'redirect_uri',
      },
    });
  });

  it('lists and revokes grants for the interactive user', async () => {
    await postJson('/api/oauth/authorize/decision', {
      ...authorizationInput(),
      approved: true,
      allow_write: true,
    });

    const listResponse = await request('/api/oauth/grants', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get('ratelimit')).not.toBeNull();
    const { grants } = await listResponse.json();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      client_name: 'Route client',
      scopes: expect.arrayContaining(['expenses:write']),
    });

    const deleteResponse = await request(`/api/oauth/grants/${grants[0].id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.headers.get('ratelimit')).not.toBeNull();
    const activeGrant = db.prepare(
      'SELECT id FROM oauth_grants WHERE id = ? AND revoked_at IS NULL',
    ).get(grants[0].id);
    expect(activeGrant).toBeUndefined();
  });
});
