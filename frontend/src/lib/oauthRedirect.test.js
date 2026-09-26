import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeOAuthRedirectTarget } from './oauthRedirect.js';

test('allows a response redirect on the registered HTTPS target', () => {
  assert.equal(isSafeOAuthRedirectTarget(
    'https://app.example/callback?code=code&state=state',
    'https://app.example/callback',
  ), true);
});

test('allows an exact RFC 8252 loopback HTTP target', () => {
  assert.equal(isSafeOAuthRedirectTarget(
    'http://127.0.0.1:43210/callback?code=code',
    'http://127.0.0.1:43210/callback',
  ), true);
});

test('rejects unsafe or different navigation targets', () => {
  for (const target of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://app.example/callback',
    'https://attacker.example/callback',
    'https://user@app.example/callback',
    'https://app.example:444/callback',
    'https://user:password@app.example/callback',
    'https://app.example/other',
  ]) {
    assert.equal(
      isSafeOAuthRedirectTarget(target, 'https://app.example/callback'),
      false,
      target,
    );
  }
});

test('rejects a safe URL that does not match the backend-validated target', () => {
  assert.equal(isSafeOAuthRedirectTarget(
    'https://attacker.example/callback?code=code',
    'https://app.example/callback',
  ), false);
});
