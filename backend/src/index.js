import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db/database.js';
import { getPublicSettings, getRegistrationAccessToken } from './utils/settings.js';
import { getFrontendPublicOrigin } from './utils/public-origin.js';
import { isDevboxEnabled } from './utils/devbox-mode.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import expenseRoutes from './routes/expenses.js';
import settlementRoutes from './routes/settlements.js';
import adminRoutes from './routes/admin.js';
import inviteRoutes from './routes/invites.js';
import pushRoutes from './routes/push.js';
import { avatarDirectory, ensureAvatarDirectory } from './utils/avatar.js';

initializeDatabase();
ensureAvatarDirectory();

const app = express();
const port = Number(process.env.PORT) || 3000;

// Avoid disclosing framework details via default response headers.
app.disable('x-powered-by');

const REGISTRATION_QUERY_MAX_LENGTH = 512;

function isAllowedRegistrationToken(value) {
  return /^[A-Za-z0-9._~-]{8,256}$/u.test(value);
}

function getSafeRegisterQuery(originalUrl) {
  const queryIndex = originalUrl.indexOf('?');
  if (queryIndex === -1) {
    return '';
  }

  const rawQuery = originalUrl.slice(queryIndex + 1).trim();
  if (!rawQuery || rawQuery.length > REGISTRATION_QUERY_MAX_LENGTH) {
    return '';
  }

  if (!rawQuery.includes('=')) {
    let decodedRaw = '';
    try {
      decodedRaw = decodeURIComponent(rawQuery);
    } catch {
      return '';
    }
    if (!isAllowedRegistrationToken(decodedRaw)) {
      return '';
    }
    return `?${encodeURIComponent(decodedRaw)}`;
  }

  const params = new URLSearchParams(rawQuery);
  const allowedKeys = ['token', 'invite', 'key'];
  for (const key of allowedKeys) {
    const value = params.get(key);
    if (!value) {
      continue;
    }
    if (!isAllowedRegistrationToken(value)) {
      return '';
    }
    return `?${key}=${encodeURIComponent(value)}`;
  }

  return '';
}

function getRegistrationUrl() {
  const token = getRegistrationAccessToken();
  if (!token) {
    return null;
  }

  return `${getFrontendPublicOrigin()}/register?${encodeURIComponent(token)}`;
}

function isSensitiveAuthAttempt(req) {
  if (req.method !== 'POST') {
    return false;
  }

  const authPath = req.path || '';
  return (
    authPath === '/devbox/login'
    || authPath === '/passkey/register/options'
    || authPath === '/passkey/register/verify'
    || authPath === '/passkey/login/options'
    || authPath === '/passkey/login/verify'
    || /^\/passkey\/recover\/[^/]+\/(options|verify)$/.test(authPath)
  );
}

const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => !isSensitiveAuthAttempt(req),
  message: { error: 'För många inloggnings- eller registreringsförsök. Försök igen om en minut.' },
});
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'För många anrop. Försök igen senare.' },
});
const adminRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'För många admin-anrop. Försök igen senare.' },
});

app.use(cors({
  origin: process.env.PASSKEY_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads/avatars', express.static(avatarDirectory, {
  dotfiles: 'deny',
  index: false,
  redirect: false,
  etag: true,
  maxAge: '30d',
}));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get(['/register', '/register/*'], (req, res) => {
  const safeQuery = getSafeRegisterQuery(req.originalUrl);
  return res.redirect(302, `${getFrontendPublicOrigin()}/register${safeQuery}`);
});

app.get('/api/settings', (_req, res) => {
  return res.json(getPublicSettings());
});

app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/groups', apiRateLimit, groupRoutes);
app.use('/api/expenses', apiRateLimit, expenseRoutes);
app.use('/api/settlements', apiRateLimit, settlementRoutes);
app.use('/api/admin', adminRateLimit, adminRoutes);
app.use('/api/invite', apiRateLimit, inviteRoutes);
app.use('/api/push', apiRateLimit, pushRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Hittade ingen route för ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Ogiltig JSON i förfrågan.' });
  }
  return res.status(error.status || 500).json({ error: error.message || 'Ett internt fel uppstod.' });
});

app.listen(port, () => {
  const isDevMode = isDevboxEnabled();

  console.log(`Kvitt backend listening on port ${port}`);
  console.log(`Backend mode: ${isDevMode ? 'development' : 'production'}`);
  const registrationUrl = getRegistrationUrl();
  if (registrationUrl) {
    console.log(`Registration URL: ${registrationUrl}`);
  }
});
