import webpush from 'web-push';
import { db } from '../db/database.js';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

const deleteSubscription = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

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
    // 410 Gone means the subscription is no longer valid
    if (err.statusCode === 410) {
      deleteSubscription.run(subscription.endpoint);
    }
  }
}

export function isConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
