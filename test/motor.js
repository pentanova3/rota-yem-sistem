// Sipariş modüllerinin (TMR / Yem) fiyat-damga motorunu HTML'den ÇIKARIP çalıştırılabilir hale getirir.
// Kod KOPYALANMAZ — canlı dosyadan okunur; kod değişince test de değişir, bayat test olmaz.
const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');

// Sayfadaki en büyük (type'sız) script bloğu = uygulama kodu
function anaScript(dosya) {
  const h = fs.readFileSync(path.join(KOK, dosya), 'utf8');
  const bloklar = [...h.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!bloklar.length) throw new Error('script bulunamadı: ' + dosya);
  return bloklar.reduce((a, b) => (b.length > a.length ? b : a));
}

// Adı verilen fonksiyonları kaynaktan söker. Bulunamayan varsa PATLAR —
// "fonksiyon bir modülde var diğerinde yok" hatası (imeceFarkTaban vakası) burada yakalanır.
function fonksiyonlariCikar(src, adlar, dosyaAdi) {
  let kod = '';
  const eksik = [];
  for (const ad of adlar) {
    const cokSatir = new RegExp('^function ' + ad + '\\(' + '[\\s\\S]*?^}', 'm');
    const tekSatir = new RegExp('^function ' + ad + '\\(.*$', 'm');
    const c = src.match(cokSatir), t = src.match(tekSatir);
    if (!c && !t) { eksik.push(ad); continue; }
    // tek satırlık tanım çok-satırlı desene yanlış eşleşebilir → kısa olanı seç
    const sec = (t && t[0].trim().endsWith('}') && (!c || t[0].length < c[0].length)) ? t[0] : c[0];
    kod += sec + '\n';
  }
  if (eksik.length) throw new Error(dosyaAdi + ' → TANIMSIZ FONKSİYON: ' + eksik.join(', '));
  return kod;
}

function sabitleriCikar(src, adlar) {
  let kod = '';
  for (const ad of adlar) {
    const m = src.match(new RegExp('^const ' + ad + '=.*$', 'm'));
    if (m) kod += m[0] + '\n';
  }
  return kod;
}

// Modülü çalıştırılabilir bir "motor" olarak kurar. disBagimlilik: modülün çağırdığı ama
// bizim taklit ettiğimiz fonksiyonlar (DOM, render, toast vb.).
function motorKur({ dosya, fonksiyonlar, sabitler, disBagimlilik, DB }) {
  const src = anaScript(dosya);
  const kod = fonksiyonlariCikar(src, fonksiyonlar, dosya) + sabitleriCikar(src, sabitler || []);
  const ctx = Object.assign({ DB, console }, disBagimlilik || {});
  const fn = new Function(...Object.keys(ctx), kod + ';return {' + fonksiyonlar.join(',') + '};');
  const api = fn(...Object.values(ctx));
  api.__DB = DB;
  api.__src = src;
  return api;
}

// --- küçük test koşucusu ---
let _ok = 0, _hata = 0;
const _hatalar = [];
function baslik(s) { console.log('\n\x1b[1m' + s + '\x1b[0m'); }
function dogru(ad, kosul, not) {
  if (kosul) { _ok++; console.log('  \x1b[32m✓\x1b[0m ' + ad + (not ? '  \x1b[90m' + not + '\x1b[0m' : '')); }
  else { _hata++; _hatalar.push(ad + (not ? ' — ' + not : '')); console.log('  \x1b[31m✗ ' + ad + '\x1b[0m' + (not ? '  ' + not : '')); }
}
function esit(ad, a, b, tol) {
  // METİN KORUMASI (denetim 12.08): sayıya çevrilemeyen metin +x ile NaN olur, ||0 ile 0'a
  // düşerdi ve esit('x','abc','def') SESSİZCE geçerdi — "ayna birebir" sınıfı korumalar boşa
  // dönüyordu. Sayı olmayan argüman geldiğinde katı === karşılaştırmasına geçilir.
  const metin = (x) => typeof x === 'string' && x.trim() !== '' && isNaN(+x);
  if (metin(a) || metin(b)) {
    dogru(ad, a === b, 'beklenen ' + JSON.stringify(b) + ' · gelen ' + JSON.stringify(a));
    return;
  }
  const t = tol == null ? 0.005 : tol;
  dogru(ad, Math.abs((+a || 0) - (+b || 0)) <= t, 'beklenen ' + TL(b) + ' · gelen ' + TL(a));
}
const TL = n => '₺' + (+n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function sonuc() {
  console.log('\n' + '─'.repeat(60));
  if (_hata) {
    console.log('\x1b[31m✗ ' + _hata + ' BAŞARISIZ\x1b[0m · ' + _ok + ' geçti');
    _hatalar.forEach(h => console.log('   • ' + h));
  } else console.log('\x1b[32m✓ ' + _ok + ' kontrolün hepsi geçti\x1b[0m');
  process.exit(_hata ? 1 : 0);
}

module.exports = { anaScript, fonksiyonlariCikar, motorKur, baslik, dogru, esit, TL, sonuc };
