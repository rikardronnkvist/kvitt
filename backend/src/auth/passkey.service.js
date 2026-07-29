import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { db } from '../db/database.js';
import { challengeStore } from './challenge-store.js';
import { getWebAuthnConfig } from './webauthn.config.js';
import { getAuthUserById, signToken } from './token.js';

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function serializePublicKey(publicKey) {
  return Buffer.from(publicKey).toString('base64url');
}

function deserializePublicKey(publicKey) {
  return new Uint8Array(Buffer.from(publicKey, 'base64url'));
}

function safeTransports(transports) {
  if (!transports || transports.length === 0) {
    return null;
  }
  return JSON.stringify(transports);
}

function parseStoredTransports(transports) {
  if (!transports) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(transports);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getFirstUserAdminFlag() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  return Number(userCount.count) === 0 ? 1 : 0;
}

function createPasskeyUser(displayName, userHandle) {
  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, is_admin, full_name, user_handle)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = insertUser.run(null, null, null, getFirstUserAdminFlag(), displayName, userHandle);
  return Number(result.lastInsertRowid);
}

function savePasskey({ userId, credentialID, publicKey, counter, deviceType, backedUp, transports }) {
  db.prepare(`
    INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, transports, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    credentialID,
    serializePublicKey(publicKey),
    counter,
    deviceType,
    backedUp ? 1 : 0,
    safeTransports(transports),
  );
}

function getPasskeyByCredentialId(credentialID) {
  return db.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.credential_id,
      p.public_key,
      p.counter,
      p.device_type,
      p.backed_up,
      p.transports
    FROM passkeys p
    WHERE p.credential_id = ?
  `).get(credentialID);
}

function updatePasskeyCounter(passkeyId, newCounter) {
  db.prepare(`
    UPDATE passkeys
    SET counter = ?, last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newCounter, passkeyId);
}

export async function createRegistrationOptions(displayName) {
  const config = getWebAuthnConfig();
  const requestId = randomUUID();
  const userHandle = randomUUID();

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: `passkey-${userHandle}`,
    userDisplayName: displayName,
    // Persisting a stable user handle lets us identify accounts independently of email/username.
    userID: new TextEncoder().encode(userHandle),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: config.residentKey,
      userVerification: config.userVerification,
    },
  });

  challengeStore.set({
    requestId,
    purpose: 'register',
    challenge: options.challenge,
    userHandle,
    displayName,
    expiresAt: Date.now() + config.challengeTtlMs,
  });

  return { requestId, options };
}

export async function verifyRegistration({ requestId, response }) {
  const config = getWebAuthnConfig();
  // Consume (not just read) challenge to make each registration challenge single-use.
  const challengeEntry = challengeStore.consume({ requestId, purpose: 'register' });
  if (!challengeEntry) {
    throw createHttpError(400, 'Utmaningen har gått ut. Försök igen.');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeEntry.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    throw createHttpError(400, error.message || 'Registreringen misslyckades.');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw createHttpError(400, 'Registreringen kunde inte verifieras.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const existingPasskey = getPasskeyByCredentialId(credential.id);
  if (existingPasskey) {
    throw createHttpError(409, 'Den här Passkeyn finns redan registrerad.');
  }

  const userId = db.transaction(() => {
    const existingUser = db.prepare('SELECT id FROM users WHERE user_handle = ?').get(challengeEntry.userHandle);
    const resolvedUserId = existingUser ? Number(existingUser.id) : createPasskeyUser(challengeEntry.displayName, challengeEntry.userHandle);
    savePasskey({
      userId: resolvedUserId,
      credentialID: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports,
    });
    return resolvedUserId;
  })();

  const user = getAuthUserById(userId);
  return { token: signToken(user), user };
}

export async function createAuthenticationOptions() {
  const config = getWebAuthnConfig();
  const requestId = randomUUID();

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: config.userVerification,
  });

  challengeStore.set({
    requestId,
    purpose: 'login',
    challenge: options.challenge,
    expiresAt: Date.now() + config.challengeTtlMs,
  });

  return { requestId, options };
}

export async function verifyAuthentication({ requestId, response }) {
  const config = getWebAuthnConfig();
  // Challenges are single-use to prevent replaying signed assertions.
  const challengeEntry = challengeStore.consume({ requestId, purpose: 'login' });
  if (!challengeEntry) {
    throw createHttpError(400, 'Utmaningen har gått ut. Försök igen.');
  }

  const passkey = getPasskeyByCredentialId(response.id);
  if (!passkey) {
    throw createHttpError(401, 'Inloggningen misslyckades.');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeEntry.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      credential: {
        id: passkey.credential_id,
        publicKey: deserializePublicKey(passkey.public_key),
        counter: Number(passkey.counter),
        transports: parseStoredTransports(passkey.transports),
      },
      requireUserVerification: true,
    });
  } catch (error) {
    throw createHttpError(401, error.message || 'Inloggningen misslyckades.');
  }

  if (!verification.verified || !verification.authenticationInfo) {
    throw createHttpError(401, 'Inloggningen misslyckades.');
  }

  updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

  const user = getAuthUserById(passkey.user_id);
  if (!user) {
    throw createHttpError(404, 'Användaren hittades inte.');
  }

  return { token: signToken(user), user };
}

export function getPasskeyAvailability() {
  const config = getWebAuthnConfig();
  return {
    available: Boolean(config.rpID && config.origins.length > 0),
    rpID: config.rpID,
    rpName: config.rpName,
  };
}
