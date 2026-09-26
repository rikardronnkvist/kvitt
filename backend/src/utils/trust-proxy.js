const DEFAULT_TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal';

export function getTrustProxySetting(value = process.env.TRUST_PROXY) {
  const configured = typeof value === 'string' ? value.trim() : '';
  return configured || DEFAULT_TRUSTED_PROXIES;
}

export function configureTrustProxy(app, value = process.env.TRUST_PROXY) {
  app.set('trust proxy', getTrustProxySetting(value));
}
