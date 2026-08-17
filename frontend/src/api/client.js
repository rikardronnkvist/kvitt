import { t } from '../lib/i18n.js';
import { registerErrorDetails } from '../lib/errorDetails.js';

const getToken = () => localStorage.getItem('token');

function buildSafeUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new Error(t('common.genericError'));
  }
  const { origin, pathname, search } = new URL(url, window.location.origin);
  if (origin !== window.location.origin) {
    throw new Error(t('common.genericError'));
  }
  return pathname + search;
}

function redirectToLogin() {
  localStorage.removeItem('token');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

function sanitizeRequestUrl(url) {
  const parsed = new URL(url, window.location.origin);
  const pathname = parsed.pathname
    .split('/')
    .map((segment) => (/^[A-Za-z0-9_-]{20,}$/.test(segment) ? '[redacted]' : segment))
    .join('/');
  const queryKeys = [...parsed.searchParams.keys()];
  return queryKeys.length > 0 ? `${pathname}?${queryKeys.map((key) => `${key}=[redacted]`).join('&')}` : pathname;
}

function markdownCodeBlock(value) {
  const fence = String(value).includes('```') ? '````' : '```';
  return [fence + 'text', String(value), fence];
}

function buildErrorReport({ url, method, message, status, statusText, serverMessage, cause }) {
  return [
    `# ${t('errors.reportTitle')}`,
    '',
    `## ${t('errors.reportErrorHeading')}`,
    '',
    ...markdownCodeBlock(message),
    '',
    `## ${t('errors.reportTechnicalHeading')}`,
    '',
    `- **${t('errors.reportTime')}:** ${new Date().toISOString()}`,
    `- **${t('errors.reportRequest')}:** \`${method} ${sanitizeRequestUrl(url)}\``,
    status ? `- **${t('errors.reportHttpStatus')}:** ${status}${statusText ? ` ${statusText}` : ''}` : null,
    `- **${t('errors.reportBrowser')}:** ${navigator.userAgent}`,
    serverMessage || cause ? '' : null,
    serverMessage || cause ? `## ${t('errors.reportCauseHeading')}` : null,
    serverMessage || cause ? '' : null,
    ...(serverMessage || cause ? markdownCodeBlock(serverMessage || cause) : []),
  ].filter((line) => line !== null).join('\n');
}

async function request(url, options = {}, responseType = 'json') {
  const method = options.method || 'GET';
  const token = getToken();
  const headers = {
    ...(responseType !== 'blob' ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(buildSafeUrl(url), { ...options, headers });
  } catch (error) {
    const message = t('common.genericError');
    registerErrorDetails(message, buildErrorReport({
      url,
      method,
      message,
      cause: error instanceof Error ? error.message : String(error),
    }));
    throw new Error(message, { cause: error });
  }

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(t('auth.sessionExpired'));
  }

  if (!response.ok) {
    let message = t('common.genericError');
    let serverMessage = '';
    let cause = '';
    try {
      const data = await response.json();
      serverMessage = typeof data.error === 'string' ? data.error : '';
      message = serverMessage || message;
    } catch {
      cause = t('errors.invalidErrorResponse');
    }
    if (message === t('common.genericError')) {
      registerErrorDetails(message, buildErrorReport({
        url,
        method,
        message,
        status: response.status,
        statusText: response.statusText,
        serverMessage,
        cause,
      }));
    }
    throw new Error(message);
  }

  if (responseType === 'blob') {
    return response.blob();
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const get = (url) => request(url);
export const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) });
export const put = (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) });
export const patch = (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) });
export const del = (url) => request(url, { method: 'DELETE' });
export const getBlob = (url) => request(url, {}, 'blob');
