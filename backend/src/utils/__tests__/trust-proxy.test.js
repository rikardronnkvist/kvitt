import express from 'express';
import rateLimit from 'express-rate-limit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveRequestIp } from '../activity-log.js';
import { configureTrustProxy, getTrustProxySetting } from '../trust-proxy.js';

describe('trusted proxy configuration', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    configureTrustProxy(app, 'loopback, 172.16.0.0/12');
    app.use(rateLimit({
      windowMs: 60_000,
      limit: 1,
      standardHeaders: false,
      legacyHeaders: false,
    }));
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('trusts internal proxy ranges at both supported proxy hops', () => {
    const app = express();
    configureTrustProxy(app, '');
    const trust = app.get('trust proxy fn');

    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('172.20.0.5', 0)).toBe(true);
    expect(trust('172.20.0.5', 1)).toBe(true);
    expect(trust('203.0.113.10', 0)).toBe(false);
  });

  it('uses independent rate-limit keys behind Traefik and nginx', async () => {
    const firstHeaders = { 'X-Forwarded-For': '198.51.100.10, 172.20.0.10' };
    const secondHeaders = { 'X-Forwarded-For': '198.51.100.11, 172.20.0.10' };

    const first = await fetch(baseUrl, { headers: firstHeaders });
    const second = await fetch(baseUrl, { headers: secondHeaders });
    const repeated = await fetch(baseUrl, { headers: firstHeaders });

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ip: '198.51.100.10' });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ip: '198.51.100.11' });
    expect(repeated.status).toBe(429);
  });

  it('supports direct local requests without forwarding headers', async () => {
    const response = await fetch(baseUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ip: expect.stringMatching(/127\.0\.0\.1$/u) });
  });

  it('stops at an untrusted proxy instead of accepting a spoofed client', async () => {
    const response = await fetch(baseUrl, {
      headers: { 'X-Forwarded-For': '192.0.2.66, 198.51.100.77' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ip: '198.51.100.77' });
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
