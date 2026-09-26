export const PENDING_OAUTH_REQUEST_KEY = 'pending_oauth_request';
export const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';

function normalizeOAuthQuery(search) {
  if (typeof search !== 'string') return '';
  const query = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(query).toString();
}

export function storePendingOAuthRequest(search) {
  sessionStorage.setItem(PENDING_OAUTH_REQUEST_KEY, normalizeOAuthQuery(search));
}

export function navigateAfterLogin(navigate, options = {}) {
  const pendingOAuthQuery = sessionStorage.getItem(PENDING_OAUTH_REQUEST_KEY);
  if (pendingOAuthQuery !== null) {
    sessionStorage.removeItem(PENDING_OAUTH_REQUEST_KEY);
    const query = normalizeOAuthQuery(pendingOAuthQuery);
    navigate(`/oauth/authorize${query ? `?${query}` : ''}`, options);
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
