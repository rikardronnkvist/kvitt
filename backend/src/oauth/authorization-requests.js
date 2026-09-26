import { randomBytes } from 'node:crypto';

export const AUTHORIZATION_REQUEST_TTL_MS = 5 * 60 * 1000;
export const AUTHORIZATION_REQUEST_HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const MAX_QUERY_BYTES = 16 * 1024;
const MAX_STORED_REQUESTS = 5_000;
const PARAMETER_LIMITS = new Map([
  ['client_id', 2048],
  ['code_challenge', 128],
  ['code_challenge_method', 16],
  ['redirect_uri', 4096],
  ['resource', 2048],
  ['response_type', 32],
  ['scope', 1000],
  ['state', 2048],
]);

export class AuthorizationRequestError extends Error {}
export class AuthorizationRequestCapacityError extends AuthorizationRequestError {}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(value.replace(/\+/gu, ' '));
  } catch {
    throw new AuthorizationRequestError();
  }
}

export function normalizeAuthorizationQuery(rawQuery) {
  if (
    typeof rawQuery !== 'string'
    || rawQuery.length === 0
    || Buffer.byteLength(rawQuery, 'utf8') > MAX_QUERY_BYTES
    || rawQuery.includes('#')
  ) {
    throw new AuthorizationRequestError();
  }

  const normalized = new URLSearchParams();
  const seen = new Set();
  for (const part of rawQuery.split('&')) {
    if (!part) {
      throw new AuthorizationRequestError();
    }
    const separator = part.indexOf('=');
    const encodedKey = separator === -1 ? part : part.slice(0, separator);
    const encodedValue = separator === -1 ? '' : part.slice(separator + 1);
    const key = decodeQueryComponent(encodedKey);
    const value = decodeQueryComponent(encodedValue);
    const maxLength = PARAMETER_LIMITS.get(key);
    if (maxLength === undefined || seen.has(key) || value.length > maxLength) {
      throw new AuthorizationRequestError();
    }
    seen.add(key);
    normalized.append(key, value);
  }

  if (!seen.size) {
    throw new AuthorizationRequestError();
  }
  return normalized.toString();
}

export function createAuthorizationRequestStore({
  now = Date.now,
  randomBytesImpl = randomBytes,
  scheduleCleanup = setInterval,
  cancelCleanup = clearInterval,
  ttlMs = AUTHORIZATION_REQUEST_TTL_MS,
  maxEntries = MAX_STORED_REQUESTS,
} = {}) {
  const requests = new Map();
  const cleanup = () => {
    const currentTime = now();
    for (const [handle, request] of requests) {
      if (request.expiresAt <= currentTime) {
        requests.delete(handle);
      }
    }
  };
  const cleanupTimer = scheduleCleanup(cleanup, Math.min(ttlMs, 60_000));
  cleanupTimer?.unref?.();

  return {
    create(rawQuery) {
      const query = normalizeAuthorizationQuery(rawQuery);
      cleanup();
      if (requests.size >= maxEntries) {
        throw new AuthorizationRequestCapacityError();
      }

      let handle;
      do {
        handle = randomBytesImpl(32).toString('base64url');
      } while (requests.has(handle));
      const expiresAt = now() + ttlMs;
      requests.set(handle, {
        query,
        expiresAt,
        userId: null,
      });
      return { handle, expiresAt };
    },

    resolve(handle, userId) {
      if (!AUTHORIZATION_REQUEST_HANDLE_PATTERN.test(handle || '')) {
        return null;
      }
      const request = requests.get(handle);
      if (!request || request.expiresAt <= now()) {
        requests.delete(handle);
        return null;
      }
      if (request.userId !== null && request.userId !== userId) {
        return null;
      }
      request.userId = userId;
      return {
        query: request.query,
        parameters: Object.fromEntries(new URLSearchParams(request.query)),
        expiresAt: request.expiresAt,
      };
    },

    delete(handle) {
      requests.delete(handle);
    },

    clear() {
      requests.clear();
    },

    dispose() {
      cancelCleanup(cleanupTimer);
      requests.clear();
    },

    get size() {
      return requests.size;
    },
  };
}

export const authorizationRequestStore = createAuthorizationRequestStore();
