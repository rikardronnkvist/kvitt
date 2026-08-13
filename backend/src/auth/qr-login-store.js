const MAX_ENTRIES = 500;
const TTL_MS = 5 * 60 * 1000;

class QrLoginStore {
  constructor() {
    this.store = new Map();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [token, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(token);
      }
    }
  }

  create(token, loginUrl, claimSecret) {
    this.pruneExpired();
    if (this.store.size >= MAX_ENTRIES) {
      this.store.delete(this.store.keys().next().value);
    }
    const expiresAt = Date.now() + TTL_MS;
    this.store.set(token, {
      token,
      loginUrl,
      claimSecret,
      status: 'pending',
      jwt: null,
      user: null,
      expiresAt,
    });
    return expiresAt;
  }

  complete(token, jwt, user) {
    const entry = this.store.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
      return false;
    }
    entry.status = 'completed';
    entry.jwt = jwt;
    entry.user = user;
    // Extend TTL so the waiting device has time to call /claim after polling detects completion.
    entry.expiresAt = Date.now() + TTL_MS;
    return true;
  }

  getStatus(token) {
    this.pruneExpired();
    const entry = this.store.get(token);
    if (!entry) {
      return { status: 'expired' };
    }
    return { status: entry.status };
  }

  consume(token, claimSecret) {
    const entry = this.store.get(token);
    if (entry?.status !== 'completed') {
      return null;
    }
    if (entry.claimSecret !== claimSecret) {
      return null;
    }
    this.store.delete(token);
    return { jwt: entry.jwt, user: entry.user };
  }
}

export const qrLoginStore = new QrLoginStore();

setInterval(() => qrLoginStore.pruneExpired(), 60_000);
