import webpush from 'web-push';
import { db } from '../db/database.js';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export function getSubscriptionsForUsers(userIds) {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => '?').join(', ');
  return db.prepare(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
  ).all(...userIds);
}

export async function sendPushNotification(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    );
  } catch (err) {
    if (err.statusCode === 410) {
      // subscription expired — remove it
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(subscription.endpoint);
    } else {
      console.error('[push] sendNotification failed:', err.statusCode ?? err.message);
    }
  }
}

export function isConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
