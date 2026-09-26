const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLoopbackRedirectUri(value) {
  const url = parseUrl(value);
  return Boolean(
    url?.protocol === 'http:'
    && LOOPBACK_HOSTS.has(url.hostname.toLowerCase()),
  );
}

export function isValidOAuthRedirectUri(value) {
  const url = parseUrl(value);
  if (!url || url.hash || url.username || url.password) {
    return false;
  }
  return url.protocol === 'https:' || isLoopbackRedirectUri(value);
}

export const isValidDcrRedirectUri = isValidOAuthRedirectUri;

export function redirectUriMatches(requestedUri, registeredUris) {
  if (registeredUris.includes(requestedUri)) {
    return true;
  }

  const requested = parseUrl(requestedUri);
  if (!requested || !isLoopbackRedirectUri(requestedUri)) {
    return false;
  }

  return registeredUris.some((registeredUri) => {
    if (!isLoopbackRedirectUri(registeredUri)) {
      return false;
    }

    const registered = parseUrl(registeredUri);
    return (
      requested.protocol === registered.protocol
      && requested.hostname.toLowerCase() === registered.hostname.toLowerCase()
      && requested.pathname === registered.pathname
      && requested.search === registered.search
      && requested.hash === registered.hash
      && requested.username === registered.username
      && requested.password === registered.password
    );
  });
}
