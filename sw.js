// Service worker: lets the app open instantly and offline, and shows
// deadline notifications pushed from the hourly cloud check.

const CACHE = 'bgu-tasks-shell-v7';
// Notifications received on this phone, for the app to show (see inbox.js;
// keep these constants in step with it).
const INBOX_CACHE = 'bgu-tasks-inbox';
const INBOX_URL = 'inbox.json';
const INBOX_MAX_ITEMS = 20;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'ui.js',
  'ui-progress.js',
  'store.js',
  'push.js',
  'inbox.js',
  'api.js',
  'config.js',
  'demo-data.js',
  'lib/time.js',
  'lib/tasks.js',
  'lib/calendar.js',
  'lib/ics.js',
  'lib/progress.js',
  'manifest.webmanifest',
  'icons/icon.svg',
];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's own HTTP cache, so a new version of the app
  // is always stored as one consistent set of files.
  const requests = SHELL.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== INBOX_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// App files: ask the network first and keep a copy; fall back to the copy
// only when offline. Answering from the copy first is faster, but after an
// update it can serve old and new files together, which breaks the app.
// Anything else (the Supabase API) goes straight to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (_offline) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw _offline;
    }
  }));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: 'מטלות BGU', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'מטלות BGU';
  const item = { title, body: payload.body || '', tag: payload.tag || '', at: Date.now() };
  event.waitUntil(Promise.all([addToInbox(item), self.registration.showNotification(title, {
    body: payload.body || '',
    tag: payload.tag,
    data: { tag: payload.tag || '' },
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
  })]));
});

async function addToInbox(item) {
  try {
    const cache = await caches.open(INBOX_CACHE);
    const stored = await cache.match(INBOX_URL);
    const list = stored ? await stored.json() : [];
    const next = [item, ...list].slice(0, INBOX_MAX_ITEMS);
    await cache.put(INBOX_URL, new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } }));
  } catch (_err) {
    // Showing the notification matters more than keeping a copy of it.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tag = (event.notification.data && event.notification.data.tag) || '';
  // Open the app on the task the notification is about: tell an open app
  // which one, or start the app with it in the address.
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const open = clients.find((client) => 'focus' in client);
    if (!open) return self.clients.openWindow(`./?n=${encodeURIComponent(tag)}`);
    open.postMessage({ type: 'notification-click', tag });
    return open.focus();
  }));
});
