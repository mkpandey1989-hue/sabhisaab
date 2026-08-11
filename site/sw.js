/* Sab Hisaab — Service Worker (v1)
   Network-first: hamesha fresh page dikhata hai.
   Sirf same-origin pages ka fallback cache hota hai.
   Ads / Analytics / third-party requests ko bilkul touch nahi karta
   (AdSense ke liye ye zaroori hai — ad requests kabhi cache nahi honi chahiye). */

const CACHE = 'sabhisaab-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Third-party (ads, analytics, fonts, CDN) — service worker inko bypass karta hai
  if (url.origin !== self.location.origin) return;

  // Sirf GET requests handle karo
  if (e.request.method !== 'GET') return;

  // Network-first, cache fallback (offline par last version dikhega)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok && e.request.destination !== '') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});
