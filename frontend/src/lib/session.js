function decodeBase64UrlUtf8(base64Url) {
  const normalized = base64Url.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) || 0);
  return new TextDecoder().decode(bytes);
}

export function parseUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    return JSON.parse(decodeBase64UrlUtf8(payload));
  } catch {
    return null;
  }
}

export function getCurrentUserId() {
  const user = parseUser();
  return user?.id ? String(user.id) : null;
}
