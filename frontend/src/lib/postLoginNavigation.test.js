import assert from 'node:assert/strict';
import test from 'node:test';
import {
  navigateAfterLogin,
  storePendingOAuthRequest,
} from './postLoginNavigation.js';

function withSessionStorage(run) {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  try {
    run();
  } finally {
    delete globalThis.sessionStorage;
  }
}

test('preserves an allowlisted raw OAuth query for one post-login navigation', () => {
  withSessionStorage(() => {
    const rawQuery = [
      'response_type=code',
      'client_id=https%3A%2F%2Fclient.example%2Fmetadata.json',
      'redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
      'state=state%2Bwith%2Bencoding',
      'code_challenge=challenge',
      'code_challenge_method=S256',
      'scope=groups%3Aread+expenses%3Aread',
      'resource=https%3A%2F%2Fkvitt.example%2Fmcp',
    ].join('&');
    const navigations = [];

    storePendingOAuthRequest(`?${rawQuery}`);
    navigateAfterLogin((path) => navigations.push(path));
    navigateAfterLogin((path) => navigations.push(path));

    assert.deepEqual(navigations, [`/oauth/authorize?${rawQuery}`, '/']);
  });
});

test('rejects non-OAuth keys and duplicate query parameters', () => {
  withSessionStorage(() => {
    for (const query of [
      '?client_id=client&next=https%3A%2F%2Fattacker.example',
      '?client_id=first&client_id=second',
      '?client_id=client#fragment',
    ]) {
      let destination;
      storePendingOAuthRequest(query);
      navigateAfterLogin((path) => {
        destination = path;
      });
      assert.equal(destination, '/');
    }
  });
});
