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
