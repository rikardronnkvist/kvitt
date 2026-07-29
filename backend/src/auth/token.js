import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';

const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'changeme-use-a-strong-secret';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      is_admin: Boolean(user.is_admin),
      full_name: user.full_name ?? null,
      phone: user.phone ?? null,
      initials: user.initials ?? null,
      username: user.username ?? null,
      user_handle: user.user_handle,
    },
    jwtSecret,
    { expiresIn: '7d' },
  );
}

export function getAuthUserById(userId) {
  return db.prepare(`
    SELECT id, username, is_admin, full_name, phone, initials, user_handle
    FROM users
    WHERE id = ?
  `).get(userId);
}
