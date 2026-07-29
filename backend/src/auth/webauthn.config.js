function parseOrigins() {
  const configuredOrigins = process.env.PASSKEY_ORIGIN || 'http://localhost:5173';
  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getWebAuthnConfig() {
  const rpID = process.env.PASSKEY_RP_ID || 'localhost';
  const rpName = process.env.PASSKEY_RP_NAME || 'Kvitt';
  const origins = parseOrigins();

  return {
    rpID,
    rpName,
    origins,
    userVerification: 'preferred',
    residentKey: 'required',
    challengeTtlMs: 5 * 60 * 1000,
  };
}
