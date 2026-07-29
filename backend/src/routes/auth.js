import express from 'express';
import bcrypt from 'bcryptjs';
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
  initials: z.string().trim().length(2).optional().or(z.literal('')),
  current_password: z.string().optional(),
  new_password: z.string().min(8).max(100).optional(),
}).refine((data) => !data.new_password || data.current_password, {
  message: 'Nuvarande lösenord krävs för att byta lösenord.',
  path: ['current_password'],
});

router.use('/passkey', passkeyRoutes);

router.get('/devbox/users', (_req, res) => {
  if (!isDevboxMode) {
    return res.status(404).json({ error: 'Hittades inte.' });
  }

  const users = db.prepare(`
    SELECT id, username, full_name
    FROM users
    ORDER BY COALESCE(NULLIF(full_name, ''), NULLIF(username, ''), id) COLLATE NOCASE
  `).all();

  return res.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.full_name || user.username || `Användare ${user.id}`,
      subtitle: user.username || null,
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

  const { full_name, initials, current_password, new_password } = parsed.data;
  const normalizedInitials = initials && initials.trim().length === 2 ? initials.trim().toUpperCase() : null;
  const currentUser = db.prepare('SELECT id, password_hash, is_admin FROM users WHERE id = ?').get(req.user.id);

  if (!currentUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  if (new_password) {
    const passwordOk = await bcrypt.compare(current_password, currentUser.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ error: 'Nuvarande lösenord är felaktigt.' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  }

  db.prepare('UPDATE users SET full_name = ?, initials = ? WHERE id = ?').run(full_name, normalizedInitials, req.user.id);

  const updatedUser = getAuthUserById(req.user.id);
  return res.json({ token: signToken(updatedUser), user: updatedUser });
});

export default router;
