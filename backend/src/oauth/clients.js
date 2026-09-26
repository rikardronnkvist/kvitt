import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { db } from '../db/database.js';
import { isValidDcrRedirectUri } from './redirect.js';

const CIMD_MAX_BYTES = 10 * 1024;
const CIMD_MAX_CACHE_SECONDS = 60 * 60;
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
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: z.string().refine(isAbsoluteUrl).optional(),
  logo_uri: z.string().refine(isAbsoluteUrl).optional(),
  redirect_uris: z.array(z.string().refine(isAbsoluteUrl)).min(1),
  token_endpoint_auth_method: z.literal('none').default('none'),
});

export const dcrClientSchema = z.object({
  redirect_uris: z.array(z.string()).min(1)
    .refine((uris) => uris.every(isValidDcrRedirectUri)),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: z.string().refine(isAbsoluteUrl).optional(),
  logo_uri: z.string().refine(isAbsoluteUrl).optional(),
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

async function assertPublicHost(url, lookupImpl) {
  if (process.env.OAUTH_CIMD_ALLOW_PRIVATE === 'true') {
    return;
  }

  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new OAuthClientError();
    }
    return;
  }

  let addresses;
  try {
    addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new OAuthClientError();
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new OAuthClientError();
  }
}

async function readLimitedBody(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > CIMD_MAX_BYTES) {
    throw new OAuthClientError();
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > CIMD_MAX_BYTES) {
      throw new OAuthClientError();
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > CIMD_MAX_BYTES) {
      await reader.cancel();
      throw new OAuthClientError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
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
  { fetchImpl = globalThis.fetch, lookupImpl = lookup } = {},
) {
  const cached = cimdCache.get(clientId);
  if (cached?.expiresAt > Date.now()) {
    return cached.client;
  }
  cimdCache.delete(clientId);

  const url = validateCimdUrl(clientId);
  await assertPublicHost(url, lookupImpl);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || !/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') || '')) {
      throw new OAuthClientError();
    }

    const body = await readLimitedBody(response);
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
    const ttlMs = getCacheTtlMs(response.headers.get('cache-control'));
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
