export function parseUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getCurrentUserId() {
  const user = parseUser();
  return user?.id ? String(user.id) : null;
}
