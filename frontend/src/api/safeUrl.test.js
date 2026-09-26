import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSafeApiUrl } from './safeUrl.js';

const origin = 'https://kvitt.example';

test('rejects API path traversal and encoded path separators', () => {
  for (const path of [
    '/api/groups/../admin',
    '/api/groups/%2e%2e/admin',
    '/api/groups/%2Fadmin',
    '/api/groups/%5cadmin',
    '/api/groups/%0d%0aadmin',
    '/api/groups/%',
    '/api/groups/\nadmin',
  ]) {
    assert.equal(buildSafeApiUrl(path, origin), null, path);
  }
});

test('accepts safe same-origin API paths and preserves their query', () => {
  assert.equal(
    buildSafeApiUrl('/api/auth/qr-login/a386319f-1320-4d80-a9df-985917196208/status?poll=1', origin),
    '/api/auth/qr-login/a386319f-1320-4d80-a9df-985917196208/status?poll=1',
  );
});

test('rejects non-API paths and alternate origins', () => {
  for (const path of [
    '/admin',
    'https://attacker.example/api/admin',
    '//attacker.example/api/admin',
    '/api\\admin',
    '/api/admin#fragment',
  ]) {
    assert.equal(buildSafeApiUrl(path, origin), null, path);
  }
});
