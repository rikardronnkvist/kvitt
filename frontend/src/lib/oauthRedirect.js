const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseSafeRedirect(value) {
  if (typeof value !== 'string' || !value) return null;

  try {
    const url = new URL(value);
    const safeProtocol = url.protocol === 'https:'
      || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase()));
    if (!safeProtocol || url.username || url.password || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function isSafeOAuthRedirectTarget(target, registeredTarget) {
  const targetUrl = parseSafeRedirect(target);
  const registeredUrl = parseSafeRedirect(registeredTarget);
  if (!targetUrl || !registeredUrl) return false;

  return targetUrl.protocol === registeredUrl.protocol
    && targetUrl.hostname.toLowerCase() === registeredUrl.hostname.toLowerCase()
    && targetUrl.port === registeredUrl.port
    && targetUrl.pathname === registeredUrl.pathname;
}
