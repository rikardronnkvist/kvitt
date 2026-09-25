const QR_LOGIN_PATH_PATTERN = /^\/qr-login\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractQrLoginPath(value) {
  try {
    const parsed = new URL(String(value || '').trim(), window.location.origin);
    return QR_LOGIN_PATH_PATTERN.test(parsed.pathname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}