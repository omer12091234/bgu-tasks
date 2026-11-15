// Notifications that reached this phone, kept so the app can show them
// after you tap one. The service worker (sw.js) writes the list when a
// notification arrives; this file reads and clears it. Both sides share
// browser storage that works even when the app is closed.

// Keep these two in step with the same constants in sw.js.
const INBOX_CACHE = 'bgu-tasks-inbox';
const INBOX_URL = 'inbox.json';

/** @returns {Promise<{ title: string, body: string, tag: string, at: number }[]>} newest first */
export async function readInbox() {
  if (!('caches' in globalThis)) return [];
  try {
    const cache = await caches.open(INBOX_CACHE);
    const stored = await cache.match(INBOX_URL);
    const list = stored ? await stored.json() : [];
    return Array.isArray(list) ? list : [];
  } catch (_err) {
    return []; // unreadable storage must never break the app
  }
}

export async function clearInbox() {
  if (!('caches' in globalThis)) return;
  const cache = await caches.open(INBOX_CACHE);
  await cache.delete(INBOX_URL);
}
