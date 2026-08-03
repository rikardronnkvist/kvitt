import express from 'express';
import { z } from 'zod';
import { isValidInviteToken, isValidRegistrationAccessToken } from '../utils/settings.js';
import requireAuth from '../middleware/auth.js';
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  createUserPasskeyOptions,
  deleteUserPasskey,
  getPasskeyAvailability,
  listUserPasskeys,
  updateUserPasskeyName,
  verifyAuthentication,
  verifyRegistration,
  verifyUserPasskeyRegistration,
} from './passkey.service.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';

const router = express.Router();

const registerOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
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

const updatePasskeyNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

router.get('/register-access', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const allowed = token.length > 0
    && (isValidRegistrationAccessToken(token) || isValidInviteToken(token));
  return res.json({ allowed });
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
    const data = await createRegistrationOptions(parsed.data.displayName, parsed.data.phone, parsed.data.registration_token);
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
    const data = await verifyRegistration(parsed.data, { ipAddress: resolveRequestIp(req) });
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/mine', requireAuth, (req, res, next) => {
  try {
    const passkeys = listUserPasskeys(req.user.id);
    return res.json({ passkeys });
  } catch (error) {
    return next(error);
  }
});

router.post('/mine/options', requireAuth, async (req, res, next) => {
  try {
    const data = await createUserPasskeyOptions(req.user.id);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/mine/verify', requireAuth, async (req, res, next) => {
  const parsed = verifyRegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt registreringssvar.', details: parsed.error.flatten() });
  }

  try {
    const data = await verifyUserPasskeyRegistration(
      { ...parsed.data, userId: req.user.id },
      { ipAddress: resolveRequestIp(req) },
    );
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

router.put('/mine/:passkeyId', requireAuth, (req, res, next) => {
  const passkeyId = Number(req.params.passkeyId);
  if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
    return res.status(400).json({ error: 'Ogiltig passkey.' });
  }

  const parsed = updatePasskeyNameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt passkey-namn.', details: parsed.error.flatten() });
  }

  try {
    const updated = updateUserPasskeyName(req.user.id, passkeyId, parsed.data.name, { ipAddress: resolveRequestIp(req) });
    if (!updated) {
      return res.status(404).json({ error: 'Passkeyn hittades inte.' });
    }
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/mine/:passkeyId', requireAuth, (req, res, next) => {
  const passkeyId = Number(req.params.passkeyId);
  if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
    return res.status(400).json({ error: 'Ogiltig passkey.' });
  }

  try {
    deleteUserPasskey(req.user.id, passkeyId, req.user.current_passkey_id, { ipAddress: resolveRequestIp(req) });
    return res.status(204).send();
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
    const data = await verifyAuthentication(parsed.data, { ipAddress: resolveRequestIp(req) });
    return res.json(data);
  } catch (error) {
    const credentialId = typeof parsed.data.response?.id === 'string'
      ? parsed.data.response.id
      : null;
    const errorMessage = typeof error?.message === 'string' ? error.message : 'Inloggningen misslyckades.';
    tryLogActivity({
      eventType: 'auth.login.failed',
      action: 'login',
      entityType: 'session',
      metadata: {
        credential_id: credentialId,
        reason: errorMessage,
      },
      ipAddress: resolveRequestIp(req),
    });
    return next(error);
  }
});

export default router;
