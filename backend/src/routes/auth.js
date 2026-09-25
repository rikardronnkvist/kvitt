import express from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { db } from '../db/database.js';
import requireAuth, { requireInteractiveSession } from '../middleware/auth.js';
import passkeyRoutes from '../auth/passkey.routes.js';
import qrLoginRoutes from '../auth/qr-login.routes.js';
import {
  API_TOKEN_SCOPES,
  createApiToken,
  getAuthUserById,
  parseApiTokenScopes,
  signToken,
} from '../auth/token.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';
import { cleanupUserAvatarFiles, getAvatarFilePath } from '../utils/avatar.js';
import { isDevboxEnabled } from '../utils/devbox-mode.js';
import { getPhoneAndSwishEnabled } from '../utils/settings.js';

const router = express.Router();

const isDevboxMode = isDevboxEnabled();

const devboxLoginSchema = z.object({
  user_id: z.coerce.number().int().positive(),
});

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  initials: z.string().trim().length(2).optional().or(z.literal('')),
  theme_preference: z.enum(['system', 'light', 'dark']).optional(),
  avatar_data_url: z.string().trim().max(1_600_000).optional().or(z.literal('')),
  avatar_remove: z.boolean().optional(),
});

const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  can_write_expenses: z.boolean().default(false),
  expires_in_days: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().optional().default(90),
});

const API_TOKEN_LIMIT = 10;

const AVATAR_DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_AVATAR_BYTES = 768 * 1024;
const MAX_AVATAR_DIMENSION = 512;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isValidBase64Payload(value) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0;
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) {
    return null;
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function decodeAvatarDataUrl(avatarDataUrl) {
  const normalized = avatarDataUrl.trim();
  if (!normalized) {
    return null;
  }
  if (!normalized.startsWith(AVATAR_DATA_URL_PREFIX)) {
    return { error: 'Profilbild måste vara en PNG-bild.' };
  }

  const base64Payload = normalized.slice(AVATAR_DATA_URL_PREFIX.length).trim();
  if (!base64Payload || !isValidBase64Payload(base64Payload)) {
    return { error: 'Profilbilden kunde inte läsas.' };
  }

  const pngBuffer = Buffer.from(base64Payload, 'base64');
  if (pngBuffer.length === 0 || pngBuffer.length > MAX_AVATAR_BYTES) {
    return { error: 'Profilbilden är för stor.' };
  }
  if (!pngBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { error: 'Profilbild måste vara en giltig PNG.' };
  }

  const dimensions = readPngDimensions(pngBuffer);
  if (!dimensions?.width || !dimensions?.height) {
    return { error: 'Profilbilden kunde inte valideras.' };
  }
  if (dimensions.width > MAX_AVATAR_DIMENSION || dimensions.height > MAX_AVATAR_DIMENSION) {
    return { error: 'Profilbilden får vara max 512x512 pixlar.' };
  }

  return { pngBuffer };
}

function saveAvatarImage({ userId, pngBuffer }) {
  const digest = createHash('sha1').update(pngBuffer).digest('hex').slice(0, 12);
  const fileName = `user-${userId}-${Date.now()}-${digest}.png`;
  const outputPath = getAvatarFilePath(fileName);
  fs.writeFileSync(outputPath, pngBuffer, { flag: 'wx' });
  return fileName;
}

function updateAvatarForProfile({ userId, currentUser, avatarRemove, decodedAvatar }) {
  let avatarPath = currentUser.avatar_path || null;
  let avatarVersion = Number(currentUser.avatar_version) || 0;
  let avatarCleanupPath = null;

  if (avatarRemove) {
    avatarPath = null;
    if (currentUser.avatar_path) {
      avatarVersion += 1;
      avatarCleanupPath = currentUser.avatar_path;
    }

    return { avatarPath, avatarVersion, avatarCleanupPath };
  }

  if (decodedAvatar?.pngBuffer) {
    const nextAvatarPath = saveAvatarImage({ userId, pngBuffer: decodedAvatar.pngBuffer });
    avatarPath = nextAvatarPath;
    avatarVersion += 1;
    if (currentUser.avatar_path && currentUser.avatar_path !== nextAvatarPath) {
      avatarCleanupPath = currentUser.avatar_path;
    }
  }

  return { avatarPath, avatarVersion, avatarCleanupPath };
}

function normalizeProfilePhone({ phoneEnabled, phone, currentPhone }) {
  if (!phoneEnabled) {
    return currentPhone;
  }

  const trimmedPhone = phone?.trim();
  return trimmedPhone?.length ? trimmedPhone : null;
}

router.use('/passkey', passkeyRoutes);
router.use('/qr-login', qrLoginRoutes);

router.get('/devbox/users', (_req, res) => {
  if (!isDevboxMode) {
    return res.status(404).json({ error: 'Hittades inte.' });
  }

  const users = db.prepare(`
    SELECT id, full_name, is_admin
    FROM users
    WHERE is_placeholder = 0
    ORDER BY COALESCE(NULLIF(full_name, ''), id) COLLATE NOCASE
  `).all();

  return res.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.full_name || `Användare ${user.id}`,
      subtitle: null,
      is_admin: Boolean(user.is_admin),
    })),
  });
});

