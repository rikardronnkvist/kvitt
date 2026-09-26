import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const databasePath = `./data/oauth-client-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'oauth-client-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const {
  clearClientCache,
  OAuthClientError,
  registerDcrClient,
  resolveCimdClient,
  resolveClient,
  verifyDcrClientSecret,
} = await import('../clients.js');
const { redirectUriMatches } = await import('../redirect.js');

const clientId = 'https://client.example/oauth/client.json';
const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }];

function jsonResponse(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeAll(() => {
  initializeDatabase();
});

beforeEach(() => {
  clearClientCache();
  db.prepare('DELETE FROM oauth_clients').run();
  delete process.env.OAUTH_CIMD_ALLOW_PRIVATE;
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('CIMD client resolution', () => {
  it('fetches and validates an HTTPS client metadata document', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      client_id: clientId,
      client_name: 'Claude',
      client_uri: 'https://client.example',
      redirect_uris: ['https://client.example/callback'],
    }, { 'Cache-Control': 'max-age=60' }));

    await expect(resolveCimdClient(clientId, { fetchImpl, lookupImpl: publicLookup })).resolves.toEqual({
      clientId,
      clientName: 'Claude',
      clientUri: 'https://client.example',
      logoUri: null,
      redirectUris: ['https://client.example/callback'],
      tokenEndpointAuthMethod: 'none',
      kind: 'cimd',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(clientId),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('rejects a document whose client_id does not exactly match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      client_id: 'https://other.example/client.json',
      redirect_uris: ['https://client.example/callback'],
    }));

    await expect(resolveCimdClient(clientId, { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
  });

  it.each([
    'https://127.0.0.1/client.json',
    'https://10.1.2.3/client.json',
    'https://169.254.169.254/client.json',
    'https://100.64.0.1/client.json',
    'https://[::1]/client.json',
    'https://[fd00::1]/client.json',
  ])('rejects private CIMD address %s', async (privateClientId) => {
    const fetchImpl = vi.fn();
    await expect(resolveCimdClient(privateClientId, { fetchImpl })).rejects.toBeInstanceOf(OAuthClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a metadata response larger than 10 KB', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x'.repeat(10 * 1024 + 1), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(resolveCimdClient(clientId, { fetchImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
  });
});

describe('DCR client registration', () => {
  it('registers and resolves public clients', async () => {
    const registration = registerDcrClient({
      redirect_uris: ['https://app.example/callback'],
      client_name: 'Test app',
      token_endpoint_auth_method: 'none',
    });

    expect(registration.client_id).toMatch(/^kvitt_dcr_/u);
    expect(registration).not.toHaveProperty('client_secret');
    await expect(resolveClient(registration.client_id)).resolves.toMatchObject({
      clientName: 'Test app',
      kind: 'dcr',
      redirectUris: ['https://app.example/callback'],
    });
  });

  it('issues and verifies a secret for confidential clients', () => {
    const registration = registerDcrClient({
      redirect_uris: ['https://app.example/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    });

    expect(registration.client_secret).toMatch(/^kvitt_dcs_/u);
    expect(verifyDcrClientSecret(registration.client_id, registration.client_secret)).toBe(true);
    expect(verifyDcrClientSecret(registration.client_id, 'wrong-secret')).toBe(false);
  });

  it.each([
    'http://app.example/callback',
    'https://app.example/callback#fragment',
    'not-a-url',
  ])('rejects invalid redirect URI %s', (redirectUri) => {
    expect(() => registerDcrClient({ redirect_uris: [redirectUri] })).toThrow(OAuthClientError);
  });

  it.each([
    'http://localhost:3210/callback',
    'http://127.0.0.1:3210/callback',
    'http://[::1]:3210/callback',
  ])('allows native loopback redirect URI %s', (redirectUri) => {
    expect(() => registerDcrClient({ redirect_uris: [redirectUri] })).not.toThrow();
  });
});

describe('redirect URI matching', () => {
  it('requires an exact match for regular redirect URIs', () => {
    expect(redirectUriMatches(
      'https://app.example/callback?next=1',
      ['https://app.example/callback'],
    )).toBe(false);
  });

  it('ignores only the port for matching loopback redirects', () => {
    expect(redirectUriMatches(
      'http://127.0.0.1:54321/callback?flow=oauth',
      ['http://127.0.0.1:8080/callback?flow=oauth'],
    )).toBe(true);
    expect(redirectUriMatches(
      'http://localhost:54321/other',
      ['http://localhost:8080/callback'],
    )).toBe(false);
  });
});
