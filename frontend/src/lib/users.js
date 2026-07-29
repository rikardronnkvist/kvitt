export function getUserDisplayName(user) {
  const fullName = user?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  return user?.email || 'Okänd användare';
}

export function getUserSearchLabel(user) {
  const displayName = getUserDisplayName(user);
  if (user?.full_name?.trim() && user?.email) {
    return `${displayName} · ${user.email}`;
  }

  return displayName;
}

export function getUserInitials(user) {
  if (user?.initials?.trim()) {
    return user.initials.trim().toUpperCase();
  }
  const name = user?.full_name?.trim() || user?.email || '';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
