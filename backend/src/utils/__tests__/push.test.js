import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateVAPIDKeys } from 'web-push';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const vapidKeys = generateVAPIDKeys();

describe('push module startup', () => {
  it.each([false, true])('loads in Node with VAPID configured: %s', async (configured) => {
    const script = `
      import assert from 'node:assert/strict';
      import { isConfigured } from ${JSON.stringify(new URL('../push.js', import.meta.url).href)};
      import { db } from ${JSON.stringify(new URL('../../db/database.js', import.meta.url).href)};
      assert.equal(isConfigured(), ${configured});
      db.close();
    `;

    await expect(execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      env: {
        ...process.env,
        DB_PATH: ':memory:',
        VAPID_PUBLIC_KEY: configured ? vapidKeys.publicKey : '',
        VAPID_PRIVATE_KEY: configured ? vapidKeys.privateKey : '',
        VAPID_CONTACT_EMAIL: 'push-test@example.com',
      },
    })).resolves.toMatchObject({ stderr: '' });
  });
});
