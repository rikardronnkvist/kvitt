import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const databasePath = `./data/oauth-client-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'oauth-client-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const {
  clearClientCache,
  createPinnedDnsLookup,
  OAuthClientError,
  registerDcrClient,
  resolveCimdClient,
  resolveClient,
  verifyDcrClientSecret,
} = await import('../clients.js');
const { redirectUriMatches } = await import('../redirect.js');

const clientId = 'https://client.example/oauth/client.json';
const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }];

function responseRequest(body, {
  headers = {},
  statusCode = 200,
} = {}) {
  const calls = [];
  const requests = [];
  const responses = [];
  const requestImpl = vi.fn((options, callback) => {
    calls.push(options);
    const request = new EventEmitter();
    request.destroyed = false;
    requests.push(request);
    request.destroy = vi.fn(() => {
      request.destroyed = true;
    });
    request.end = vi.fn(() => {
      queueMicrotask(() => {
        const response = Readable.from([body]);
        response.statusCode = statusCode;
        response.headers = { 'content-type': 'application/json', ...headers };
        const destroy = response.destroy.bind(response);
        response.destroy = vi.fn((...args) => destroy(...args));
        responses.push(response);
        callback(response);
      });
    });
    return request;
  });
  return {
    calls,
    requestImpl,
    requests,
    responses,
  };
}

function jsonRequest(body, options = {}) {
  return responseRequest(JSON.stringify(body), options);
}

function runLookup(lookupFn, hostname, options = {}) {
  return new Promise((resolve, reject) => {
    lookupFn(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
      } else {
        resolve({ address, family });
      }
    });
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
    const { calls, requestImpl, requests } = jsonRequest({
      client_id: clientId,
      client_name: 'Claude',
      client_uri: 'https://client.example',
      redirect_uris: ['https://client.example/callback'],
    }, { headers: { 'cache-control': 'max-age=60' } });

    await expect(resolveCimdClient(clientId, {
      lookupImpl: publicLookup,
      requestImpl,
    })).resolves.toEqual({
      clientId,
      clientName: 'Claude',
      clientUri: 'https://client.example',
      logoUri: null,
      redirectUris: ['https://client.example/callback'],
      tokenEndpointAuthMethod: 'none',
      kind: 'cimd',
    });
    expect(calls[0]).toMatchObject({
      hostname: 'client.example',
      path: '/oauth/client.json',
      servername: 'client.example',
      headers: {
        Accept: 'application/json',
        Host: 'client.example',
      },
    });
    await expect(runLookup(calls[0].lookup, 'client.example')).resolves.toEqual({
      address: '203.0.113.10',
      family: 4,
    });
    expect(requests[0].destroy).not.toHaveBeenCalled();
  });

  it('pins connection lookup to the validated addresses and hostname', async () => {
    const pinnedLookup = createPinnedDnsLookup('client.example', [
      { address: '203.0.113.10', family: 4 },
      { address: '2001:db8::10', family: 6 },
    ]);

    await expect(runLookup(pinnedLookup, 'client.example', { family: 4 }))
      .resolves.toEqual({ address: '203.0.113.10', family: 4 });
    await expect(runLookup(pinnedLookup, 'client.example', { all: true }))
      .resolves.toEqual({
        address: [
          { address: '203.0.113.10', family: 4 },
          { address: '2001:db8::10', family: 6 },
        ],
        family: undefined,
      });
    await expect(runLookup(pinnedLookup, 'rebound.example'))
      .rejects.toMatchObject({ code: 'EACCES' });
  });

  it('rejects DNS results containing a private rebound address before fetching', async () => {
    const requestImpl = vi.fn();
    const lookupImpl = vi.fn().mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl }))
      .rejects.toBeInstanceOf(OAuthClientError);
    expect(requestImpl).not.toHaveBeenCalled();
  });

  it('rejects a document whose client_id does not exactly match', async () => {
    const { requestImpl } = jsonRequest({
      client_id: 'https://other.example/client.json',
      redirect_uris: ['https://client.example/callback'],
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://client.example/callback',
    'https://user:password@client.example/callback',
    'https://client.example/callback#fragment',
  ])('rejects unsafe metadata redirect URI %s', async (redirectUri) => {
    const { requestImpl } = jsonRequest({
      client_id: clientId,
      redirect_uris: [redirectUri],
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
  });

  it('allows an RFC 8252 loopback HTTP redirect in client metadata', async () => {
    const { requestImpl } = jsonRequest({
      client_id: clientId,
      redirect_uris: ['http://127.0.0.1:43210/callback'],
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .resolves.toMatchObject({ redirectUris: ['http://127.0.0.1:43210/callback'] });
  });

  it.each([
    'https://127.0.0.1/client.json',
    'https://10.1.2.3/client.json',
    'https://169.254.169.254/client.json',
    'https://100.64.0.1/client.json',
    'https://[::1]/client.json',
    'https://[fd00::1]/client.json',
  ])('rejects private CIMD address %s', async (privateClientId) => {
    const requestImpl = vi.fn();
    await expect(resolveCimdClient(privateClientId, { requestImpl })).rejects.toBeInstanceOf(OAuthClientError);
    expect(requestImpl).not.toHaveBeenCalled();
  });

  it('rejects a metadata response larger than 10 KB', async () => {
    const { requestImpl, requests, responses } = responseRequest('x'.repeat(10 * 1024 + 1));

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
    expect(responses[0].destroy).toHaveBeenCalled();
    expect(requests[0].destroy).toHaveBeenCalledOnce();
  });

  it('rejects redirects instead of following them', async () => {
    const { requestImpl, requests, responses } = responseRequest('', {
      statusCode: 302,
      headers: { location: 'https://attacker.example/client.json' },
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
    expect(responses[0].destroy).toHaveBeenCalledOnce();
    expect(requests[0].destroy).toHaveBeenCalledOnce();
  });

  it('requires a JSON response content type', async () => {
    const { requestImpl, requests, responses } = responseRequest('{}', {
      headers: { 'content-type': 'text/plain' },
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
    expect(responses[0].destroy).toHaveBeenCalledOnce();
    expect(requests[0].destroy).toHaveBeenCalledOnce();
  });

  it('enforces an absolute deadline while the connection is stalled', async () => {
    vi.useFakeTimers();
    try {
      const request = new EventEmitter();
      request.destroyed = false;
      request.destroy = vi.fn(() => {
        request.destroyed = true;
      });
      request.end = vi.fn();
      const pending = resolveCimdClient(clientId, {
        lookupImpl: publicLookup,
        requestImpl: vi.fn(() => request),
      });
      const rejection = expect(pending).rejects.toBeInstanceOf(OAuthClientError);

      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
      request.emit('error', new Error('late socket error'));
      expect(request.end).toHaveBeenCalledOnce();
      expect(request.destroy).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces the same wall-clock deadline when a response trickles data', async () => {
    vi.useFakeTimers();
    try {
      const request = new EventEmitter();
      request.destroyed = false;
      request.destroy = vi.fn(() => {
        request.destroyed = true;
      });
      let response;
      const requestImpl = vi.fn((_options, callback) => {
        request.end = vi.fn(() => {
          response = new Readable({ read() {} });
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json' };
          const destroy = response.destroy.bind(response);
          response.destroy = vi.fn((...args) => destroy(...args));
          callback(response);
        });
        return request;
      });

      const pending = resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup });
      const rejection = expect(pending).rejects.toBeInstanceOf(OAuthClientError);
      await vi.advanceTimersByTimeAsync(1_000);
      response.push('{"client_');
      await vi.advanceTimersByTimeAsync(1_000);
      response.push('id":"https');
      await vi.advanceTimersByTimeAsync(3_000);

      await rejection;
      expect(response.destroy).toHaveBeenCalledOnce();
      expect(request.destroy).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an advertised body over 10 KB without draining it', async () => {
    const {
      requestImpl,
      requests,
      responses,
    } = responseRequest('not read', {
      headers: { 'content-length': String(10 * 1024 + 1) },
    });

    await expect(resolveCimdClient(clientId, { requestImpl, lookupImpl: publicLookup }))
      .rejects.toBeInstanceOf(OAuthClientError);
    expect(responses[0].destroy).toHaveBeenCalled();
    expect(requests[0].destroy).toHaveBeenCalledOnce();
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
    'https://user:password@app.example/callback',
    'javascript:alert(1)',
    'data:text/html,hello',
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
