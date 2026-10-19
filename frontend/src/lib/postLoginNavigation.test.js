import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOAuthLoginPath,
  clearOAuthRequestHandle,
  getOAuthRequestHandle,
  getInviteTokenFromSearch,
  navigateAfterLogin,
  PENDING_INVITE_TOKEN_KEY,
  OAUTH_REQUEST_HANDLE_KEY,
  rememberOAuthRequestHandle,
} from './postLoginNavigation.js';

const handle = 'abcdefghijklmnopqrstuvwxyzABCDEFGH012345678';

test('returns to the invitation from the URL without session storage state', () => {
  withSessionStorage(() => {
    let destination;
    navigateAfterLogin((path) => { destination = path; }, {}, '?invite=svartgol-token');
    assert.equal(destination, '/invite/svartgol-token');
  });
});

test('prefers the current invitation and consumes an older stored invitation', () => {
  withSessionStorage((values) => {
    values.set(PENDING_INVITE_TOKEN_KEY, 'previous-token');
    let destination;
    navigateAfterLogin((path) => { destination = path; }, {}, '?invite=svartgol-token');
    assert.equal(destination, '/invite/svartgol-token');
    assert.equal(values.has(PENDING_INVITE_TOKEN_KEY), false);
  });
});

test('keeps legacy invitation navigation and rejects invalid invitation tokens', () => {
  withSessionStorage((values) => {
    values.set(PENDING_INVITE_TOKEN_KEY, 'legacy-invite');
    let destination;
    navigateAfterLogin((path) => { destination = path; }, {}, '');
    assert.equal(destination, '/invite/legacy-invite');
    for (const search of ['?invite=short', '?invite=../../admin', '?invite=valid-token&invite=another-token']) {
      assert.equal(getInviteTokenFromSearch(search), null);
      navigateAfterLogin((path) => { destination = path; }, {}, search);
      assert.equal(destination, '/');
    }
  });
});

function withSessionStorage(run) {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  try {
    run(values);
  } finally {
    delete globalThis.sessionStorage;
  }
}

test('navigates after login using only a validated opaque handle', () => {
  withSessionStorage(() => {
    const navigations = [];
    assert.equal(buildOAuthLoginPath(handle), `/login?oauth_request=${handle}`);

    navigateAfterLogin(
      (path) => navigations.push(path),
      {},
      `?oauth_request=${handle}`,
    );
    navigateAfterLogin((path) => navigations.push(path), {}, '');

    assert.deepEqual(navigations, [`/oauth/authorize?request=${handle}`, '/']);
  });
});

test('survives a reload or intermediate authentication route through session storage', () => {
  withSessionStorage((values) => {
    const navigations = [];
    assert.equal(rememberOAuthRequestHandle(handle), true);
    assert.equal(values.get(OAUTH_REQUEST_HANDLE_KEY), handle);

    navigateAfterLogin((path) => navigations.push(path), {}, '?token=recovery-token');

    assert.deepEqual(navigations, [`/oauth/authorize?request=${handle}`]);
    assert.equal(values.has(OAUTH_REQUEST_HANDLE_KEY), false);
  });
});

test('rejects invalid handles, duplicate parameters and arbitrary return targets', () => {
  withSessionStorage(() => {
    for (const search of [
      '?oauth_request=short',
      `?oauth_request=${handle}&oauth_request=${handle}`,
      `?oauth_request=${handle}&next=https%3A%2F%2Fattacker.example`,
      '?next=https%3A%2F%2Fattacker.example',
    ]) {
      assert.equal(getOAuthRequestHandle(search), null);
      let destination;
      navigateAfterLogin((path) => {
        destination = path;
      }, {}, search);
      assert.equal(destination, '/');
    }
  });
});

test('never stores raw OAuth authorization parameters', () => {
  withSessionStorage((values) => {
    assert.equal(rememberOAuthRequestHandle('client_id=client&redirect_uri=https://attacker.example'), false);
    assert.equal(values.size, 0);
  });
});

test('discards a poisoned stored OAuth handle before navigation', () => {
  withSessionStorage((values) => {
    values.set(OAUTH_REQUEST_HANDLE_KEY, '../admin');
    let destination;

    navigateAfterLogin((path) => {
      destination = path;
    }, {}, '');

    assert.equal(destination, '/');
    assert.equal(values.has(OAUTH_REQUEST_HANDLE_KEY), false);
  });
});

test('clears a resolved authorization handle before later logins', () => {
  withSessionStorage((values) => {
    assert.equal(rememberOAuthRequestHandle(handle), true);
    clearOAuthRequestHandle();

    let destination;
    navigateAfterLogin((path) => {
      destination = path;
    }, {}, '');

    assert.equal(values.has(OAUTH_REQUEST_HANDLE_KEY), false);
    assert.equal(destination, '/');
  });
});
