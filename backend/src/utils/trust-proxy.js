const DEFAULT_TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal';

export function getTrustProxySetting(value = process.env.TRUST_PROXY) {
  const configured = typeof value === 'string' ? value.trim() : '';
  return configured || DEFAULT_TRUSTED_PROXIES;
}

export function configureTrustProxy(app, value = process.env.TRUST_PROXY) {
  app.set('trust proxy', getTrustProxySetting(value));
  const isTrustedAddress = app.get('trust proxy fn');

  // nginx is the only proxy hop in the supported deployment topology.
  app.set('trust proxy', (address, hop) => hop === 0 && isTrustedAddress(address));
}
