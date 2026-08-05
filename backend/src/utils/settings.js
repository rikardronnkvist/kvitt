import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';

const REGISTRATION_TOKEN_KEY = 'registration_access_token';
const PHONE_ENABLED_ENV = 'KVITT_PHONE_ENABLED';
const PHONE_FORMAT_ENV = 'KVITT_PHONE_FORMAT';
const DEFAULT_PHONE_AND_SWISH_ENABLED = true;
const DEFAULT_PHONE_FORMAT = 'swedish';
const ALLOWED_PHONE_FORMATS = new Set(['swedish', 'international', 'national']);

function toBooleanSetting(value, fallback) {
  if (value == null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizePhoneFormat(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_PHONE_FORMATS.has(normalized) ? normalized : DEFAULT_PHONE_FORMAT;
}

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

export function isValidInviteToken(token) {
  if (!token) return false;
  const row = db.prepare(`
    SELECT 1 FROM group_invites
    WHERE token = ? AND datetime(expires_at) > datetime('now')
  `).get(token);
  return Boolean(row);
}

export function getPhoneAndSwishEnabled() {
  return toBooleanSetting(process.env[PHONE_ENABLED_ENV], DEFAULT_PHONE_AND_SWISH_ENABLED);
}

export function getPhoneFormat() {
  return normalizePhoneFormat(process.env[PHONE_FORMAT_ENV] || DEFAULT_PHONE_FORMAT);
}

export function getPublicSettings() {
  return {
    phone_enabled: getPhoneAndSwishEnabled(),
    phone_format: getPhoneFormat(),
  };
}