router.post('/devbox/login', (req, res) => {
  if (!isDevboxMode) {
    return res.status(404).json({ error: 'Hittades inte.' });
  }

  const parsed = devboxLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig användare.', details: parsed.error.flatten() });
  }

  const user = getAuthUserById(parsed.data.user_id);
  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  tryLogActivity({
    eventType: 'auth.login.succeeded',
    action: 'login',
    actorUserId: user.id,
    targetUserId: user.id,
    entityType: 'session',
    metadata: {
      source: 'devbox',
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, requireInteractiveSession, (req, res) => {
  const user = getAuthUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }
  return res.json({ user });
});

router.post('/logout', (_req, res) => {
  return res.status(204).send();
});

router.put('/profile', requireAuth, requireInteractiveSession, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig data.', details: parsed.error.flatten() });
  }

  const {
    full_name,
    phone,
    initials,
    theme_preference: themePreference,
    avatar_data_url: avatarDataUrl,
    avatar_remove: avatarRemove,
  } = parsed.data;
  const normalizedInitials = initials?.trim().length === 2 ? initials.trim().toUpperCase() : null;
  const currentUser = db.prepare('SELECT id, is_admin, full_name, phone, initials, theme_preference, avatar_path, avatar_version FROM users WHERE id = ?').get(req.user.id);

  if (!currentUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  const decodedAvatar = typeof avatarDataUrl === 'string' ? decodeAvatarDataUrl(avatarDataUrl) : null;
  if (decodedAvatar?.error) {
    return res.status(400).json({ error: decodedAvatar.error });
  }
  if (avatarRemove && decodedAvatar?.pngBuffer) {
    return res.status(400).json({ error: 'Välj antingen att ta bort eller ersätta profilbilden.' });
  }

  const phoneEnabled = getPhoneAndSwishEnabled();
  const { avatarPath, avatarVersion, avatarCleanupPath } = updateAvatarForProfile({
    userId: req.user.id,
    currentUser,
    avatarRemove,
    decodedAvatar,
  });
  const normalizedPhone = normalizeProfilePhone({
    phoneEnabled,
    phone,
    currentPhone: currentUser.phone,
  });
  const normalizedThemePreference = themePreference || currentUser.theme_preference || 'system';

  db.prepare('UPDATE users SET full_name = ?, phone = ?, initials = ?, theme_preference = ?, avatar_path = ?, avatar_version = ? WHERE id = ?')
    .run(full_name, normalizedPhone, normalizedInitials, normalizedThemePreference, avatarPath, avatarVersion, req.user.id);

  if (avatarCleanupPath || avatarRemove) {
    cleanupUserAvatarFiles(req.user.id, avatarCleanupPath);
  }

  tryLogActivity({
    eventType: 'user.profile.updated',
    action: 'update',
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    entityType: 'user',
    entityId: req.user.id,
    metadata: {
      before: {
        full_name: currentUser.full_name,
        phone: currentUser.phone,
        initials: currentUser.initials,
        theme_preference: currentUser.theme_preference || 'system',
        avatar_path: currentUser.avatar_path,
        avatar_version: Number(currentUser.avatar_version) || 0,
      },
      after: {
        full_name,
        phone: normalizedPhone,
        initials: normalizedInitials,
        theme_preference: normalizedThemePreference,
        avatar_path: avatarPath,
        avatar_version: avatarVersion,
      },
    },
    ipAddress: resolveRequestIp(req),
  });

  const updatedUser = getAuthUserById(req.user.id);
  return res.json({ token: signToken(updatedUser, { currentPasskeyId: req.user.current_passkey_id }), user: updatedUser });
});

function serializeApiToken(row) {
  return {
    id: row.id,
    name: row.name,
    scopes: parseApiTokenScopes(row.scopes),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  };
}

router.get('/api-tokens', requireAuth, requireInteractiveSession, (req, res) => {
  const tokens = db.prepare(`
    SELECT id, name, scopes, created_at, last_used_at, expires_at, revoked_at
    FROM api_tokens
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(req.user.id);

  return res.json({ tokens: tokens.map(serializeApiToken) });
});

router.post('/api-tokens', requireAuth, requireInteractiveSession, (req, res) => {
  const parsed = createApiTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig tokendata.', details: parsed.error.flatten() });
  }

  const activeCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM api_tokens
    WHERE user_id = ?
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(req.user.id);
  if (Number(activeCount.count) >= API_TOKEN_LIMIT) {
    return res.status(409).json({ error: 'Du kan ha högst 10 aktiva tokens.' });
  }

  const { id, token, secretHash } = createApiToken();
  const scopes = [
    API_TOKEN_SCOPES.groupsRead,
    API_TOKEN_SCOPES.expensesRead,
    API_TOKEN_SCOPES.settlementsRead,
  ];
  if (parsed.data.can_write_expenses) {
    scopes.push(API_TOKEN_SCOPES.expensesWrite);
  }

  db.prepare(`
    INSERT INTO api_tokens (id, user_id, name, secret_hash, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', '+' || ? || ' days') END)
  `).run(
    id,
    req.user.id,
    parsed.data.name,
    secretHash,
    JSON.stringify(scopes),
    parsed.data.expires_in_days,
    parsed.data.expires_in_days,
  );

  const record = db.prepare(`
    SELECT id, name, scopes, created_at, last_used_at, expires_at, revoked_at
    FROM api_tokens
    WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);

  tryLogActivity({
    eventType: 'api_token.created',
    action: 'create',
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    entityType: 'api_token',
    metadata: {
      token_id: id,
      name: parsed.data.name,
      scopes,
      expires_at: record.expires_at,
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.status(201).json({ token, api_token: serializeApiToken(record) });
});

router.delete('/api-tokens/:tokenId', requireAuth, requireInteractiveSession, (req, res) => {
  const result = db.prepare(`
    UPDATE api_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).run(req.params.tokenId, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Tokenen hittades inte.' });
  }

  tryLogActivity({
    eventType: 'api_token.revoked',
    action: 'revoke',
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    entityType: 'api_token',
    metadata: { token_id: req.params.tokenId },
    ipAddress: resolveRequestIp(req),
  });

  return res.status(204).send();
});

router.get('/mcp/me', requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      full_name: req.user.full_name,
      user_handle: req.user.user_handle,
    },
    token: req.auth?.type === 'api_token' ? {
      id: req.auth.tokenId,
      scopes: req.auth.scopes,
    } : null,
  });
});

export default router;
