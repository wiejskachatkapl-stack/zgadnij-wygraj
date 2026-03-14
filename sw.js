// ZGADNIJ PWA Service Worker (BUILD 3000)
const CACHE_NAME = 'zgadnij-cache-3000';

// Core assets to pre-cache (keep minimal to avoid stale UI)
const CORE = [
  './',
  './index.html',
  './app.js?v=3000',
  './manifest.json',
  './data/leagues.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try{
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
    }catch(e){}
    await self.clients.claim();
  })());
});

// Network-first for HTML/JS to avoid stale UI; cache-fallback for others
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html');
  const isJS = url.pathname.endsWith('.js');

  if (isHTML || isJS) {
    event.respondWith((async () => {
      try{
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch(e){
        const cached = await caches.match(req);
        return cached || caches.match('./index.html') || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try{
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    }catch(e){
      return cached || Response.error();
    }
  })());
});
