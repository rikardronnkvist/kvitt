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
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    jwtSecret,
    { expiresIn: '7d' },
  );
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig registreringsdata.', details: parsed.error.flatten() });
  }

  const { username, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = db.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?',
  ).get(username, normalizedEmail);

  if (existing) {
    return res.status(409).json({ error: 'Användarnamn eller e-post används redan.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
  ).run(username, normalizedEmail, passwordHash);

  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(result.lastInsertRowid);

  return res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig inloggningsdata.', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = db.prepare(
    'SELECT id, username, email, password_hash FROM users WHERE email = ?',
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

export default router;
