import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmbeddedBrowser } from './embeddedBrowser.js';

test('recognizes known embedded browsers on iOS and Android', () => {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone) [FBAN/MessengerForiOS;FBAV/480.0]',
    'Mozilla/5.0 (Linux; Android 15) [FB_IAB/MESSENGER;FBAV/480.0]',
    'Mozilla/5.0 (iPhone) Instagram 350.0',
    'Mozilla/5.0 (iPhone) Line/15.0',
    'Mozilla/5.0 (Linux; Android 15) MicroMessenger/8.0',
  ]) {
    assert.equal(isEmbeddedBrowser(userAgent), true, userAgent);
  }
});

test('does not flag regular Safari, Chrome or Edge', () => {
  for (const userAgent of [
    '',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  ]) {
    assert.equal(isEmbeddedBrowser(userAgent), false, userAgent);
  }
});

test('recognizes an unbranded iOS webview but excludes standalone apps', () => {
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  assert.equal(isEmbeddedBrowser(userAgent), true);
  assert.equal(isEmbeddedBrowser(userAgent, { standalone: true }), false);
});

test('does not flag other regular iOS browsers', () => {
  for (const browser of ['CriOS/130.0', 'FxiOS/130.0', 'EdgiOS/130.0', 'OPiOS/130.0', 'DuckDuckGo/7.0']) {
    const userAgent = `Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ${browser} Mobile/15E148`;
    assert.equal(isEmbeddedBrowser(userAgent), false, browser);
  }
});