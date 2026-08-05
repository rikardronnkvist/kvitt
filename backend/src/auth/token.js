import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { toAvatarUrl } from '../utils/avatar.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required and must not be empty');
}
export { jwtSecret };

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
    WHERE id = ?
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
