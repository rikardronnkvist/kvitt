import { useEffect, useState } from 'react';
import { get } from '../api/client.js';

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizePhoneFormat(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['swedish', 'international', 'national', 'norwegian'].includes(normalized)) {
    return normalized;
  }
  return DEFAULT_APP_SETTINGS.phone_format;
}

function readRuntimeSettings() {
  const config = typeof window !== 'undefined' ? window.__kvittConfig : null;
  return {
    phone_enabled: toBoolean(config?.phoneEnabled, DEFAULT_APP_SETTINGS.phone_enabled),
    phone_format: normalizePhoneFormat(config?.phoneFormat),
  };
}

export const DEFAULT_APP_SETTINGS = {
  phone_enabled: true,
  phone_format: 'swedish',
};

export function useAppSettings() {
  const [settings, setSettings] = useState(() => readRuntimeSettings());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    get('/api/settings')
      .then((data) => {
        if (!active) return;
        setSettings({
          phone_enabled: data?.phone_enabled !== false,
          phone_format: normalizePhoneFormat(data?.phone_format),
        });
      })
      .catch(() => {
        if (!active) return;
        setSettings(readRuntimeSettings());
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
