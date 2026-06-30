// =====================================================
// Task Quest service worker
// -----------------------------------------------------
// Cache-first for the app shell (HTML, CSS, all JS modules,
// icons, manifest, AND the Supabase CDN bundle — the app
// can't boot offline without it). Supabase REST/auth calls
// (anything on *.supabase.co) and all non-GET requests go
// straight to the network and are never cached, so the dirty
// queue in sync.js stays the single source of truth for writes.
//
// Bump CACHE_VERSION on ANY change to a shell file below, or
// installed users will keep serving stale assets.
// =====================================================

const CACHE_VERSION = 'v1';
const CACHE = `tasks-shell-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './auth.js',
  './sync.js',
  './state.js',
  './pomodoro.js',
  './ui.js',
  './stats.js',
  './main.js',
  './pwa.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll is atomic — if any request fails the whole install fails,
      // so cache the CDN bundle tolerantly to avoid a transient CDN hiccup
      // blocking the install of the rest of the shell.
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] failed to precache', url, err);
          })
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('tasks-shell-') && k !== CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Let pwa.js trigger an immediate update via postMessage.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch writes — the dirty queue owns those.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase REST/auth/storage: always network, never cached.
  if (url.hostname.endsWith('.supabase.co')) return;

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const res = await fetch(req);
    // Cache successful same-origin GETs we didn't precache (defensive).
    if (res && res.ok && new URL(req.url).origin === self.location.origin) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Offline and uncached: for a page navigation, serve the app shell.
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}
