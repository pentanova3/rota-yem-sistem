// Rota SMI Tarım — Service Worker (yalnız PWA "kurulabilirlik" için).
// Uygulama verisi Firebase'den canlı geldiği için içerik ÖNBELLEĞE ALINMAZ.
//
// KRİTİK DÜZELTME (13.07.2026): Eski sürüm HER isteği `fetch(req).catch(()=>caches.match(req))` ile sarıyordu.
// Çapraz-origin (gstatic Firebase SDK, Google Fonts) istekleri için bu, ağ/tarayıcı fark ettiğinde yüklemeyi
// net::ERR_FAILED'e düşürüyordu → Firebase SDK yüklenemiyor → giriş sonsuza takılıp kullanıcıyı atıyordu.
// (İsmail'in bilgisayarında çalışıp başka bilgisayarlarda çalışmamasının sebebi buydu.)
// ÇÖZÜM: Service worker HİÇBİR isteği engellemez/sarmaz — tarayıcı her şeyi kendi güçlü mekanizmasıyla yükler.
const VERSION = 'rota-sw-v4';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
// Bilinçli olarak BOŞ: respondWith çağrılmaz → tüm istekler (same-origin + cross-origin) tarayıcının
// varsayılan, dayanıklı yüklemesine bırakılır. SW hiçbir şeye karışmaz.
self.addEventListener('fetch', () => {});
