// Phone notifications: ask permission, register this device with the push
// service, and hand back what the server needs to reach it.

import { VAPID_PUBLIC_KEY } from './config.js';

export const SUPPORT_OK = 'ok';
export const SUPPORT_NEEDS_INSTALL = 'needs-install'; // iPhone: only from the home-screen app
export const SUPPORT_DENIED = 'denied';               // blocked in the device settings
export const SUPPORT_NONE = 'unsupported';

function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** @returns {string} one of the SUPPORT_* values */
export function pushSupport() {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApis) return isIos() && !isStandalone() ? SUPPORT_NEEDS_INSTALL : SUPPORT_NONE;
  if (Notification.permission === 'denied') return SUPPORT_DENIED;
  return SUPPORT_OK;
}

// The push service wants the public key as raw bytes, not base64url text.
function keyBytes(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function toRecord(subscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** @returns {Promise<{ endpoint: string, p256dh: string, auth: string }|null>} this device's registration, if any */
export async function currentSubscription() {
  if (pushSupport() !== SUPPORT_OK) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? toRecord(subscription) : null;
}

/** Ask permission and register. Throws with a readable message when refused. */
export async function subscribe() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('לא ניתנה הרשאה להתראות');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
  });
  return toRecord(subscription);
}

/** @returns {Promise<string|null>} the endpoint that was removed, if there was one */
export async function unsubscribe() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
