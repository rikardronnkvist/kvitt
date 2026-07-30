export function slugifyGroupName(name) {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'grupp';
}

export function createUniqueSlug(baseSlug, slugExists) {
  let attempt = baseSlug;
  let suffix = 0;

  while (slugExists(attempt)) {
    suffix += 1;
    attempt = `${baseSlug}-${suffix}`;
  }

  return attempt;
}
