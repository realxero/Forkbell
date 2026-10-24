// Forkbell service worker: keeps the web app itself on the phone so it opens
// with no signal. Your data is not cached here; the app keeps that itself.
// /api and /auth always go to the network.
const SHELL = 'forkbell-shell';
const ASSETS = 'forkbell-assets';

async function precache() {
  try {
    const list = await (await fetch('/sw-assets.json', { cache: 'no-store' })).json();
    const cache = await caches.open(ASSETS);
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    for (const path of list) {
      if (path === '/index.html' || have.has(path)) continue;
      try {
        const res = await fetch(path);
        if (res.ok) await cache.put(path, res);
      } catch {
        /* next time */
      }
    }
  } catch {
    /* offline: keep what we have */
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/form/') || url.pathname === '/sw-assets.json') return;

  if (req.mode === 'navigate') {
    // The page itself: fresh when online, the saved copy when not.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
            const cache = await caches.open(SHELL);
            await cache.put('/', res.clone());
            event.waitUntil(precache()); // pick up files from a new version
          }
          return res;
        } catch {
          return (await caches.match('/', { cacheName: SHELL })) || Response.error();
        }
      })(),
    );
    return;
  }

  // App files have the version in their names, so a saved copy is always right.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { cacheName: ASSETS });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
      return res;
    })(),
  );
});
