export function getFrontendPublicOrigin() {
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
