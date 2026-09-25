import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { toAvatarUrl } from '../utils/avatar.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required and must not be empty');
}
export { jwtSecret };

export const API_TOKEN_SCOPES = Object.freeze({
  groupsRead: 'groups:read',
  expensesRead: 'expenses:read',
  expensesWrite: 'expenses:write',
  settlementsRead: 'settlements:read',
});

const API_TOKEN_PREFIX = 'kvitt_pat';
const API_TOKEN_SECRET_BYTES = 32;
const API_TOKEN_PATTERN = /^kvitt_pat_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/u;

function hashApiTokenSecret(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseApiTokenScopes(value) {
  try {
    const scopes = JSON.parse(value);
    return Array.isArray(scopes) && scopes.every((scope) => typeof scope === 'string') ? scopes : [];
  } catch {
    return [];
  }
}

export function createApiToken() {
  const id = randomUUID();
  const secret = randomBytes(API_TOKEN_SECRET_BYTES).toString('base64url');

  return {
    id,
    token: `${API_TOKEN_PREFIX}_${id}_${secret}`,
    secretHash: hashApiTokenSecret(secret),
  };
}

export function parseApiToken(token) {
  if (typeof token !== 'string') {
    return null;
  }

  const match = API_TOKEN_PATTERN.exec(token);
  if (!match) {
    return null;
  }

  return {
    id: match[1],
    secretHash: hashApiTokenSecret(match[2]),
  };
}

export function verifyApiToken(token) {
  const parsed = parseApiToken(token);
  if (!parsed) {
    return null;
  }

  const record = db.prepare(`
    SELECT id, user_id, scopes
    FROM api_tokens
    WHERE id = ?
      AND secret_hash = ?
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(parsed.id, parsed.secretHash);
  if (!record) {
    return null;
  }

  const user = getAuthUserById(Number(record.user_id));
  if (!user) {
    return null;
  }

  db.prepare(`
    UPDATE api_tokens
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND (last_used_at IS NULL OR last_used_at < datetime('now', '-5 minutes'))
  `).run(record.id);

  return {
    id: record.id,
    scopes: parseApiTokenScopes(record.scopes),
    user,
  };
}

export function signToken(user, { currentPasskeyId = null } = {}) {
  return jwt.sign(
    {
      id: user.id,
      is_admin: Boolean(user.is_admin),
      user_handle: user.user_handle,
      current_passkey_id: currentPasskeyId ? Number(currentPasskeyId) : null,
    },
    jwtSecret,
    { expiresIn: '7d' },
  );
}

export function getAuthUserById(userId) {
  const user = db.prepare(`
    SELECT id, is_admin, full_name, phone, initials, theme_preference, user_handle, avatar_path, avatar_version
    FROM users
    WHERE id = ? AND is_placeholder = 0
  `).get(userId);

  if (!user) {
    return null;
  }

  const {
    avatar_path: avatarPath,
    avatar_version: avatarVersion,
    ...rest
  } = user;

  return {
    ...rest,
    avatar_url: toAvatarUrl(avatarPath, avatarVersion),
  };
}
