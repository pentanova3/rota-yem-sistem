/* ROTA — SÜRÜM KONTROLÜ (zorlayıcı güncelleme)
   ------------------------------------------------------------------
   Sorun: yeni dağıtım yapıldığında sayfası açık olan kullanıcılar eski kodu kullanmaya
   devam ediyordu ve haberleri olmuyordu ("herkese F5 yaptıramam").

   Çalışma biçimi: /surum.json her hosting dağıtımında otomatik yeniden yazılır
   (firebase.json → hosting.predeploy → surum-yaz.js). Sayfa açılışında oradaki değer
   "benim sürümüm" olarak alınır. Sonraki kontrollerde değer DEĞİŞMİŞSE yeni dağıtım
   yapılmış demektir → ekran kilitlenir, yenilemeden devam edilemez.
   Böylece sayfaya gömülü sürüm numarası tutmaya gerek kalmaz.

   VERİ KAYBI KORUMASI:
   1) Açık form/modal varsa ekran KİLİTLENMEZ; üstte şerit uyarı çıkar.
   2) Yenilemeden ÖNCE: tüm rota_* localStorage anahtarları acil yedeğe alınır
      (rota_guncelleme_yedek) ve varsa __pushNow ile sunucuya senkron zorlanır.
*/
(function () {
  'use strict';
  var DOSYA = '/surum.json';
  var YEDEK_KEY = 'rota_guncelleme_yedek';
  var ARALIK = 90000;      // düzenli kontrol (ms)
  var GERI_SAYIM = 30;     // kilit sonrası otomatik yenilemeye kalan sn
  var PUSH_MAX_MS = 4500;  // senkron için en fazla bekle
  var benim = null, kilitli = false, seritVar = false, sayac = null, yedekAlindi = false;

  function oku(cb) {
    try {
      fetch(DOSYA + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { cb(d && d.v ? String(d.v) : null); })
        .catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  // Açık form/modal var mı — varsa kullanıcıyı yarıda kesme.
  function formAcikMi() {
    try {
      var m = document.getElementById('modalRoot');
      if (m && m.innerHTML && m.innerHTML.trim()) return true;
      var g = document.querySelector('.modal-bg, .pa-modal-bg');
      if (g && g.offsetParent !== null) return true;
    } catch (e) {}
    return false;
  }

  /* Güncelleme anında yerel acil yedek — sunucu yedeğinden bağımsız, tarayıcıda durur. */
  function yerelYedekAl(surum) {
    try {
      var snap = { ts: Date.now(), surum: surum || '', path: location.pathname || '', keys: {} };
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('rota_') !== 0) continue;
        if (k === YEDEK_KEY) continue;   // kendini yedekleme
        try { snap.keys[k] = localStorage.getItem(k); } catch (e) {}
      }
      localStorage.setItem(YEDEK_KEY, JSON.stringify(snap));
      yedekAlindi = true;
      return true;
    } catch (e) {
      console.warn('surum yerel yedek', e);
      return false;
    }
  }

  function senkronZorla(cb) {
    var bitti = false;
    function bitir() {
      if (bitti) return; bitti = true;
      try { cb(); } catch (e) { location.reload(); }
    }
    var p = null;
    try {
      if (typeof window.__pushNow === 'function') p = window.__pushNow();
    } catch (e) { /* yok */ }
    if (p && typeof p.then === 'function') {
      var t = setTimeout(bitir, PUSH_MAX_MS);
      p.then(function () { clearTimeout(t); bitir(); })
        .catch(function () { clearTimeout(t); bitir(); });
    } else {
      setTimeout(bitir, 700);   // schedulePush debounce'una kısa şans
    }
  }

  function seritGoster() {
    if (seritVar) return; seritVar = true;
    var d = document.createElement('div');
    d.id = 'surumSerit';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#B45309;color:#fff;' +
      'font:600 13px/1.4 Inter,system-ui,sans-serif;padding:9px 16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.2)';
    d.textContent = 'Yeni sürüm yayınlandı — açık işleminizi kaydedin; yenilemeden önce otomatik yedek alınır.';
    document.body.appendChild(d);
  }
  function seritKaldir() {
    var d = document.getElementById('surumSerit');
    if (d && d.parentNode) d.parentNode.removeChild(d);
    seritVar = false;
  }

  function kilitle() {
    if (kilitli) return; kilitli = true;
    seritKaldir();
    // Kilit anında da yedek (form yoksa hemen; form varken zaten erken alınmış olabilir)
    yerelYedekAl(benim);
    var o = document.createElement('div');
    o.id = 'surumKilit';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(12,35,64,.97);color:#fff;' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font-family:Inter,system-ui,-apple-system,sans-serif;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)';
    o.innerHTML =
      '<div style="max-width:440px;text-align:center">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8DC2F2;margin-bottom:12px">Sistem Güncellendi</div>' +
      '<div style="font-size:21px;font-weight:700;margin-bottom:10px">Yeni sürüm yayınlandı</div>' +
      '<div style="font-size:14px;line-height:1.6;color:#C1D9F0;margin-bottom:22px">' +
      'Yenilemeden önce <b style="color:#fff">otomatik yedek</b> alınıp bekleyen kayıtlar sunucuya yazılır. ' +
      'Ardından sayfa yenilenir — kayıtlı verileriniz korunur.' +
      '</div>' +
      '<button id="surumYenileBtn" style="background:#fff;color:#0C2340;border:0;border-radius:9px;padding:12px 26px;' +
      'font:700 14px Inter,system-ui,sans-serif;cursor:pointer">Şimdi Yenile</button>' +
      '<div id="surumGeri" style="font-size:12px;color:#8DC2F2;margin-top:14px"></div>' +
      '</div>';
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    var btn = document.getElementById('surumYenileBtn');
    if (btn) btn.onclick = yenile;

    // Otomatik yenileme — geri sayımlı. Kısa süre önce zorunlu yenileme olduysa
    // (olası döngüye karşı) otomatik yenileme yapılmaz, yalnız buton kalır.
    var son = 0;
    try { son = +(sessionStorage.getItem('rota_surum_yenileme') || 0); } catch (e) {}
    if (Date.now() - son < 60000) {
      var g0 = document.getElementById('surumGeri');
      if (g0) g0.textContent = 'Yenilemek için yukarıdaki düğmeye basın.';
      return;
    }
    var kalan = GERI_SAYIM;
    var g = document.getElementById('surumGeri');
    if (g) g.textContent = kalan + ' saniye içinde yedeklenip yenilenecek';
    sayac = setInterval(function () {
      kalan--;
      if (g) g.textContent = kalan + ' saniye içinde yedeklenip yenilenecek';
      if (kalan <= 0) { clearInterval(sayac); yenile(); }
    }, 1000);
  }

  function yenile() {
    if (sayac) { try { clearInterval(sayac); } catch (e) {} sayac = null; }
    var g = document.getElementById('surumGeri');
    if (g) g.textContent = 'Yedek alınıyor ve senkron yapılıyor…';
    var btn = document.getElementById('surumYenileBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Hazırlanıyor…'; }
    yerelYedekAl(benim);
    senkronZorla(function () {
      try { sessionStorage.setItem('rota_surum_yenileme', String(Date.now())); } catch (e) {}
      location.reload();
    });
  }

  function kontrol() {
    if (kilitli) return;
    oku(function (v) {
      if (!v) return;                      // dosya yok / ağ hatası → sessizce geç
      if (benim === null) { benim = v; return; }   // ilk okuma: kendi sürümüm
      if (v === benim) { if (seritVar) seritKaldir(); return; }
      // Yeni sürüm: hemen yerel yedek (form açıksa bile — yarım iş + mevcut blob korunur)
      if (!yedekAlindi) yerelYedekAl(v);
      if (formAcikMi()) { seritGoster(); setTimeout(kontrol, 8000); return; }  // form bitsin
      kilitle();
    });
  }

  function basla() {
    kontrol();
    setInterval(kontrol, ARALIK);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) kontrol();     // sekmeye dönünce hemen bak
    });
    window.addEventListener('focus', kontrol);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla);
  else basla();
})();
