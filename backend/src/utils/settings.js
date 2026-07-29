import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';

const REGISTRATION_TOKEN_KEY = 'registration_access_token';

export function getRegistrationAccessToken() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(REGISTRATION_TOKEN_KEY);
  return row?.value || null;
}

export function ensureRegistrationAccessToken() {
  const existing = getRegistrationAccessToken();
  if (existing) {
    return existing;
  }

  const generated = randomUUID();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(REGISTRATION_TOKEN_KEY, generated);
  return generated;
}

export function setRegistrationAccessToken(token) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(REGISTRATION_TOKEN_KEY, token);
}

export function resetRegistrationAccessToken() {
  const token = randomUUID();
  setRegistrationAccessToken(token);
  return token;
}

export function isValidRegistrationAccessToken(token) {
  const expected = getRegistrationAccessToken();
  if (!expected) {
    return false;
  }
  return token === expected;
}
