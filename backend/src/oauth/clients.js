import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { z } from 'zod';
import { db } from '../db/database.js';
import { isValidOAuthRedirectUri } from './redirect.js';

const CIMD_MAX_BYTES = 10 * 1024;
const CIMD_MAX_CACHE_SECONDS = 60 * 60;
const CIMD_REQUEST_TIMEOUT_MS = 5_000;
const CLIENT_SECRET_BYTES = 32;
const cimdCache = new Map();

export class OAuthClientError extends Error {
  constructor(code = 'invalid_client', description = null) {
    super(description || code);
    this.code = code;
    this.description = description;
  }
}

function isAbsoluteUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const cimdSchema = z.object({
  client_id: z.string().max(2048),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: z.string().max(2048).refine(isAbsoluteUrl).optional(),
  logo_uri: z.string().max(2048).refine(isAbsoluteUrl).optional(),
  redirect_uris: z.array(
    z.string().max(4096).refine(isValidOAuthRedirectUri),
  ).min(1).max(20),
  token_endpoint_auth_method: z.literal('none').default('none'),
});

export const dcrClientSchema = z.object({
  redirect_uris: z.array(z.string().max(4096)).min(1).max(20)
    .refine((uris) => uris.every(isValidOAuthRedirectUri)),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: z.string().max(2048).refine(isAbsoluteUrl).optional(),
  logo_uri: z.string().max(2048).refine(isAbsoluteUrl).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).default('none'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1)
    .default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.literal('code')).min(1).default(['code']),
});

function hashClientSecret(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224
  );
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return isIP(mappedIpv4) === 4 ? isPrivateIpv4(mappedIpv4) : true;
  }

  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return (
    (firstHextet & 0xfe00) === 0xfc00
    || (firstHextet & 0xffc0) === 0xfe80
    || (firstHextet & 0xff00) === 0xff00
  );
}

function isPrivateAddress(address) {
  const version = isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : true;
}

function validateCimdUrl(clientId) {
  let url;
  try {
    url = new URL(clientId);
  } catch {
    throw new OAuthClientError();
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
    || url.pathname === '/'
    || url.hostname.toLowerCase() === 'localhost'
    || url.hostname.toLowerCase().endsWith('.localhost')
  ) {
    throw new OAuthClientError();
  }
  return url;
}

async function resolveCimdAddresses(url, lookupImpl) {
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (isIP(hostname)) {
    if (process.env.OAUTH_CIMD_ALLOW_PRIVATE !== 'true' && isPrivateAddress(hostname)) {
      throw new OAuthClientError();
    }
    return [{ address: hostname, family: isIP(hostname) }];
  }

  let addresses;
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new OAuthClientError();
  }
  const validated = addresses
    .map(({ address }) => ({ address, family: isIP(address) }))
    .filter(({ family }) => family !== 0);
  if (
    validated.length !== addresses.length
    || !validated.length
    || (
      process.env.OAUTH_CIMD_ALLOW_PRIVATE !== 'true'
      && validated.some(({ address }) => isPrivateAddress(address))
    )
  ) {
    throw new OAuthClientError();
  }
  return [...new Map(validated.map((entry) => [`${entry.family}:${entry.address}`, entry])).values()];
}

function dnsLookupError(code, hostname) {
  return Object.assign(new Error(`CIMD DNS lookup rejected for ${hostname}`), {
    code,
    hostname,
  });
}

export function createPinnedDnsLookup(expectedHostname, validatedAddresses) {
  const expected = expectedHostname.toLowerCase();
  let nextAddress = 0;

  return (hostname, options, callback) => {
    const normalizedHostname = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
    if (normalizedHostname !== expected) {
      queueMicrotask(() => callback(dnsLookupError('EACCES', hostname)));
      return;
    }

    const lookupOptions = typeof options === 'number' ? { family: options } : (options || {});
    const requestedFamily = Number(lookupOptions.family) || 0;
    const candidates = validatedAddresses.filter(
      ({ family }) => requestedFamily === 0 || family === requestedFamily,
    );
    if (!candidates.length) {
      queueMicrotask(() => callback(dnsLookupError('ENOTFOUND', hostname)));
      return;
    }

    if (lookupOptions.all) {
      queueMicrotask(() => callback(null, candidates.map(({ address, family }) => ({
        address,
        family,
      }))));
      return;
    }

    const selected = candidates[nextAddress % candidates.length];
    nextAddress += 1;
    queueMicrotask(() => callback(null, selected.address, selected.family));
  };
}

function readHeader(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestCimdDocument(url, hostname, validatedAddresses, requestImpl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectRequest = (error = new OAuthClientError()) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof OAuthClientError ? error : new OAuthClientError());
    };

    const request = requestImpl({
      protocol: 'https:',
      hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Host: url.host,
      },
      lookup: createPinnedDnsLookup(hostname, validatedAddresses),
      servername: isIP(hostname) ? undefined : hostname,
    }, (response) => {
      const contentType = readHeader(response.headers, 'content-type') || '';
      const contentLength = Number(readHeader(response.headers, 'content-length'));
      if (
        !Number.isInteger(response.statusCode)
        || response.statusCode < 200
        || response.statusCode >= 300
        || !/^application\/json(?:\s*;|$)/iu.test(contentType)
        || (Number.isFinite(contentLength) && contentLength > CIMD_MAX_BYTES)
      ) {
        response.resume();
        rejectRequest();
        return;
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        if (settled) {
          return;
        }
        const buffer = Buffer.from(chunk);
        total += buffer.length;
        if (total > CIMD_MAX_BYTES) {
          response.destroy();
          rejectRequest();
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          cacheControl: readHeader(response.headers, 'cache-control'),
        });
      });
      response.on('error', rejectRequest);
    });

    request.on('error', rejectRequest);
    request.setTimeout(CIMD_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('CIMD request timed out'));
    });
    request.end();
  });
}

