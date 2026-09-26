import assert from 'node:assert/strict';
import test from 'node:test';
import { getValidatedJwt, isQrLoginToken } from './qrLoginValidation.js';

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
