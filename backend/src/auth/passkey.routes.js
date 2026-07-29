import express from 'express';
import { z } from 'zod';
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  getPasskeyAvailability,
  verifyAuthentication,
  verifyRegistration,
} from './passkey.service.js';

const router = express.Router();

const registerOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  registration_token: z.string().trim().min(1),
});

const verifyRegistrationSchema = z.object({
  requestId: z.string().uuid(),
  response: z.record(z.unknown()),
});

const verifyLoginSchema = z.object({
  requestId: z.string().uuid(),
  response: z.record(z.unknown()),
});

router.get('/available', (_req, res) => {
  return res.json(getPasskeyAvailability());
});

router.post('/register/options', async (req, res, next) => {
  const parsed = registerOptionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt visningsnamn.', details: parsed.error.flatten() });
  }

  try {
    const data = await createRegistrationOptions(parsed.data.displayName, parsed.data.registration_token);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/register/verify', async (req, res, next) => {
  const parsed = verifyRegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt registreringssvar.', details: parsed.error.flatten() });
  }

  try {
    const data = await verifyRegistration(parsed.data);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/login/options', async (_req, res, next) => {
  try {
    const data = await createAuthenticationOptions();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/login/verify', async (req, res, next) => {
  const parsed = verifyLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt inloggningssvar.', details: parsed.error.flatten() });
  }

  try {
    const data = await verifyAuthentication(parsed.data);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

export default router;
