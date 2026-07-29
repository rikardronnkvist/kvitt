import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db/database.js';
import { getRegistrationAccessToken } from './utils/settings.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import expenseRoutes from './routes/expenses.js';
import settlementRoutes from './routes/settlements.js';
import adminRoutes from './routes/admin.js';

initializeDatabase();

const app = express();
const port = Number(process.env.PORT) || 3000;

function getPublicOrigin() {
  if (process.env.PASSKEY_ORIGIN) {
    const origins = process.env.PASSKEY_ORIGIN
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length > 0) {
      return origins[0];
    }
  }

  const frontendPort = Number(process.env.FRONTEND_PORT) || 5173;
  return `http://localhost:${frontendPort}`;
}

function getRegistrationUrl() {
  const token = getRegistrationAccessToken();
  if (!token) {
    return null;
  }

  return `${getPublicOrigin()}/register?${encodeURIComponent(token)}`;
}
const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'För många inloggnings- eller registreringsförsök. Försök igen om en minut.' },
});
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'För många anrop. Försök igen senare.' },
});

app.use(cors());
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/groups', apiRateLimit, groupRoutes);
app.use('/api/expenses', apiRateLimit, expenseRoutes);
app.use('/api/settlements', apiRateLimit, settlementRoutes);
app.use('/api/admin', apiRateLimit, adminRoutes);

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
  console.log(`Kvitt backend listening on port ${port}`);
  const registrationUrl = getRegistrationUrl();
  if (registrationUrl) {
    console.log(`Registration URL: ${registrationUrl}`);
  }
});
