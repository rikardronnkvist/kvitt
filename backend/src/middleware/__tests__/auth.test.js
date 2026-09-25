import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUserById: vi.fn(),
  verify: vi.fn(),
  verifyApiToken: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: mocks.verify },
}));

vi.mock('../../auth/token.js', () => ({
  getAuthUserById: mocks.getAuthUserById,
  jwtSecret: 'test-secret',
  verifyApiToken: mocks.verifyApiToken,
}));

import authMiddleware, { requireInteractiveSession, requireScope } from '../auth.js';

function createResponse() {
  const response = {
    json: vi.fn(),
    status: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a valid token when its user is not an authenticatable user', () => {
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const response = createResponse();
    const next = vi.fn();
    mocks.verify.mockReturnValue({ id: 15 });
    mocks.getAuthUserById.mockReturnValue(null);

    authMiddleware(request, response, next);

    expect(mocks.getAuthUserById).toHaveBeenCalledWith(15);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the current database user for authenticated requests', () => {
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const response = createResponse();
    const next = vi.fn();
    const user = { id: 4, full_name: 'Micke', is_admin: false, user_handle: 'micke' };
    mocks.verify.mockReturnValue({ id: 4, is_admin: true, current_passkey_id: 7 });
    mocks.getAuthUserById.mockReturnValue(user);

    authMiddleware(request, response, next);

    expect(request.user).toEqual({ ...user, current_passkey_id: 7 });
    expect(request.auth).toEqual({ type: 'jwt', scopes: null });
    expect(next).toHaveBeenCalledOnce();
  });

  it('accepts a valid personal API token and keeps its scopes', () => {
    const request = {
      baseUrl: '/api/groups',
      headers: { authorization: 'Bearer kvitt_pat_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      method: 'GET',
      path: '/',
    };
    const response = createResponse();
    const next = vi.fn();
    const user = { id: 4, full_name: 'Micke', is_admin: false, user_handle: 'micke' };
    mocks.verifyApiToken.mockReturnValue({
      id: '00000000-0000-0000-0000-000000000000',
      scopes: ['groups:read'],
      user,
    });

    authMiddleware(request, response, next);

    expect(request.user).toEqual(user);
    expect(request.auth).toEqual({
      type: 'api_token',
      tokenId: '00000000-0000-0000-0000-000000000000',
      scopes: ['groups:read'],
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects an API token on an endpoint outside its allowlist', () => {
    const request = {
      baseUrl: '/api/auth',
      headers: { authorization: 'Bearer kvitt_pat_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      method: 'GET',
      path: '/me',
    };
    const response = createResponse();
    const next = vi.fn();
    mocks.verifyApiToken.mockReturnValue({
      id: '00000000-0000-0000-0000-000000000000',
      scopes: ['groups:read'],
      user: { id: 4 },
    });

    authMiddleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an API token without the required scope', () => {
    const request = { auth: { type: 'api_token', scopes: ['groups:read'] } };
    const response = createResponse();
    const next = vi.fn();

    requireScope('expenses:write')(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows settlement reads for an existing expense-read token', () => {
    const request = {
      baseUrl: '/api/settlements',
      headers: { authorization: 'Bearer kvitt_pat_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      method: 'GET',
      path: '/12/balances',
    };
    const response = createResponse();
    const next = vi.fn();
    mocks.verifyApiToken.mockReturnValue({ id: 'token-id', scopes: ['expenses:read'], user: { id: 4 } });

    authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['PUT', 'DELETE'])('allows expense-write tokens to %s an expense', (method) => {
    const request = {
      baseUrl: '/api/expenses',
      headers: { authorization: 'Bearer kvitt_pat_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      method,
      path: '/12/34',
    };
    const response = createResponse();
    const next = vi.fn();
    mocks.verifyApiToken.mockReturnValue({ id: 'token-id', scopes: ['expenses:write'], user: { id: 4 } });

    authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('requires an interactive session for account operations', () => {
    const request = { auth: { type: 'api_token', scopes: [] } };
    const response = createResponse();
    const next = vi.fn();

    requireInteractiveSession(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});