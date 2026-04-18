/**
 * Herzblatt Journal — Service Worker
 *
 * Aufgaben:
 *   1. Offline-Fallback für Navigation (zeigt zuletzt besuchte Seite oder /offline.html)
 *   2. Runtime-Cache für statische Assets (fonts, icons, images)
 *   3. Push-Notifications empfangen + anzeigen
 *   4. Klick auf Notification → passende URL öffnen
 *
 * Cache-Strategie:
 *   - HTML-Navigation: Network-First, bei Fail aus Cache, bei Fail /offline.html
 *   - Fonts/Icons: Cache-First mit Stale-While-Revalidate
 *   - Alles andere: Network-Only (kein Cache)
 */

const VERSION = 'v1.1.0';
const RUNTIME_CACHE = `hbj-runtime-${VERSION}`;
const OFFLINE_URL = '/offline.html';

// Beim install den Offline-Fallback vorladen.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

// Alte Caches weg, Control sofort übernehmen.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('hbj-') && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Fetch-Handler
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET cachen.
  if (req.method !== 'GET') return;

  // Navigations-Requests (HTML-Seiten) — Network-First
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  const url = new URL(req.url);

  // Fonts + Icons + Logo — Stale-While-Revalidate
  if (
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/apple-touch-icon.png'
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Blog-Bilder — Cache-First mit 30-Tage-Ablauf (für Offline-Lesen)
  if (url.pathname.startsWith('/images/photos/') || url.pathname.startsWith('/images/authors/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Rest: Network-Only (default browser)
});

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    // Nur 2xx Responses cachen.
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// ─────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Herzblatt Journal', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Herzblatt Journal';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    image: data.image || undefined,
    tag: data.tag || 'hbj-push',
    renotify: Boolean(data.renotify),
    requireInteraction: Boolean(data.requireInteraction),
    silent: false,
    data: {
      url: data.url || '/',
      broadcastId: data.id || null,
    },
    actions: data.actions || [
      { action: 'open', title: 'Öffnen' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const broadcastId = data.broadcastId;

  event.waitUntil(
    (async () => {
      // Click-Tracking — fire-and-forget, blockt Navigation nicht.
      if (broadcastId) {
        try {
          await fetch('/api/push/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ broadcastId }),
            keepalive: true,
          });
        } catch { /* offline click = ignore; broadcastId ist verloren */ }
      }

      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Wenn schon ein Tab offen ist → fokussieren und navigieren
      for (const client of clientsArr) {
        try {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        } catch { /* ignore */ }
      }
      // Sonst neuen Tab öffnen
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

// Wenn User Push-Subscription im Browser löscht, re-subscribe versuchen
// und die Client-Page informieren, damit die neue Subscription hochgeladen wird.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsArr) {
        client.postMessage({ type: 'pushsubscriptionchange' });
      }
    })(),
  );
});
