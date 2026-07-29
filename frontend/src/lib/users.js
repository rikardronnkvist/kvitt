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
