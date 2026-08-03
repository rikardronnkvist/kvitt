import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';
import { isConfigured } from '../utils/push.js';

const router = express.Router();

// public — VAPID public key is not secret
router.get('/vapid-public-key', (_req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Push notifications are not configured.' });
  }
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.use(authMiddleware);

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post('/subscribe', (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Push notifications are not configured.' });
  }

  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig prenumerationsdata.', details: parsed.error.flatten() });
  }

  const { endpoint, keys } = parsed.data;
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(req.user.id, endpoint, keys.p256dh, keys.auth);

  return res.status(201).json({ ok: true });
});

router.delete('/subscribe', (req, res) => {
  const { endpoint } = req.body ?? {};
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.user.id, endpoint);
  }
  return res.json({ ok: true });
});

export default router;
