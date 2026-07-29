import express from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import requireAuth from '../middleware/auth.js';
import passkeyRoutes from '../auth/passkey.routes.js';
import { getAuthUserById, signToken } from '../auth/token.js';

const router = express.Router();
const isDevboxMode = process.env.DEVBOX === 'true' || process.env.NODE_ENV === 'development';

const devboxLoginSchema = z.object({
  user_id: z.coerce.number().int().positive(),
});

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  initials: z.string().trim().length(2).optional().or(z.literal('')),
});

router.use('/passkey', passkeyRoutes);

router.get('/devbox/users', (_req, res) => {
  if (!isDevboxMode) {
    return res.status(404).json({ error: 'Hittades inte.' });
  }

  const users = db.prepare(`
    SELECT id, full_name
    FROM users
    ORDER BY COALESCE(NULLIF(full_name, ''), id) COLLATE NOCASE
  `).all();

  return res.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.full_name || `Användare ${user.id}`,
      subtitle: null,
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

  const { full_name, phone, initials } = parsed.data;
  const normalizedInitials = initials && initials.trim().length === 2 ? initials.trim().toUpperCase() : null;
  const normalizedPhone = phone && phone.trim().length > 0 ? phone.trim() : null;
  const currentUser = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.user.id);

  if (!currentUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  db.prepare('UPDATE users SET full_name = ?, phone = ?, initials = ? WHERE id = ?').run(full_name, normalizedPhone, normalizedInitials, req.user.id);

  const updatedUser = getAuthUserById(req.user.id);
  return res.json({ token: signToken(updatedUser, { currentPasskeyId: req.user.current_passkey_id }), user: updatedUser });
});

export default router;
