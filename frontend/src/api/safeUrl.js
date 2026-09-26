export function buildSafeApiUrl(url, origin) {
  if (
    typeof url !== 'string'
    || !url.startsWith('/api/')
    || /[\u0000-\u0020\u007f\\#]/u.test(url)
  ) {
    return null;
  }

  const queryIndex = url.indexOf('?');
  const rawPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const hasUnsafePathSegment = rawPath.split('/').some((segment) => {
    let decodedSegment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      return true;
    }
    return decodedSegment === '.'
      || decodedSegment === '..'
      || /[\\/\u0000-\u001f\u007f]/u.test(decodedSegment);
  });
  if (hasUnsafePathSegment) {
    return null;
  }

  const parsed = new URL(url, origin);
  if (parsed.origin !== origin || !parsed.pathname.startsWith('/api/')) {
    return null;
  }
  return parsed.pathname + parsed.search;
}