function getCacheTtlMs(cacheControl) {
  if (/\bno-store\b/iu.test(cacheControl || '')) {
    return 0;
  }
  const match = /\bmax-age\s*=\s*(\d+)/iu.exec(cacheControl || '');
  const seconds = match
    ? Math.min(Number(match[1]), CIMD_MAX_CACHE_SECONDS)
    : CIMD_MAX_CACHE_SECONDS;
  return Math.max(0, seconds) * 1000;
}

export function clearClientCache(clientId) {
  if (clientId) {
    cimdCache.delete(clientId);
  } else {
    cimdCache.clear();
  }
}

export async function resolveCimdClient(
  clientId,
  {
    lookupImpl = lookup,
    requestImpl = httpsRequest,
  } = {},
) {
  const cached = cimdCache.get(clientId);
  if (cached?.expiresAt > Date.now()) {
    return cached.client;
  }
  cimdCache.delete(clientId);

  const url = validateCimdUrl(clientId);
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  const validatedAddresses = await resolveCimdAddresses(url, lookupImpl);

  try {
    const { body, cacheControl } = await requestCimdDocument(
      url,
      hostname,
      validatedAddresses,
      requestImpl,
    );
    let document;
    try {
      document = JSON.parse(body);
    } catch {
      throw new OAuthClientError();
    }
    const parsed = cimdSchema.safeParse(document);
    if (!parsed.success || parsed.data.client_id !== clientId) {
      throw new OAuthClientError();
    }

    const client = {
      clientId,
      clientName: parsed.data.client_name || null,
      clientUri: parsed.data.client_uri || null,
      logoUri: parsed.data.logo_uri || null,
      redirectUris: parsed.data.redirect_uris,
      tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
      kind: 'cimd',
    };
    const ttlMs = getCacheTtlMs(cacheControl);
    if (ttlMs > 0) {
      cimdCache.set(clientId, { client, expiresAt: Date.now() + ttlMs });
    }
    return client;
  } catch (error) {
    cimdCache.delete(clientId);
    if (error instanceof OAuthClientError) {
      throw error;
    }
    throw new OAuthClientError();
  }
}

function deserializeDcrClient(row) {
  let redirectUris;
  try {
    redirectUris = JSON.parse(row.redirect_uris);
  } catch {
    throw new OAuthClientError();
  }
  if (!Array.isArray(redirectUris)) {
    throw new OAuthClientError();
  }

  return {
    clientId: row.client_id,
    clientName: row.client_name,
    clientUri: row.client_uri,
    logoUri: row.logo_uri,
    redirectUris,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
    kind: 'dcr',
  };
}

export async function resolveClient(clientId) {
  if (typeof clientId !== 'string' || !clientId) {
    throw new OAuthClientError();
  }
  if (clientId.startsWith('https://')) {
    return resolveCimdClient(clientId);
  }

  const record = db.prepare(`
    SELECT client_id, client_name, client_uri, logo_uri, redirect_uris, token_endpoint_auth_method
    FROM oauth_clients
    WHERE client_id = ?
  `).get(clientId);
  if (!record) {
    throw new OAuthClientError();
  }
  return deserializeDcrClient(record);
}

export function registerDcrClient(input) {
  const parsed = dcrClientSchema.safeParse(input);
  if (!parsed.success) {
    throw new OAuthClientError('invalid_client_metadata');
  }

  const metadata = parsed.data;
  const clientId = `kvitt_dcr_${randomUUID()}`;
  const confidential = metadata.token_endpoint_auth_method !== 'none';
  const clientSecret = confidential
    ? `kvitt_dcs_${randomUUID()}_${randomBytes(CLIENT_SECRET_BYTES).toString('base64url')}`
    : null;

  db.prepare(`
    INSERT INTO oauth_clients (
      client_id,
      client_secret_hash,
      client_name,
      client_uri,
      logo_uri,
      redirect_uris,
      token_endpoint_auth_method
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId,
    clientSecret ? hashClientSecret(clientSecret) : null,
    metadata.client_name || null,
    metadata.client_uri || null,
    metadata.logo_uri || null,
    JSON.stringify(metadata.redirect_uris),
    metadata.token_endpoint_auth_method,
  );

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: metadata.client_name,
    client_uri: metadata.client_uri,
    logo_uri: metadata.logo_uri,
    redirect_uris: metadata.redirect_uris,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method,
    grant_types: metadata.grant_types,
    response_types: metadata.response_types,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
  };
}

export function verifyDcrClientSecret(clientId, clientSecret) {
  if (typeof clientSecret !== 'string' || !clientSecret) {
    return false;
  }
  const record = db.prepare(`
    SELECT client_secret_hash
    FROM oauth_clients
    WHERE client_id = ?
  `).get(clientId);
  if (!record?.client_secret_hash) {
    return false;
  }

  const actual = Buffer.from(hashClientSecret(clientSecret), 'hex');
  const expected = Buffer.from(record.client_secret_hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
