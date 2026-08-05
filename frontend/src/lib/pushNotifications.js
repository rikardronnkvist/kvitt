import { post } from '../api/client.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.codePointAt(0) || 0));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isServiceWorkerSupported() {
  return 'serviceWorker' in navigator;
}

// iOS Safari only delivers push in standalone (PWA) mode
export function isIosNonStandalone() {
  const isIos = /iP(hone|od|ad)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  return isIos && !isStandalone;
}

export async function registerServiceWorker() {
  if (!isServiceWorkerSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push not supported');
  if (isIosNonStandalone()) throw new Error('ios_install');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission_denied');

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    await post('/api/push/subscribe', existingSubscription.toJSON());
    return existingSubscription;
  }

  const { publicKey } = await (await fetch('/api/push/vapid-public-key')).json();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await post('/api/push/subscribe', subscription.toJSON());
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

export async function getSubscriptionState() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return 'default';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'default';
}
