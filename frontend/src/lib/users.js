import { t } from './i18n.js';

export function getUserDisplayName(user) {
  const candidates = [user?.full_name, user?.displayName, user?.name, user?.username];
  for (const value of candidates) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) {
      return normalized;
    }
  }

  return user?.id ? t('users.userWithId', { id: user.id }) : t('users.unknownUser');
}

export function getUserSearchLabel(user) {
  return getUserDisplayName(user);
}

export function getUserAvatarUrl(user) {
  const avatarUrl = typeof user?.avatar_url === 'string' ? user.avatar_url.trim() : '';
  return avatarUrl || null;
}

export function getUserInitials(user) {
  if (user?.initials?.trim().length === 2) {
    return user.initials.trim().toUpperCase();
  }
  const name = user?.full_name?.trim() || '';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || '??').toUpperCase();
}
