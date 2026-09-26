export const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';

const OAUTH_QUERY_MAX_LENGTH = 16 * 1024;
const OAUTH_REQUEST_LIFETIME_MS = 5 * 60 * 1000;
const OAUTH_QUERY_KEYS = new Set([
  'client_id',
  'code_challenge',
  'code_challenge_method',
  'redirect_uri',
  'resource',
  'response_type',
  'scope',
  'state',
]);
let pendingOAuthRequest = null;

function allowlistedOAuthQuery(search) {
  if (typeof search !== 'string') return null;
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query || query.length > OAUTH_QUERY_MAX_LENGTH || query.includes('#')) return null;

  const seen = new Set();
  for (const [key] of new URLSearchParams(query)) {
    if (!OAUTH_QUERY_KEYS.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  return seen.size > 0 ? query : null;
}

export function storePendingOAuthRequest(search) {
  const query = allowlistedOAuthQuery(search);
  pendingOAuthRequest = query === null
    ? null
    : { query, expiresAt: Date.now() + OAUTH_REQUEST_LIFETIME_MS };
}

function consumePendingOAuthPath() {
  const request = pendingOAuthRequest;
  pendingOAuthRequest = null;
  if (!request || request.expiresAt <= Date.now()) return null;

  const query = allowlistedOAuthQuery(request.query);
  return query === null ? null : `/oauth/authorize?${query}`;
}

export function navigateAfterLogin(navigate, options = {}) {
  const pendingOAuthPath = consumePendingOAuthPath();
  if (pendingOAuthPath !== null) {
    navigate(pendingOAuthPath, options);
    return;
  }

  const pendingInvite = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  if (pendingInvite) {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    navigate(`/invite/${encodeURIComponent(pendingInvite)}`, options);
    return;
  }

  navigate('/', options);
}
