import express from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { qrLoginStore } from './qr-login-store.js';
import { jwtSecret, getAuthUserById } from './token.js';
import { getFrontendPublicOrigin } from '../utils/public-origin.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const completeSchema = z.object({
  jwt: z.string().min(1).max(4096),
});

// POST /api/auth/qr-login — create a pending QR login session
router.post('/', (_req, res) => {
  const token = randomUUID();
  const claimSecret = randomUUID();
  const loginUrl = `${getFrontendPublicOrigin()}/qr-login/${token}`;
  const expiresAt = qrLoginStore.create(token, loginUrl, claimSecret);
  // claimSecret is returned only here — it is NOT embedded in the QR URL so that
  // only the originating device (Tesla) can claim the resulting session.
  return res.json({ token, loginUrl, expiresAt, claimSecret });
});

// GET /api/auth/qr-login/:token/status — polled by the waiting device
router.get('/:token/status', (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) {
    return res.status(400).json({ error: 'Ogiltig token.' });
  }
  const result = qrLoginStore.getStatus(token);
  return res.json(result);
});

// POST /api/auth/qr-login/:token/complete — called by mobile after passkey login
router.post('/:token/complete', (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) {
    return res.status(400).json({ error: 'Ogiltig token.' });
  }

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig data.', details: parsed.error.flatten() });
  }

  let decoded;
  try {
    decoded = jwt.verify(parsed.data.jwt, jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Ogiltig JWT.' });
  }

  const user = getAuthUserById(decoded.id);
  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  const ok = qrLoginStore.complete(token, parsed.data.jwt, user);
  if (!ok) {
    return res.status(410).json({ error: 'QR-sessionen har gått ut eller är ogiltig.' });
  }

  return res.json({ ok: true });
});

const claimSchema = z.object({
  claimSecret: z.string().uuid(),
});

// GET /api/auth/qr-login/:token/claim — called once by waiting device to claim the JWT
router.post('/:token/claim', (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) {
    return res.status(400).json({ error: 'Ogiltig token.' });
  }

  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig claimSecret.' });
  }

  const result = qrLoginStore.consume(token, parsed.data.claimSecret);
  if (!result) {
    return res.status(404).json({ error: 'Sessionen hittades inte eller är inte klar ännu.' });
  }

  return res.json({ jwt: result.jwt, user: result.user });
});

export default router;
