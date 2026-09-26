import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationRequestCapacityError,
  AuthorizationRequestError,
  createAuthorizationRequestStore,
  normalizeAuthorizationQuery,
} from '../authorization-requests.js';

describe('OAuth authorization request handles', () => {
  it('normalizes only allowlisted, unique parameters', () => {
    expect(normalizeAuthorizationQuery(
      'response_type=code&scope=groups%3Aread+expenses%3Aread&state=a%2Bb',
    )).toBe('response_type=code&scope=groups%3Aread+expenses%3Aread&state=a%2Bb');

    for (const query of [
      'client_id=one&client_id=two',
      'client_id=client&next=https%3A%2F%2Fattacker.example',
      'client_id=%E0%A4%A',
      `state=${'x'.repeat(2049)}`,
      'client_id=client&',
    ]) {
      expect(() => normalizeAuthorizationQuery(query)).toThrow(AuthorizationRequestError);
    }
  });

  it('creates high-entropy opaque handles and binds resolution to the first user', () => {
    const store = createAuthorizationRequestStore({
      scheduleCleanup: () => ({ unref() {} }),
      cancelCleanup: () => {},
    });
    const { handle } = store.create('client_id=client&response_type=code');

    expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(store.resolve(handle, 1)?.parameters).toEqual({
      client_id: 'client',
      response_type: 'code',
    });
    expect(store.resolve(handle, 2)).toBeNull();
    store.dispose();
  });

  it('expires and cleans up requests using injectable time and scheduling', () => {
    let currentTime = 1_000;
    let cleanup;
    const timer = { unref: vi.fn() };
    const cancelCleanup = vi.fn();
    const store = createAuthorizationRequestStore({
      now: () => currentTime,
      ttlMs: 300_000,
      scheduleCleanup: (callback) => {
        cleanup = callback;
        return timer;
      },
      cancelCleanup,
    });
    const { handle } = store.create('client_id=client');

    expect(store.size).toBe(1);
    currentTime += 300_000;
    cleanup();
    expect(store.size).toBe(0);
    expect(store.resolve(handle, 1)).toBeNull();
    store.dispose();
    expect(timer.unref).toHaveBeenCalledOnce();
    expect(cancelCleanup).toHaveBeenCalledWith(timer);
  });

  it('keeps the in-memory store bounded', () => {
    let value = 0;
    const store = createAuthorizationRequestStore({
      maxEntries: 1,
      randomBytesImpl: () => Buffer.alloc(32, value += 1),
      scheduleCleanup: () => null,
      cancelCleanup: () => {},
    });
    store.create('client_id=first');
    expect(() => store.create('client_id=second')).toThrow(AuthorizationRequestCapacityError);
    store.dispose();
  });
});
