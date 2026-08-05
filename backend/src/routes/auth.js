import express from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { db } from '../db/database.js';
import requireAuth from '../middleware/auth.js';
import passkeyRoutes from '../auth/passkey.routes.js';
import { getAuthUserById, signToken } from '../auth/token.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';
import { cleanupUserAvatarFiles, getAvatarFilePath } from '../utils/avatar.js';
import { isDevboxEnabled } from '../utils/devbox-mode.js';

const router = express.Router();

const isDevboxMode = isDevboxEnabled();

const devboxLoginSchema = z.object({
  user_id: z.coerce.number().int().positive(),
});

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  initials: z.string().trim().length(2).optional().or(z.literal('')),
  avatar_data_url: z.string().trim().max(1_600_000).optional().or(z.literal('')),
  avatar_remove: z.boolean().optional(),
});

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
  if (!dimensions || !dimensions.width || !dimensions.height) {
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

router.use('/passkey', passkeyRoutes);

router.get('/devbox/users', (_req, res) => {
  if (!isDevboxMode) {
    return res.status(404).json({ error: 'Hittades inte.' });
  }

  const users = db.prepare(`
    SELECT id, full_name, is_admin
    FROM users
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

router.get('/me', requireAuth, (req, res) => {
  const user = getAuthUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }
  return res.json({ user });
});

router.post('/logout', (_req, res) => {
  return res.status(204).send();
});

router.put('/profile', requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig data.', details: parsed.error.flatten() });
  }

  const {
    full_name,
    phone,
    initials,
    avatar_data_url: avatarDataUrl,
    avatar_remove: avatarRemove,
  } = parsed.data;
  const normalizedInitials = initials?.trim().length === 2 ? initials.trim().toUpperCase() : null;
  const normalizedPhone = phone?.trim().length > 0 ? phone.trim() : null;
  const currentUser = db.prepare('SELECT id, is_admin, full_name, phone, initials, avatar_path, avatar_version FROM users WHERE id = ?').get(req.user.id);

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

  let avatarPath = currentUser.avatar_path || null;
  let avatarVersion = Number(currentUser.avatar_version) || 0;
  if (avatarRemove) {
    avatarPath = null;
    if (currentUser.avatar_path) {
      avatarVersion += 1;
      try {
        fs.rmSync(getAvatarFilePath(currentUser.avatar_path), { force: true });
      } catch {
        // ignore file cleanup errors
      }
    }
  } else if (decodedAvatar?.pngBuffer) {
    const nextAvatarPath = saveAvatarImage({ userId: req.user.id, pngBuffer: decodedAvatar.pngBuffer });
    avatarPath = nextAvatarPath;
    avatarVersion += 1;
    if (currentUser.avatar_path && currentUser.avatar_path !== nextAvatarPath) {
      try {
        fs.rmSync(getAvatarFilePath(currentUser.avatar_path), { force: true });
      } catch {
        // ignore cleanup errors after successful replacement
      }
    }
  }

  db.prepare('UPDATE users SET full_name = ?, phone = ?, initials = ?, avatar_path = ?, avatar_version = ? WHERE id = ?')
    .run(full_name, normalizedPhone, normalizedInitials, avatarPath, avatarVersion, req.user.id);

  if (avatarRemove) {
    cleanupUserAvatarFiles(req.user.id, null);
  } else if (decodedAvatar?.pngBuffer && avatarPath) {
    cleanupUserAvatarFiles(req.user.id, avatarPath);
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
        avatar_path: currentUser.avatar_path,
        avatar_version: Number(currentUser.avatar_version) || 0,
      },
      after: {
        full_name,
        phone: normalizedPhone,
        initials: normalizedInitials,
        avatar_path: avatarPath,
        avatar_version: avatarVersion,
      },
    },
    ipAddress: resolveRequestIp(req),
  });

  const updatedUser = getAuthUserById(req.user.id);
  return res.json({ token: signToken(updatedUser, { currentPasskeyId: req.user.current_passkey_id }), user: updatedUser });
});

export default router;
