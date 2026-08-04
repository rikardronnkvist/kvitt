export function slugifyGroupName(name) {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  let slug = '';
  let lastWasSeparator = false;

  for (const character of normalized) {
    const isAsciiLetter = character >= 'a' && character <= 'z';
    const isDigit = character >= '0' && character <= '9';

    if (isAsciiLetter || isDigit) {
      slug += character;
      lastWasSeparator = false;
      continue;
    }

    if (slug && !lastWasSeparator) {
      slug += '-';
      lastWasSeparator = true;
    }
  }

  if (slug.endsWith('-')) {
    slug = slug.slice(0, -1);
  }

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
