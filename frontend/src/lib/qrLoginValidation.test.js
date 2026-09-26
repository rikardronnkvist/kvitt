import assert from 'node:assert/strict';
import test from 'node:test';
import { getValidatedJwt, isQrLoginToken, verifyQrLoginJwt } from './qrLoginValidation.js';

test('accepts only a QR session UUID for request paths', () => {
  assert.equal(isQrLoginToken('a386319f-1320-4d80-a9df-985917196208'), true);
  for (const value of ['../admin', '%2Fadmin', 'a386319f-1320-4d80-a9df-985917196208/claim', null]) {
    assert.equal(isQrLoginToken(value), false);
  }
});

test('only stores a bounded JWT-shaped claim response', () => {
  assert.equal(getValidatedJwt({ jwt: 'eyJhbGciOiJIUzI1NiJ9.e30.signature' }), 'eyJhbGciOiJIUzI1NiJ9.e30.signature');
  for (const jwt of ['', 'not-a-jwt', 'a.b.c'.repeat(1500), null]) {
    assert.equal(getValidatedJwt({ jwt }), null);
  }
});

test('verifies the claimed JWT against the backend before it can be stored', async () => {
  const jwt = ['header', 'payload', 'signature'].join('.');
  let request;
  const fetchImpl = async (...args) => {
    request = args;
    return { ok: true, json: async () => ({ user: { id: 42 } }) };
  };

  assert.equal(await verifyQrLoginJwt(jwt, fetchImpl), true);
  assert.deepEqual(request, [
    '/api/auth/me',
    { headers: { Authorization: `Bearer ${jwt}` } },
  ]);
  assert.equal(await verifyQrLoginJwt('../admin', fetchImpl), false);
  assert.equal(await verifyQrLoginJwt(jwt, async () => ({
    ok: false,
    json: async () => ({}),
  })), false);
  assert.equal(await verifyQrLoginJwt(jwt, async () => ({
    ok: true,
    json: async () => ({ user: { id: '42' } }),
  })), false);
});
