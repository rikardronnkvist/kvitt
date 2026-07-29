import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { get, post } from '../api/client.js';

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

export async function registerWithPasskey(displayName, registrationToken) {
  const optionsResponse = await post('/api/auth/passkey/register/options', {
    displayName,
    registration_token: registrationToken,
  });
  const response = await startRegistrationCompat(optionsResponse.options);
  return post('/api/auth/passkey/register/verify', {
    requestId: optionsResponse.requestId,
    response,
  });
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
    return mode === 'register' ? 'Registreringen avbröts' : 'Inloggningen misslyckades';
  }

  if (error?.message) {
    return error.message;
  }

  return mode === 'register' ? 'Registreringen avbröts' : 'Inloggningen misslyckades';
}
