import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databasePath = `./data/oauth-token-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'oauth-token-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const {
  createOAuthToken,
  issueTokenPair,
  OAuthTokenError,
  rotateRefreshToken,
  verifyOAuthAccessToken,
} = await import('../tokens.js');

const userId = 91001;
const grantId = '00000000-0000-0000-0000-000000000101';
const clientId = 'https://client.example/oauth.json';
const resource = 'https://kvitt.example/mcp';
const scopes = ['groups:read', 'expenses:read'];

function insertGrant() {
  db.prepare(`
    INSERT INTO oauth_grants (id, user_id, client_id, client_name, scopes, resource)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(grantId, userId, clientId, 'Test client', JSON.stringify(scopes), resource);
}

beforeAll(() => {
  initializeDatabase();
});

beforeEach(() => {
  db.exec(`
    DELETE FROM oauth_authorization_codes;
    DELETE FROM oauth_tokens;
    DELETE FROM oauth_grants;
    DELETE FROM users WHERE id = ${userId};
  `);
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, 'OAuth User', 'oauth-user', 0)
  `).run(userId);
  insertGrant();
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('OAuth token primitives', () => {
  it('creates correctly prefixed opaque tokens and stores only their hashes', () => {
    const access = createOAuthToken('access');
    const refresh = createOAuthToken('refresh');

    expect(access.token).toMatch(/^kvitt_oat_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/u);
    expect(refresh.token).toMatch(/^kvitt_ort_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/u);
    expect(access.secretHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(access.secretHash).not.toBe(access.token);
  });

  it('issues and verifies an access token', () => {
    const pair = issueTokenPair({ grantId, scopes, resource });

    expect(verifyOAuthAccessToken(pair.accessToken)).toMatchObject({
      grantId,
      scopes,
      resource,
      user: { id: userId },
    });
    const stored = db.prepare("SELECT secret_hash FROM oauth_tokens WHERE token_type = 'access'").get();
    expect(stored.secret_hash).not.toContain(pair.accessToken);
  });

  it('rejects expired and revoked access tokens and revoked grants', () => {
    const expired = issueTokenPair({ grantId, scopes, resource });
    db.prepare("UPDATE oauth_tokens SET expires_at = datetime('now', '-1 second') WHERE token_type = 'access'").run();
    expect(verifyOAuthAccessToken(expired.accessToken)).toBeNull();

    const revoked = issueTokenPair({ grantId, scopes, resource });
    db.prepare("UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_type = 'access' AND revoked_at IS NULL").run();
    expect(verifyOAuthAccessToken(revoked.accessToken)).toBeNull();

    const grantRevoked = issueTokenPair({ grantId, scopes, resource });
    db.prepare('UPDATE oauth_grants SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(grantId);
    expect(verifyOAuthAccessToken(grantRevoked.accessToken)).toBeNull();
  });

  it('rotates refresh tokens within the same family', () => {
    const original = issueTokenPair({ grantId, scopes, resource });
    const rotated = rotateRefreshToken(original.refreshToken, clientId, resource);

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    expect(rotated.familyId).toBe(original.familyId);
    const used = db.prepare("SELECT used_at FROM oauth_tokens WHERE token_type = 'refresh' ORDER BY created_at, rowid LIMIT 1").get();
    expect(used.used_at).not.toBeNull();
    expect(verifyOAuthAccessToken(rotated.accessToken)).toMatchObject({ grantId, resource });
  });

  it('revokes the entire refresh family when a rotated token is reused', () => {
    const original = issueTokenPair({ grantId, scopes, resource });
    const rotated = rotateRefreshToken(original.refreshToken, clientId, resource);

    expect(() => rotateRefreshToken(original.refreshToken, clientId, resource)).toThrow(OAuthTokenError);
    const active = db.prepare(`
      SELECT COUNT(*) AS count
      FROM oauth_tokens
      WHERE family_id = ? AND revoked_at IS NULL
    `).get(rotated.familyId);
    expect(active.count).toBe(0);
    expect(verifyOAuthAccessToken(rotated.accessToken)).toBeNull();
  });
});
