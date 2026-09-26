import express from 'express';
import { describe, expect, it } from 'vitest';
import { resolveRequestIp } from '../activity-log.js';
import { configureTrustProxy, getTrustProxySetting } from '../trust-proxy.js';

describe('trusted proxy configuration', () => {
  it('trusts only internal proxy ranges by default', () => {
    const app = express();
    configureTrustProxy(app, '');
    const trust = app.get('trust proxy fn');

    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('172.20.0.5', 0)).toBe(true);
    expect(trust('203.0.113.10', 0)).toBe(false);
    expect(trust('172.20.0.5', 1)).toBe(false);
  });

  it('uses Express resolved IP instead of trusting a forwarded header directly', () => {
    expect(resolveRequestIp({
      headers: { 'x-forwarded-for': '198.51.100.99' },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
    })).toBe('203.0.113.10');
  });

  it('allows an explicit deployment proxy allowlist', () => {
    expect(getTrustProxySetting('10.42.0.0/16')).toBe('10.42.0.0/16');
  });
});
