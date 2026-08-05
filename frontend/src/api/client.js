import { t } from '../lib/i18n.js';

const getToken = () => localStorage.getItem('token');

function buildSafeUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new Error(t('common.genericError'));
  }
  return url;
}

function redirectToLogin() {
  localStorage.removeItem('token');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function request(url, options = {}, responseType = 'json') {
  const token = getToken();
  const headers = {
    ...(responseType !== 'blob' ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...options.headers,
  };

  const response = await fetch(buildSafeUrl(url), { ...options, headers });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(t('auth.sessionExpired'));
  }

  if (!response.ok) {
    let message = t('common.genericError');
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = response.statusText || message;
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
