import express from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/database.js';
import requireAuth from '../middleware/auth.js';
import passkeyRoutes from '../auth/passkey.routes.js';
import { getAuthUserById, signToken } from '../auth/token.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  full_name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  initials: z.string().trim().length(2).optional().or(z.literal('')),
  current_password: z.string().optional(),
  new_password: z.string().min(8).max(100).optional(),
}).refine((data) => !data.new_password || data.current_password, {
  message: 'Nuvarande lösenord krävs för att byta lösenord.',
  path: ['current_password'],
});

router.use('/passkey', passkeyRoutes);

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig registreringsdata.', details: parsed.error.flatten() });
  }

  const { email, password, full_name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);

  if (existing) {
    return res.status(409).json({ error: 'E-postadressen används redan.' });
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  const isFirstUser = Number(userCount.count) === 0;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, is_admin, password_hash, full_name, user_handle) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(null, normalizedEmail, isFirstUser ? 1 : 0, passwordHash, full_name, randomUUID());

  const user = getAuthUserById(result.lastInsertRowid);

  return res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig inloggningsdata.', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = db.prepare(
    'SELECT id, username, email, is_admin, password_hash, full_name, initials, user_handle FROM users WHERE email = ?',
  ).get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Felaktig e-post eller lösenord.' });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Felaktig e-post eller lösenord.' });
  }

  const { password_hash: _passwordHash, ...safeUser } = user;
  return res.json({ token: signToken(safeUser), user: safeUser });
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

  const { full_name, email, initials, current_password, new_password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const normalizedInitials = initials && initials.trim().length === 2 ? initials.trim().toUpperCase() : null;
  const currentUser = db.prepare('SELECT id, email, password_hash, is_admin FROM users WHERE id = ?').get(req.user.id);

  if (!currentUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  if (normalizedEmail !== currentUser.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalizedEmail, req.user.id);
    if (conflict) {
      return res.status(409).json({ error: 'E-postadressen används redan av ett annat konto.' });
    }
  }

  if (new_password) {
    const passwordOk = await bcrypt.compare(current_password, currentUser.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ error: 'Nuvarande lösenord är felaktigt.' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  }

  db.prepare('UPDATE users SET full_name = ?, email = ?, initials = ? WHERE id = ?').run(full_name, normalizedEmail, normalizedInitials, req.user.id);

  const updatedUser = getAuthUserById(req.user.id);
  return res.json({ token: signToken(updatedUser), user: updatedUser });
});

export default router;
