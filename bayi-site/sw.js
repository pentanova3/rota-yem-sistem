// Rota SMI Bayi & Danışman Portalı — Service Worker (uygulama kabuğu + çevrimdışı yükleme)
const CACHE = 'rota-bayi-v1';
const SHELL = ['/', '/index.html', '/rota-smi.png', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // Veri/kimlik uçları HER ZAMAN ağdan (asla cache): Firebase, gstatic, Cloud Functions, aynı-köken olmayanlar
  if (e.request.method !== 'GET' || u.origin !== self.location.origin ||
      /googleapis|gstatic|firebase|cloudfunctions|run\.app/.test(u.hostname)) return;
  // Uygulama kabuğu: önce ağ, çevrimdışıysa cache (ve index.html'e düş)
  e.respondWith(
    fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp).catch(() => {})); return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html')))
  );
});
