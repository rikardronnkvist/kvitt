const INVITE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,200}$/;

function sanitizeToken(value) {
  if (!value) return '';
  const trimmed = decodeURIComponent(String(value).trim());
  return trimmed.replace(/^\/+|\/+$/g, '');
}

export function isValidInviteToken(token) {
  return INVITE_TOKEN_PATTERN.test(String(token || ''));
}

export function extractInviteToken(input, { baseOrigin } = {}) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const direct = sanitizeToken(raw);
  if (isValidInviteToken(direct)) {
    return direct;
  }

  const origin = baseOrigin || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const candidate = raw.startsWith('http://') || raw.startsWith('https://')
    ? raw
    : raw.startsWith('/')
      ? `${origin}${raw}`
      : `${origin}/${raw}`;

  try {
    const parsed = new URL(candidate);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const inviteIndex = parts.findIndex((part) => part.toLowerCase() === 'invite');
    if (inviteIndex === -1 || inviteIndex === parts.length - 1) return null;
    const token = sanitizeToken(parts[inviteIndex + 1]);
    return isValidInviteToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function buildInviteUrl(token, { baseOrigin } = {}) {
  const safeToken = sanitizeToken(token);
  if (!isValidInviteToken(safeToken)) {
    throw new Error('Ogiltig inbjudningstoken.');
  }
  const origin = baseOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/invite/${safeToken}`;
}
