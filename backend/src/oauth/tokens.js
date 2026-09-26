import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { getAuthUserById, parseApiTokenScopes } from '../auth/token.js';
import { tryLogActivity } from '../utils/activity-log.js';

const TOKEN_SECRET_BYTES = 32;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_PATTERNS = Object.freeze({
  access: /^kvitt_oat_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/u,
  refresh: /^kvitt_ort_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/u,
});

export class OAuthTokenError extends Error {
  constructor(code = 'invalid_grant') {
    super(code);
    this.code = code;
  }
}

function hashSecret(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

function parseOAuthToken(token, type) {
  if (typeof token !== 'string') {
    return null;
  }

  const match = TOKEN_PATTERNS[type]?.exec(token);
  if (!match) {
    return null;
  }

  return {
    id: match[1],
    secretHash: hashSecret(match[2]),
  };
}

function cleanupExpiredOAuthRecords() {
  db.prepare(`
    DELETE FROM oauth_authorization_codes
    WHERE expires_at < datetime('now', '-7 days')
  `).run();
  db.prepare(`
    DELETE FROM oauth_tokens
    WHERE expires_at < datetime('now', '-7 days')
  `).run();
}

export function createOAuthToken(type) {
  const prefix = type === 'access' ? 'kvitt_oat' : type === 'refresh' ? 'kvitt_ort' : null;
  if (!prefix) {
    throw new TypeError('OAuth token type must be access or refresh');
  }

  const id = randomUUID();
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  return {
    id,
    token: `${prefix}_${id}_${secret}`,
    secretHash: hashSecret(secret),
  };
}

export function verifyOAuthAccessToken(token) {
  const parsed = parseOAuthToken(token, 'access');
  if (!parsed) {
    return null;
  }

  const record = db.prepare(`
    SELECT
      token.id,
      token.grant_id,
      token.scopes,
      token.resource,
      grant.user_id
    FROM oauth_tokens token
    JOIN oauth_grants grant ON grant.id = token.grant_id
    WHERE token.id = ?
      AND token.secret_hash = ?
      AND token.token_type = 'access'
      AND token.revoked_at IS NULL
      AND token.expires_at > CURRENT_TIMESTAMP
      AND grant.revoked_at IS NULL
  `).get(parsed.id, parsed.secretHash);
  if (!record) {
    return null;
  }

  const user = getAuthUserById(Number(record.user_id));
  if (!user) {
    return null;
  }

  db.prepare(`
    UPDATE oauth_grants
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (last_used_at IS NULL OR last_used_at < datetime('now', '-5 minutes'))
  `).run(record.grant_id);

  return {
    id: record.id,
    grantId: record.grant_id,
    scopes: parseApiTokenScopes(record.scopes),
    resource: record.resource,
    user,
  };
}

function insertTokenPair({ grantId, scopes, resource, familyId }) {
  const access = createOAuthToken('access');
  const refresh = createOAuthToken('refresh');
  const serializedScopes = JSON.stringify(scopes);

  db.prepare(`
    INSERT INTO oauth_tokens (
      id, grant_id, token_type, secret_hash, scopes, resource, family_id, expires_at
    )
    VALUES (?, ?, 'access', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))
  `).run(
    access.id,
    grantId,
    access.secretHash,
    serializedScopes,
    resource,
    familyId,
    ACCESS_TOKEN_TTL_SECONDS,
  );
  db.prepare(`
    INSERT INTO oauth_tokens (
      id, grant_id, token_type, secret_hash, scopes, resource, family_id, expires_at
    )
    VALUES (?, ?, 'refresh', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))
  `).run(
    refresh.id,
    grantId,
    refresh.secretHash,
    serializedScopes,
    resource,
    familyId,
    REFRESH_TOKEN_TTL_SECONDS,
  );

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scopes: [...scopes],
    familyId,
  };
}

export function issueTokenPair({ grantId, scopes, resource, familyId = randomUUID() }) {
  const issue = db.transaction(() => {
    cleanupExpiredOAuthRecords();
    return insertTokenPair({ grantId, scopes, resource, familyId });
  });
  return issue();
}

export function revokeFamily(familyId) {
  return db.prepare(`
    UPDATE oauth_tokens
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
    WHERE family_id = ?
  `).run(familyId);
}

export function revokeGrant(grantId) {
  const revoke = db.transaction(() => {
    db.prepare(`
      UPDATE oauth_grants
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(grantId);
    return db.prepare(`
      UPDATE oauth_tokens
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE grant_id = ?
    `).run(grantId);
  });
  return revoke();
}

export function revokeOAuthToken(token, clientId = null) {
  const parsedAccess = parseOAuthToken(token, 'access');
  const parsedRefresh = parseOAuthToken(token, 'refresh');
  const parsed = parsedAccess || parsedRefresh;
  if (!parsed) {
    return false;
  }

  const record = db.prepare(`
    SELECT token.id, token.token_type, token.family_id, grant.client_id
    FROM oauth_tokens token
    JOIN oauth_grants grant ON grant.id = token.grant_id
    WHERE token.id = ? AND token.secret_hash = ?
  `).get(parsed.id, parsed.secretHash);
  if (!record || (clientId && record.client_id !== clientId)) {
    return false;
  }

  if (record.token_type === 'refresh') {
    revokeFamily(record.family_id);
  } else {
    db.prepare(`
      UPDATE oauth_tokens
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(record.id);
  }
  return true;
}

export function rotateRefreshToken(token, clientId, resource, scopes) {
  const parsed = parseOAuthToken(token, 'refresh');
  if (!parsed) {
    throw new OAuthTokenError();
  }

  const rotate = db.transaction(() => {
    const record = db.prepare(`
      SELECT
        token.id,
        token.grant_id,
        token.scopes,
        token.resource,
        token.family_id,
        token.expires_at,
        token.used_at,
        token.revoked_at,
        grant.client_id,
        grant.revoked_at AS grant_revoked_at,
        grant.user_id
      FROM oauth_tokens token
      JOIN oauth_grants grant ON grant.id = token.grant_id
      WHERE token.id = ?
        AND token.secret_hash = ?
        AND token.token_type = 'refresh'
    `).get(parsed.id, parsed.secretHash);

    if (!record) {
      throw new OAuthTokenError();
    }
    if (record.used_at) {
      revokeFamily(record.family_id);
      return { reuse: record };
    }
    if (
      record.revoked_at
      || record.grant_revoked_at
      || record.expires_at <= db.prepare('SELECT CURRENT_TIMESTAMP AS now').get().now
      || record.client_id !== clientId
      || (resource && record.resource !== resource)
    ) {
      throw new OAuthTokenError();
    }

    const currentScopes = parseApiTokenScopes(record.scopes);
    const nextScopes = scopes || currentScopes;
    if (!nextScopes.every((scope) => currentScopes.includes(scope))) {
      throw new OAuthTokenError('invalid_scope');
    }

    db.prepare(`
      UPDATE oauth_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL
    `).run(record.id);

    cleanupExpiredOAuthRecords();
    return {
      pair: insertTokenPair({
        grantId: record.grant_id,
        scopes: nextScopes,
        resource: record.resource,
        familyId: record.family_id,
      }),
    };
  });

  const result = rotate();
  if (result.reuse) {
    tryLogActivity({
      eventType: 'oauth.refresh_reuse_detected',
      action: 'revoke',
      actorUserId: result.reuse.user_id,
      targetUserId: result.reuse.user_id,
      entityType: 'oauth_grant',
      metadata: { grant_id: result.reuse.grant_id, family_id: result.reuse.family_id },
    });
    throw new OAuthTokenError();
  }
  return result.pair;
}
