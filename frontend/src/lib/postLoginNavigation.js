export const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';
export const OAUTH_REQUEST_HANDLE_KEY = 'oauth_request_handle';

const OAUTH_REQUEST_HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function isValidOAuthRequestHandle(value) {
  return typeof value === 'string' && OAUTH_REQUEST_HANDLE_PATTERN.test(value);
}

export function getOAuthRequestHandle(search, parameter = 'oauth_request') {
  if (typeof search !== 'string') return null;
  const params = new URLSearchParams(search);
  const entries = [...params.entries()];
  if (entries.length !== 1 || entries[0][0] !== parameter) return null;
  return isValidOAuthRequestHandle(entries[0][1]) ? entries[0][1] : null;
}

export function rememberOAuthRequestHandle(handle) {
  if (!isValidOAuthRequestHandle(handle)) return false;
  sessionStorage.setItem(OAUTH_REQUEST_HANDLE_KEY, handle);
  return true;
}

export function buildOAuthLoginPath(handle) {
  if (!rememberOAuthRequestHandle(handle)) return '/login';
  return `/login?oauth_request=${encodeURIComponent(handle)}`;
}

function consumePendingOAuthPath(search) {
  const queryHandle = getOAuthRequestHandle(search);
  const storedHandle = sessionStorage.getItem(OAUTH_REQUEST_HANDLE_KEY);
  sessionStorage.removeItem(OAUTH_REQUEST_HANDLE_KEY);
  const handle = queryHandle || (isValidOAuthRequestHandle(storedHandle) ? storedHandle : null);
  return handle ? `/oauth/authorize?request=${encodeURIComponent(handle)}` : null;
}

function consumePendingInvitePath() {
  const pendingInvite = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  if (pendingInvite) {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    return `/invite/${encodeURIComponent(pendingInvite)}`;
  }
  return null;
}

export function navigateAfterLogin(
  navigate,
  options = {},
  search = globalThis.location?.search || '',
) {
  const destination = consumePendingOAuthPath(search) ?? consumePendingInvitePath() ?? '/';
  navigate(destination, options);
}
