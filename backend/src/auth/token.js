import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';

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
  return db.prepare(`
    SELECT id, is_admin, full_name, phone, initials, user_handle
    FROM users
    WHERE id = ?
  `).get(userId);
}
