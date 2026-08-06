import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { del, get, post, put } from '../api/client.js';
import { t } from '../lib/i18n.js';

function isCancelError(error) {
  return error?.name === 'AbortError'
    || error?.name === 'NotAllowedError'
    || String(error?.message || '').toLowerCase().includes('cancel');
}

async function startRegistrationCompat(optionsJSON) {
  try {
    return await startRegistration({ optionsJSON });
  } catch (error) {
    if (error instanceof TypeError) {
      return startRegistration(optionsJSON);
    }
    throw error;
  }
}

async function startAuthenticationCompat(optionsJSON) {
  try {
    return await startAuthentication({ optionsJSON });
  } catch (error) {
    if (error instanceof TypeError) {
      return startAuthentication(optionsJSON);
    }
    throw error;
  }
}

export async function checkPasskeyAvailability() {
  const browserAvailable = browserSupportsWebAuthn();
  if (!browserAvailable) {
    return false;
  }

  const serverAvailability = await get('/api/auth/passkey/available');
  return Boolean(serverAvailability.available);
}

export async function registerWithPasskey(displayName, phone, registrationToken) {
  const optionsResponse = await post('/api/auth/passkey/register/options', {
    displayName,
    phone,
    registration_token: registrationToken,
  });
  const response = await startRegistrationCompat(optionsResponse.options);
  return post('/api/auth/passkey/register/verify', {
    requestId: optionsResponse.requestId,
    response,
  });
}

export async function listMyPasskeys() {
  const data = await get('/api/auth/passkey/mine');
  return Array.isArray(data.passkeys) ? data.passkeys : [];
}

export async function addPasskeyToAccount() {
  const optionsResponse = await post('/api/auth/passkey/mine/options', {});
  const response = await startRegistrationCompat(optionsResponse.options);
  return post('/api/auth/passkey/mine/verify', {
    requestId: optionsResponse.requestId,
    response,
  });
}

export async function renameMyPasskey(passkeyId, name) {
  return put(`/api/auth/passkey/mine/${passkeyId}`, { name });
}

export async function deleteMyPasskey(passkeyId) {
  await del(`/api/auth/passkey/mine/${passkeyId}`);
}

export async function loginWithPasskey() {
  const optionsResponse = await post('/api/auth/passkey/login/options', {});
  const response = await startAuthenticationCompat(optionsResponse.options);
  return post('/api/auth/passkey/login/verify', {
    requestId: optionsResponse.requestId,
    response,
  });
}

export function getPasskeyErrorMessage(error, mode) {
  if (isCancelError(error)) {
    return mode === 'register' ? t('auth.passkeyRegistrationCancelled') : t('auth.passkeyLoginFailed');
  }

  if (error?.message) {
    return error.message;
  }

  return mode === 'register' ? t('auth.passkeyRegistrationCancelled') : t('auth.passkeyLoginFailed');
}
