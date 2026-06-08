// Rota SMI Tarım — Service Worker (kurulabilirlik için, ağ öncelikli)
// Uygulama verisi Firebase'den canlı geldiği için içerik önbelleğe alınmaz;
// böylece her zaman güncel sürüm gösterilir.
const VERSION = 'rota-sw-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Ağ öncelikli; çevrimdışıysa tarayıcının kendi hatası gösterilir.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
