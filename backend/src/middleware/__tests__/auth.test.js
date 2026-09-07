import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUserById: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: mocks.verify },
}));

vi.mock('../../auth/token.js', () => ({
  getAuthUserById: mocks.getAuthUserById,
  jwtSecret: 'test-secret',
}));

import authMiddleware from '../auth.js';

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
    expect(next).toHaveBeenCalledOnce();
  });
});