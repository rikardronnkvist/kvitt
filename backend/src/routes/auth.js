import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/database.js';

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || 'changeme-use-a-strong-secret';

const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  full_name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, is_admin: Boolean(user.is_admin), full_name: user.full_name },
    jwtSecret,
    { expiresIn: '7d' },
  );
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig registreringsdata.', details: parsed.error.flatten() });
  }

  const { username, email, password, full_name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = db.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?',
  ).get(username, normalizedEmail);

  if (existing) {
    return res.status(409).json({ error: 'Användarnamn eller e-post används redan.' });
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  const isFirstUser = Number(userCount.count) === 0;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, is_admin, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
  ).run(username, normalizedEmail, isFirstUser ? 1 : 0, passwordHash, full_name);

  const user = db.prepare('SELECT id, username, email, is_admin, full_name FROM users WHERE id = ?').get(result.lastInsertRowid);

  return res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig inloggningsdata.', details: parsed.error.flatten() });
  }

  const { identifier, password } = parsed.data;
  const isEmail = identifier.includes('@');
  const user = isEmail
    ? db.prepare(
      'SELECT id, username, email, is_admin, password_hash, full_name FROM users WHERE email = ?',
    ).get(identifier.toLowerCase())
    : db.prepare(
      'SELECT id, username, email, is_admin, password_hash, full_name FROM users WHERE username = ?',
    ).get(identifier);

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

export default router;
