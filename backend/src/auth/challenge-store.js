const MAX_ENTRIES = 1000;

class ChallengeStore {
  constructor() {
    this.store = new Map();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [requestId, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(requestId);
      }
    }
  }

  set(entry) {
    this.pruneExpired();
    if (this.store.size >= MAX_ENTRIES) {
      this.store.delete(this.store.keys().next().value);
    }
    this.store.set(entry.requestId, entry);
  }

  consume({ requestId, purpose }) {
    this.pruneExpired();
    const entry = this.store.get(requestId);
    if (!entry) {
      return null;
    }

    this.store.delete(requestId);

    if (entry.purpose !== purpose) {
      return null;
    }

    return entry;
  }
}

export const challengeStore = new ChallengeStore();

setInterval(() => challengeStore.pruneExpired(), 60_000);
