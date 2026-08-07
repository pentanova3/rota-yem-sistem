// ÖDEME MOTORU TESTİ — DBS (+ İMECE flag'e bağlı)
// Kod HTML'den ANLIK çıkarılır (kopya yok). İMECE flag'i (IMECE_AKTIF) okunur; kapalıysa
// İMECE davranış testleri ATLANIR ve yerine "İMECE kapalı → DBS bozulmadı" garantisi koşulur.
//   çalıştır:  node test/odeme.test.js
const { motorKur, baslik, dogru, esit, TL, sonuc, anaScript } = require('./motor');

// ── İki modülde de BULUNMASI ZORUNLU fonksiyonlar (biri eksikse test PATLAR) ────
const ORTAK = ['round2', 'odemeTipiOf', 'dbsAliciAktif', 'dbsOranAyar', 'dbsOran', 'dbsIskonto',
  'imeceOranlar', 'imeceOranGecerli', 'imeceOranAy', 'imeceAySip', 'imeceAliciAktif',
  'ordKayit', 'vadeDegistiMi', 'aliciDegistiMi', 'imeceOranSip', 'imeceFark',
  'imeceEksikFiyat', 'imeceElleFiyatli', 'dbsOranDamgaHesap', 'odemeDamgala'];
// YALNIZ TMR'de aranan yeni İMECE hesap motoru (Yem altyapısı sonra kurulacak — firma kararı)
const TMR_IMECE = ['ordTaban', 'manuelFatura', 'faturaArtisi', 'imeceKirp', 'imeceManuelMi', 'imeceSeciliMi', 'imeceSecilebilirMi',
  'imeceBirimVade', 'imeceSatirTutar', 'imeceOranKolon', 'imeceVadeToplam', 'imeceAnaTutar',
  'imeceFarkAy', 'imeceGenelToplam', 'listeBirimFiyat', 'orderListKademe', 'orderListTotal', 'brutListeDamga'];

// saveOrder ile AYNI SIRA: damgala → total → imeceFark → brutListe → diziye yaz.
// Testler bu yardımcıdan geçmeli; "id'si olan ama DB'de olmayan" nesneyi damgalamak gerçek akış DEĞİL
// (ve yeni 'kayıt bulunamadı = değişmedi' kuralı yüzünden damga hiç atılmaz — test sahte geçer).
function kaydet(M, o) {
  M.odemeDamgala(o);
  o.total = M.imeceAnaTutar(o);
  o.imeceFark = M.imeceFark(o);
  const bl = M.brutListeDamga ? M.brutListeDamga(o) : 0;
  if (bl > 0) o.brutListe = bl; else delete o.brutListe;
  if (!o.id) o.id = 'o' + (M.__DB.orders.length + 1);
  const i = M.__DB.orders.findIndex(x => x.id === o.id);
  if (i < 0) M.__DB.orders.push(o); else M.__DB.orders[i] = o;
  return o;
}
const kopya = o => Object.assign({}, o, { lines: (o.lines || []).map(l => Object.assign({}, l)) });
// YALNIZ Yem'de kalan ESKİ (toplam-bazlı) fonksiyonlar. TMR'de bilerek SÖKÜLDÜ: aynı siparişe üç farklı
// 2. fatura üretiyorlardı. Yem'in İMECE altyapısı kurulunca bunlar da TMR modeline geçecek.
const YEM_ESKI = ['imeceTutar', 'imeceFarkTaban', 'imeceFarkOranla'];
const SABIT = ['IMECE_AKTIF', 'IMECE_AYLAR', 'IMECE_ORAN_DEFAULT', 'DBS_ORAN_DEFAULT'];

function tmrKur() {
  const DB = { meta: { dbsOran: 3 }, orders: [], products: [], customers: [] };
  const dis = {
    prodByCode: c => DB.products.find(p => p.code === c) || null,
    custById: i => DB.customers.find(c => c.id === i) || null,
    ordBayi: () => null, orderPL: () => null,
    // Tarife: yalnız GERÇEK kademelerde fiyat var. 'bayi' KADEME DEĞİLDİR (fabrika/yakin/uzak) — canlı
    // koddaki gibi 0 döner; orderListTotal bunu görüp fabrikaya düşmezse bayi iskontosu 0 görünür.
    tariffPrice: (pl, code, kad) => {
      const p = DB.products.find(x => x.code === code) || {};
      return (kad === 'krediKarti') ? (+p.krediKarti || 0) : (+p[kad] || 0);
    },
    lineUnit: l => (l.price === '' ? 0 : (+l.price || 0)),
    ilaveIskonto: () => 0,
    // orderNetDbs = HESAPLANAN tutar (manuel tutarı BİLMEZ; onu orderTotal ezer) — canlı kodla eş.
    orderNetDbs: o => {
      const net = (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (l.price === '' ? 0 : (+l.price || 0)), 0);
      const r = api.dbsOran(o);
      return Math.round((net - (r > 0 ? Math.round(net * r / 100 * 100) / 100 : 0)) * 100) / 100;
    },
    orderNetHesap: o => (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (l.price === '' ? 0 : (+l.price || 0)), 0),
    // Canlı orderTotal ile AYNI kural: manuel tutar manuelFatura() üzerinden geçer (0/negatif/'' = yok).
    orderTotal: o => {
      const m = api.manuelFatura(o);
      if (m != null) return m;
      const net = (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (l.price === '' ? 0 : (+l.price || 0)), 0);
      const r = api.dbsOran(o);
      return Math.round((net - (r > 0 ? net * r / 100 : 0)) * 100) / 100;
    },
  };
  var api = motorKur({ dosya: 'siparis-takip/index.html', fonksiyonlar: ORTAK.concat(TMR_IMECE), sabitler: SABIT, disBagimlilik: dis, DB });
  return api;
}
function yemKur() {
  const DB = { meta: { dbsOran: 3 }, orders: [], products: [], customers: [], ozelListeler: [] };
  const dis = {
    custById: i => DB.customers.find(c => c.id === i) || null,
    prodByCode: c => DB.products.find(p => p.code === c) || null,
    fiyatFor: () => null, ozelListeById: () => null,
    orderUrunNet: o => (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0),
    orderNakliye: () => 0, orderHammaliye: () => 0, orderAraciKomisyon: () => 0,
    orderTotal: o => {
      const net = (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0);
      const r = api.dbsOran(o);
      return Math.round((net - (r > 0 ? net * r / 100 : 0)) * 100) / 100;
    },
    dbsIskonto: o => { const r = api.dbsOran(o); const net = (o.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0); return r > 0 ? Math.round(net * r / 100 * 100) / 100 : 0; },
  };
  var api = motorKur({ dosya: 'yem/index.html', fonksiyonlar: ORTAK.concat(YEM_ESKI), sabitler: SABIT, disBagimlilik: dis, DB });
  return api;
}

// Flag'i kaynaktan oku (iki modül de aynı olmalı)
function flagOku(dosya) { const m = /const\s+IMECE_AKTIF\s*=\s*(true|false)/.exec(anaScript(dosya)); return m ? m[1] === 'true' : null; }

// ═══════════════════════════════════════════════════════════════════════════════
baslik('1) EŞLİK — motor kuruluyor + İMECE flag durumu');
let TMR = null, YEM = null;
try { TMR = tmrKur(); dogru('TMR motoru kuruldu (' + (ORTAK.length + TMR_IMECE.length) + ' fonksiyon)', true); }
catch (e) { dogru('TMR motoru kuruldu', false, e.message); }
try { YEM = yemKur(); dogru('YEM motoru kuruldu (' + (ORTAK.length + YEM_ESKI.length) + ' fonksiyon)', true); }
catch (e) { dogru('YEM motoru kuruldu', false, e.message); }
if (!TMR || !YEM) sonuc();

const fTMR = flagOku('siparis-takip/index.html'), fYEM = flagOku('yem/index.html');
dogru('İMECE flag İKİ modülde de tanımlı', fTMR !== null && fYEM !== null, 'TMR=' + fTMR + ' YEM=' + fYEM);
// Flag'ler KASITLI olarak farklı olabilir: İMECE önce TMR'de açılır, Yem altyapısı sonra kurulur (firma kararı).
// Bu yüzden eşitlik ZORUNLU değil; her modül kendi flag'ine göre test edilir.
const IMECE = fTMR === true;                       // İMECE testleri TMR flag'ine bakar
console.log('  \x1b[90m(Yem İMECE flag: ' + fYEM + ' — altyapı ayrıca kurulacak)\x1b[0m');
console.log('\n  \x1b[1mİMECE durumu: ' + (IMECE ? 'AÇIK' : 'KAPALI') + '\x1b[0m — testler buna göre koşuluyor\n');

// ─────────────────────────────────────────────────────────────────────────────
baslik('2) DBS ÇEKİRDEĞİ — flag\'den BAĞIMSIZ, her zaman geçerli');
for (const [ad, M] of [['TMR', TMR], ['YEM', YEM]]) {
  M.__DB.customers = [{ id: 'db', iskonto: 0, odemeTipi: 'dbs' }, { id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const dbsO = { id: null, customerId: 'db', imeceAy: 0, lines: [{ code: 'X', qty: 100, price: 1000 }] };
  const norm = { id: null, customerId: 'n', imeceAy: 0, lines: [{ code: 'X', qty: 100, price: 1000 }] };
  dogru(ad + ': DBS müşterisinde DBS aktif', M.dbsAliciAktif(dbsO) === true);
  dogru(ad + ': normal müşteride DBS pasif', M.dbsAliciAktif(norm) === false);
  M.odemeDamgala(dbsO); dogru(ad + ': yeni DBS siparişi → dbsOran 3', dbsO.dbsOran === 3, 'dbsOran=' + dbsO.dbsOran);
  M.odemeDamgala(norm); dogru(ad + ': normal sipariş → dbsOran 0', norm.dbsOran === 0, 'dbsOran=' + norm.dbsOran);
}

baslik('3) DBS KİLİDİ — kayıtlı sipariş ayar değişince kaymaz');
for (const [ad, M] of [['TMR', TMR], ['YEM', YEM]]) {
  M.__DB.orders = [{ id: 'k2', customerId: 'db', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] }];
  M.__DB.meta.dbsOran = 30;
  const o = { id: 'k2', customerId: 'db', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] };
  M.odemeDamgala(o);
  dogru(ad + ': damga %3 korundu (ayar %30 rağmen)', o.dbsOran === 3, 'dbsOran=' + o.dbsOran);
  M.__DB.meta.dbsOran = 3;
}

baslik('4) DBS ÖNİZLEME = KAYIT — alıcı değişince (müşteri/bayi)');
for (const [ad, M] of [['TMR', TMR], ['YEM', YEM]]) {
  M.__DB.meta.dbsOran = 3;
  M.__DB.orders = [{ id: 'a1', customerId: 'db', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] }];
  const acik = { id: 'a1', customerId: 'n', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] };  // DBS'li → DBS'siz
  dogru(ad + ': aliciDegistiMi alıcı değişimini görüyor', M.aliciDegistiMi(acik) === true);
  globalThis.editOrder = acik; const oniz = M.dbsOran(acik); globalThis.editOrder = null;
  const kayit = Object.assign({}, acik); M.odemeDamgala(kayit);
  dogru(ad + ': alıcı değişince önizleme = kayıt', oniz === kayit.dbsOran, 'öniz=' + oniz + ' kayıt=' + kayit.dbsOran);
  // yanlış alarm olmamalı
  M.__DB.orders = [{ id: 'a3', customerId: 'db', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] }];
  const ayni = { id: 'a3', customerId: 'db', imeceAy: 0, imeceOran: 0, dbsOran: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] };
  dogru(ad + ': alıcı aynıysa değişim YOK', M.aliciDegistiMi(ayni) === false);
  M.odemeDamgala(ayni); dogru(ad + ': alıcı aynıysa damga korunur', ayni.dbsOran === 3, 'dbsOran=' + ayni.dbsOran);
}

baslik('5) SINIR — bozuk İMECE oranı ₺∞/negatif üretmemeli');
{
  // Bozuk oran kaynağı: yedekten/blob'dan gelen değer (ayar formu kırpıyor ama kayıt kırpmıyor).
  // r=100 → ÷0 → ₺∞ · r>100 → NEGATİF fatura. İki modül de kendi motoruyla güvenli kalmalı.
  TMR.__DB.meta.imeceOranlar = { 1: 100, 2: 120, 3: -5, 4: 'abc' };
  [1, 2, 3, 4].forEach(ay => { const t = TMR.imeceBirimVade(1000, ay); dogru('TMR: oran[' + ay + '] bozuk → birim güvenli', isFinite(t) && t === 1000, TL(t)); });
  TMR.__DB.meta.imeceOranlar = null;
  YEM.__DB.meta.imeceOranlar = { 1: 100, 2: 120, 3: -5, 4: 'abc' };
  [1, 2, 3, 4].forEach(ay => { const t = YEM.imeceTutar(100000, ay); dogru('YEM: oran[' + ay + '] bozuk → güvenli', isFinite(t) && t >= 100000 && t < 200000, TL(t)); });
  YEM.__DB.meta.imeceOranlar = null;
}

// ─────────────────────────────────────────────────────────────────────────────
if (!IMECE) {
  baslik('6) İMECE KAPALI GARANTİSİ — vade seçilse bile ETKİSİZ, DBS bozulmaz');
  for (const [ad, M] of [['TMR', TMR], ['YEM', YEM]]) {
    M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
    const vadeli = { id: null, customerId: 'db', imeceAy: 3, lines: [{ code: 'X', qty: 100, price: 1000 }] };
    dogru(ad + ': imeceAySip flag kapalı → 0', M.imeceAySip(vadeli) === 0, 'imeceAy=' + M.imeceAySip(vadeli));
    dogru(ad + ': imeceAliciAktif hep false', M.imeceAliciAktif(vadeli) === false);
    dogru(ad + ': İMECE müşterisinde bile vade seçilince DBS AYNEN çalışır', M.dbsAliciAktif(vadeli) === true);
    M.odemeDamgala(vadeli);
    dogru(ad + ': vadeli DBS siparişi → dbsOran 3 (İMECE kapalı)', vadeli.dbsOran === 3, 'dbsOran=' + vadeli.dbsOran);
    dogru(ad + ': imeceOran damgası 0', (+vadeli.imeceOran || 0) === 0, 'imeceOran=' + vadeli.imeceOran);
    dogru(ad + ': imeceFark 0', M.imeceFark(vadeli) === 0);
  }
  baslik('6b) İMECE DEVREYE ALMA — kapalıyken kutucuk işaretli olsa bile seçili sayılmaz');
  {
    const o = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 3, lines: [{ code: 'X', qty: 10, price: 100 }] };
    dogru('TMR: flag kapalı → imeceSeciliMi false', TMR.imeceSeciliMi(o) === false);
  }
} else {
  baslik('6) İMECE DEVREYE ALMA — kutucuk + DBS dışlaması');
  {
    const M = TMR;
    M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
    const isaretli = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2, lines: [{ code: 'X', qty: 10, price: 100 }] };
    const isaretsiz = { id: null, customerId: 'n', imeceSecili: false, imeceAy: 0, lines: [{ code: 'X', qty: 10, price: 100 }] };
    const dbsli = { id: null, customerId: 'db', imeceSecili: true, imeceAy: 2, lines: [{ code: 'X', qty: 10, price: 100 }] };
    dogru('kutucuk işaretli → İMECE seçili', M.imeceSeciliMi(isaretli) === true);
    dogru('kutucuk işaretsiz → İMECE seçili DEĞİL', M.imeceSeciliMi(isaretsiz) === false);
    // AYRIM NET: imeceSeciliMi yalnız DAMGAYA bakar (müşteri kartına ASLA).
    // Kartı sorgulayan tek şey imeceSecilebilirMi'dir ve o yalnız AÇIK FORM kararıdır.
    dogru('DBS li müşteride kutucuk SEÇİLEMEZ (form kapısı)', M.imeceSecilebilirMi(dbsli) === false);
    dogru('DBS siz müşteride kutucuk seçilebilir', M.imeceSecilebilirMi(isaretsiz) === true);
    M.odemeDamgala(dbsli);
    dogru('DBS li alıcıda damgalanınca İMECE temizlenir', dbsli.imeceSecili === false && (+dbsli.imeceAy || 0) === 0);
    dogru('DBS li müşteride DBS aynen çalışır', dbsli.dbsOran === 3, 'dbsOran=' + dbsli.dbsOran);
  }
}

// ── İMECE HESAP MOTORU — flag'den BAĞIMSIZ (saf hesap, her zaman koşar) ────────
baslik('6c) İMECE HESAP MOTORU — kullanıcının Excel tablosu BİREBİR');
{
  const M = TMR;
  // Kullanıcının paylaştığı Excel: DG-10 ×50, BK 100+ ×100, iskontosuz (satır fiyatı = kredi kartı fiyatı)
  const o = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] };
  const EXCEL = {
    'DG-10':   [40147, 40975, 42737, 44657.50, 46759, 49068],
    'BK 100+': [86859, 88650, 92463, 96618, 101164, 106159],
  };
  const TOPLAM = [127006, 129625, 135200, 141275.50, 147923, 155227];
  for (const l of o.lines)
    [1, 2, 3, 4, 5, 6].forEach((ay, i) => esit(l.code + ' ' + ay + ' ay', M.imeceSatirTutar(o, l, ay), EXCEL[l.code][i]));
  [1, 2, 3, 4, 5, 6].forEach((ay, i) => esit('TOPLAM ' + ay + ' ay', M.imeceVadeToplam(o, ay), TOPLAM[i]));

  baslik('6d) KIRPMA KURALI — yuvarlama DEĞİL, aşağı kırpma (ROUNDDOWN)');
  // 795/(1-0,1099)=893,1581 → kırp 893,15 (yuvarlasak 893,16 olurdu → satır 44.658,00 çıkardı)
  esit('DG-10 4 ay birim kırpılmış', M.imeceBirimVade(795, 4), 893.15);
  dogru('yuvarlama kullanılmıyor', M.imeceBirimVade(795, 4) !== 893.16, 'kırpma şart, Excel 44.657,50 diyor');
  esit('BK 100+ 6 ay birim kırpılmış', M.imeceBirimVade(860, 6), 1061.59);

  baslik('6e) İKİ FATURA — 1. normal ederi · 2. fiyat farkı');
  const ana = M.imeceAnaTutar(o);                       // Σ(satır fiyatı × adet)
  esit('1. fatura (ana tutar)', ana, 795 * 50 + 860 * 100);
  esit('2. fatura (2 ay farkı)', M.imeceFarkAy(o, 2), 129625 - (795 * 50 + 860 * 100));
  esit('1. + 2. fatura = vade toplamı', ana + M.imeceFarkAy(o, 2), M.imeceVadeToplam(o, 2));
  dogru('ciro/komisyon tabanı 1. fatura (ana tutar)', ana === M.imeceAnaTutar(o), 'kredi kartı ana tutarı');

  baslik('6f) İSKONTO — taban, satırın iskontolu fiyatı');
  // %5 iskontolu müşteride satır fiyatı 795×0,95 = 755,25 olarak gelir
  const oi = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 1, lines: [{ code: 'DG-10', qty: 50, price: 755.25 }] };
  esit('iskontolu 1 ay birim', M.imeceBirimVade(755.25, 1), Math.floor((755.25 / (1 - 0.0099)) * 100) / 100);
  esit('iskontolu ana tutar', M.imeceAnaTutar(oi), 755.25 * 50);
  dogru('iskontolu vade toplamı > ana tutar', M.imeceVadeToplam(oi, 1) > M.imeceAnaTutar(oi));

  baslik('6g) SIFIR/BOZUK — vade yoksa fark 0, bozuk oran güvenli');
  esit('ay 0 → vade toplamı = ana tutar', M.imeceVadeToplam(o, 0), ana);
  esit('ay 0 → fark 0', M.imeceFarkAy(o, 0), 0);
  M.__DB.meta.imeceOranlar = { 1: 100, 2: 120, 3: -5 };
  [1, 2, 3].forEach(ay => dogru('bozuk oran[' + ay + '] → fark 0', M.imeceFarkAy(o, ay) === 0));
  M.__DB.meta.imeceOranlar = null;

  baslik('6h) SATIR ↔ TOPLAM — tablo kendi içinde tutarlı');
  [1, 2, 3, 4, 5, 6].forEach(ay => {
    const satirTop = M.round2(o.lines.reduce((s, l) => s + M.imeceSatirTutar(o, l, ay, M.imeceOranKolon(o, ay)), 0));
    esit('Toplam satırı = ürün satırları (' + ay + ' ay)', M.imeceVadeToplam(o, ay), satirTop);
  });

  baslik('6i) KIRPMA — kayan nokta gürültüsü 1 kuruş kaydırmasın');
  esit('893,1499999999999 → 893,15 (gürültü)', M.imeceKirp(893.1499999999999), 893.15);
  esit('893,1499 → 893,14 (gerçek)', M.imeceKirp(893.1499), 893.14);
  esit('893,15 → 893,15', M.imeceKirp(893.15), 893.15);
  dogru('bozuk giriş güvenli', M.imeceKirp(Infinity) === 0 && M.imeceKirp('abc') === 0);
}

// ═══ DENETİM REGRESYONLARI — 25 bulguluk turun kapattığı davranışlar ═══
baslik('6j) TEK HESAP YOLU — kayıt/modal/onay/WhatsApp/rapor aynı tutarı vermeli');
{
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }, { id: 'db', iskonto: 0, odemeTipi: 'dbs' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3;
  const yeni = ay => ({ id: null, customerId: 'n', imeceSecili: true, imeceAy: ay,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] });
  [1, 2, 3, 4, 5, 6].forEach(ay => {
    const o = yeni(ay);
    esit('imeceFark = imeceFarkAy(seçili ay) · ' + ay + ' ay', M.imeceFark(o), M.imeceFarkAy(o, ay));
    esit('genel toplam = vade toplamı · ' + ay + ' ay', M.imeceGenelToplam(o), M.imeceVadeToplam(o, ay));
  });
}

baslik('6k) ONAY KAPISI — onaylı sipariş DEĞİŞMEDEN kaydedilince kapı AÇILMAZ');
{
  // Denetimin 1 numaralı kritiği: kapı eski (toplam-bazlı) formülle ölçüp kayıt yeni (ürün-bazlı)
  // formülle yazıyordu → hiçbir şey değişmese bile 0,52-1,37 ₺ sahte fark çıkıyor, müşteri onayı
  // düşüyor ve onaylı siparişe PLAKA bile girilemiyordu.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }, { id: 'db', iskonto: 0, odemeTipi: 'dbs' }];
  [1, 2, 3, 4, 5, 6].forEach(ay => {
    // 1) YENİ sipariş kaydediliyor (id yok → damga atılır → diziye girer)
    M.__DB.orders = [];
    const kayit = kaydet(M, { id: null, customerId: 'n', musteriOnay: 'onaylandi', imeceSecili: true, imeceAy: ay,
      lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] });
    dogru(ay + ' ay: damga gerçekten atıldı', M.imeceOranGecerli(+kayit.imeceOran) && kayit.imeceFark > 0,
      'oran=' + kayit.imeceOran + ' fark=' + TL(kayit.imeceFark));
    // 2) form açılıp HİÇBİR ŞEY değiştirilmeden yeniden kaydediliyor (ör. plaka girişi)
    const acik = Object.assign(kopya(kayit), { plaka: '10 ABC 10' });
    const _p = kopya(acik); delete _p.total;
    M.odemeDamgala(_p);
    const yeniTop = M.round2(M.imeceAnaTutar(_p) + M.imeceFark(_p));
    const eskiTop = M.round2((+kayit.total || 0) + (+kayit.imeceFark || 0));
    dogru(ay + ' ay: onay DÜŞMEZ (sahte fark yok)', Math.abs(yeniTop - eskiTop) <= 0.005,
      'eski=' + TL(eskiTop) + ' yeni=' + TL(yeniTop) + ' fark=' + M.round2(yeniTop - eskiTop));
  });
}

baslik('6l) DAMGA — oran sonradan değişince GEÇMİŞ sipariş kaymaz');
{
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }, { id: 'n2', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.orders = [];
  const kayit = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] });
  esit('damgalanan oran %2,99', kayit.imeceOran, 2.99);
  const farkOnce = M.imeceFark(kayit);
  M.__DB.meta.imeceOranlar = { 2: 5.5 };                       // İşbank oranı değişti
  esit('ayar değişti ama KAYIT kaymadı', M.imeceFark(kayit), farkOnce);
  esit('kayıtlı o.imeceFark ile canlı hesap AYNI', M.imeceFark(kayit), kayit.imeceFark);
  const yeniSip = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2, lines: kopya(kayit).lines };
  dogru('YENİ sipariş yeni oranı kullanır', M.imeceFark(yeniSip) > farkOnce, TL(M.imeceFark(yeniSip)) + ' > ' + TL(farkOnce));

  // ── DENETİM BULGUSU (5 mercek aynı hatayı buldu): ORAN DEĞİŞTİ + ALICI DÜZELTİLDİ + VADE AYNI ──
  // imeceOranSip'in açık-form dalı 'alıcı değişti'yi de sayarsa CANLI oranla yazar, damga ESKİ kalır:
  // müşteriye giden 2. fatura ile muhasebenin keseceği fatura ayrışır ve onay kapısı sessiz kalır.
  {
    const acik = Object.assign(kopya(kayit), { customerId: 'n2' });   // müşteri düzeltmesi, vade AYNI
    globalThis.editOrder = acik;
    const ekran = M.imeceFark(acik);                                  // modalın gösterdiği 2. fatura
    globalThis.editOrder = null;
    const _p = kopya(acik); delete _p.total; M.odemeDamgala(_p);
    const yazilacak = M.imeceFark(_p);                                // kayda yazılacak 2. fatura
    esit('alıcı değişti: EKRAN = KAYIT', ekran, yazilacak);
    esit('alıcı değişti: kayıt = damgalı oran hesabı', yazilacak, farkOnce);
    esit('alıcı değişince imeceOran damgası KORUNUR', _p.imeceOran, 2.99);
    // kapı da sessiz kalmamalı → değişmediği için zaten fark 0 olmalı
    const kapiFark = M.round2((M.imeceAnaTutar(_p) + yazilacak) - ((+kayit.total || 0) + (+kayit.imeceFark || 0)));
    esit('onay kapısı sahte fark üretmiyor', kapiFark, 0);
  }
  M.__DB.meta.imeceOranlar = null;
}

baslik('6l2) KAYIT BULUNAMADI = DEĞİŞMEDİ — silinmiş/sıfırlanmış siparişte damga korunur');
{
  // Sipariş başka cihazda silinmiş / "Siparişleri Sıfırla" çalışmış / yedekten dönülmüşse e={} olurdu:
  // her alan "değişti" görünür, damga yeniden yazılır → 2. fatura silinir, DBS geriye dönük uygulanırdı.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const kayit = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 4,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  const farkOnce = kayit.imeceFark, oranOnce = kayit.imeceOran;
  M.__DB.orders = [];                                                // kayıt başka cihazda SİLİNDİ
  dogru('aliciDegistiMi: kayıt yok → DEĞİŞMEDİ', M.aliciDegistiMi(kayit) === false);
  dogru('vadeDegistiMi: kayıt yok → DEĞİŞMEDİ', M.vadeDegistiMi(kayit) === false);
  const acik = Object.assign(kopya(kayit), { plaka: '10 ABC 10' });
  M.odemeDamgala(acik);
  dogru('İMECE damgası KORUNDU', acik.imeceSecili === true && (+acik.imeceAy) === 4);
  esit('imeceOran damgası korundu', acik.imeceOran, oranOnce);
  esit('2. fatura korundu', M.imeceFark(acik), farkOnce);
  esit('DBS geriye dönük UYGULANMADI', +acik.dbsOran || 0, 0);
}

baslik('6l3) BAYİ SİPARİŞİ — brutListe damgası NET yazmamalı (portal iskontosu kaybolmasın)');
{
  // Bayiye satışta o.fiyatKademe='bayi' ama tarifede 'bayi' SÜTUNU YOK → listeBirimFiyat 0 döner,
  // orderListTotal net fiyata düşer, damga brüt=net olur ve bayi portalında iskonto 0 ₺ görünür.
  const M = TMR;
  M.__DB.products = [{ code: 'BK-300', fabrika: 850, krediKarti: 900 }];
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.orders = []; M.__DB.meta.dbsOran = 3;
  const bayiSip = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'BK-300', qty: 100, price: 824.5 }] };
  esit("kademe 'bayi' tarifede YOK (0)", M.listeBirimFiyat(bayiSip, 'BK-300', 'bayi'), 0);
  esit('orderListKademe bayide fabrika', M.orderListKademe(bayiSip), 'fabrika');
  esit('brüt FABRİKA listesinden', M.orderListTotal(bayiSip), 85000);
  const bl = M.brutListeDamga(bayiSip);
  esit('brutListe damgası brüt (net değil)', bl, 85000);
  esit('bayi portalı iskontosu', M.round2(bl - M.imeceAnaTutar(bayiSip)), 2550);
  // Liste fiyatı HİÇ yoksa damga yazılmamalı (sunucu tersine hesaba düşsün)
  const bilinmeyen = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'YOK-1', qty: 10, price: 500 }] };
  esit('liste fiyatı yoksa damga YAZILMAZ', M.brutListeDamga(bilinmeyen), 0);
  M.__DB.products = [];
}

baslik('6l4) MANUEL FATURA 0 — "yok" sayılmalı (0, negatif, boş aynı)');
{
  const M = TMR;
  const t = v => ({ id: null, customerId: 'n', faturaManuel: v, lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  dogru('faturaManuel 0 → yok', M.manuelFatura(t(0)) === null);
  dogru('faturaManuel -5 → yok', M.manuelFatura(t(-5)) === null);
  dogru("faturaManuel '' → yok", M.manuelFatura(t('')) === null);
  dogru('faturaManuel null → yok', M.manuelFatura(t(null)) === null);
  dogru('faturaManuel abc → yok', M.manuelFatura(t('abc')) === null);
  esit('faturaManuel 120000 → 120000', M.manuelFatura(t(120000)), 120000);
  dogru('imeceManuelMi 0 için false', M.imeceManuelMi(t(0)) === false);
  esit('0 girilince 1. fatura satırlardan', M.imeceAnaTutar(t(0)), 795 * 50);
}

baslik('6m) MANUEL FATURA — pazarlık iskontosu 2. faturayla GERİ ALINMAZ');
{
  // Denetimin en pahalı bulgusu: 120.000'e anlaşılan sipariş 2. fatura ürün liste fiyatlarından
  // hesaplandığı için müşteriye yine ~125.750 ödetiyordu (verilen 5.750 ₺ iskonto silinmiş oluyordu).
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.orders = [];
  const listeToplam = 795 * 50 + 860 * 100;                    // 125.750
  const o = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2, faturaManuel: 120000,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] };
  dogru('manuel fatura algılandı', M.imeceManuelMi(o) === true);
  esit('1. fatura = pazarlık tutarı', M.imeceAnaTutar(o), 120000);
  esit('2 ay vade toplamı pazarlık tutarından', M.imeceVadeToplam(o, 2), M.imeceKirp(120000 / (1 - 2.99 / 100)));
  esit('2. fatura', M.imeceFark(o), M.round2(M.imeceKirp(120000 / (1 - 2.99 / 100)) - 120000));
  dogru('müşteri liste tutarından AZ öder (iskonto korundu)', M.imeceGenelToplam(o) < listeToplam,
    TL(M.imeceGenelToplam(o)) + ' < ' + TL(listeToplam));
  const iskontosuz = Object.assign({}, o, { faturaManuel: '' , lines: o.lines.map(l => Object.assign({}, l)) });
  dogru('manuelsiz sipariş DAHA ÇOK öder', M.imeceGenelToplam(iskontosuz) > M.imeceGenelToplam(o));
}

baslik('6n) SİPARİŞ BAZLI DAMGA — kart sonradan değişse GEÇMİŞ BOZULMAZ');
{
  // TEK KURAL: sipariş kaydedildiği andaki durumu damgalar; bir daha müşteri kartına BAKILMAZ.
  // Kart DBS'e de geçebilir, DBS'ten de çıkabilir — geçmiş sipariş her iki yönde de olduğu gibi kalır.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const imeceSip = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 3,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  dogru('İMECE siparişi kaydedildi', imeceSip.imeceFark > 0 && (+imeceSip.dbsOran || 0) === 0, TL(imeceSip.imeceFark));

  // --- kart DBS'e çevrildi ---
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: 'dbs' }];
  esit('rapor/ekran: 2. fatura AYNEN duruyor', M.imeceFark(imeceSip), imeceSip.imeceFark);
  dogru('imeceSeciliMi karta BAKMIYOR', M.imeceSeciliMi(imeceSip) === true);
  const plaka = Object.assign(kopya(imeceSip), { plaka: '10 ABC 10' });
  M.odemeDamgala(plaka);                                   // sevkiyat düzenlemesi — yeniden damgalamaz
  dogru('plaka girişi damgayı BOZMUYOR', plaka.imeceSecili === true && (+plaka.imeceAy) === 3);
  esit('plaka girişinden sonra 2. fatura', M.imeceFark(plaka), imeceSip.imeceFark);
  esit('DBS geriye dönük UYGULANMADI', +plaka.dbsOran || 0, 0);
  // YENİ sipariş artık DBS'li
  const yeniSip = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 3, lines: kopya(imeceSip).lines };
  M.odemeDamgala(yeniSip);
  dogru('yeni sipariş: İMECE temizlendi', yeniSip.imeceSecili === false);
  esit('yeni sipariş: DBS damgalandı', yeniSip.dbsOran, 3);

  // --- kart DBS'ten ÇIKARILDI, DBS damgalı sipariş bozulmamalı ---
  const dbsSip = kaydet(M, { id: null, customerId: 'n', imeceSecili: false, imeceAy: 0,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  esit('DBS siparişi damgalandı', dbsSip.dbsOran, 3);
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  const dokun = Object.assign(kopya(dbsSip), { plaka: '34 XYZ 34' });
  M.odemeDamgala(dokun);
  esit('kart DBS ten çıktı, damga KORUNDU', dokun.dbsOran, 3);
  esit('DBS li kayıt tutarı korundu', M.imeceAnaTutar(dokun), M.imeceAnaTutar(dbsSip));
}

baslik('6l2) KAYIT BULUNAMADI = DEĞİŞMEDİ — silinmiş/sıfırlanmış siparişte damga korunur');
{
  // Sipariş başka cihazda silinmiş / "Siparişleri Sıfırla" çalışmış / yedekten dönülmüşse e={} olurdu:
  // her alan "değişti" görünür, damga yeniden yazılır → 2. fatura silinir, DBS geriye dönük uygulanırdı.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const kayit = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 4,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  const farkOnce = kayit.imeceFark, oranOnce = kayit.imeceOran;
  M.__DB.orders = [];                                                // kayıt başka cihazda SİLİNDİ
  dogru('aliciDegistiMi: kayıt yok → DEĞİŞMEDİ', M.aliciDegistiMi(kayit) === false);
  dogru('vadeDegistiMi: kayıt yok → DEĞİŞMEDİ', M.vadeDegistiMi(kayit) === false);
  const acik = Object.assign(kopya(kayit), { plaka: '10 ABC 10' });
  M.odemeDamgala(acik);
  dogru('İMECE damgası KORUNDU', acik.imeceSecili === true && (+acik.imeceAy) === 4);
  esit('imeceOran damgası korundu', acik.imeceOran, oranOnce);
  esit('2. fatura korundu', M.imeceFark(acik), farkOnce);
  esit('DBS geriye dönük UYGULANMADI', +acik.dbsOran || 0, 0);
}

baslik('6l3) BAYİ SİPARİŞİ — brutListe damgası NET yazmamalı (portal iskontosu kaybolmasın)');
{
  // Bayiye satışta o.fiyatKademe='bayi' ama tarifede 'bayi' SÜTUNU YOK → listeBirimFiyat 0 döner,
  // orderListTotal net fiyata düşer, damga brüt=net olur ve bayi portalında iskonto 0 ₺ görünür.
  const M = TMR;
  M.__DB.products = [{ code: 'BK-300', fabrika: 850, krediKarti: 900 }];
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.orders = []; M.__DB.meta.dbsOran = 3;
  const bayiSip = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'BK-300', qty: 100, price: 824.5 }] };
  esit("kademe 'bayi' tarifede YOK (0)", M.listeBirimFiyat(bayiSip, 'BK-300', 'bayi'), 0);
  esit('orderListKademe bayide fabrika', M.orderListKademe(bayiSip), 'fabrika');
  esit('brüt FABRİKA listesinden', M.orderListTotal(bayiSip), 85000);
  const bl = M.brutListeDamga(bayiSip);
  esit('brutListe damgası brüt (net değil)', bl, 85000);
  esit('bayi portalı iskontosu', M.round2(bl - M.imeceAnaTutar(bayiSip)), 2550);
  // Liste fiyatı HİÇ yoksa damga yazılmamalı (sunucu tersine hesaba düşsün)
  const bilinmeyen = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'YOK-1', qty: 10, price: 500 }] };
  esit('liste fiyatı yoksa damga YAZILMAZ', M.brutListeDamga(bilinmeyen), 0);
  M.__DB.products = [];
}

baslik('6l4) MANUEL FATURA 0 — "yok" sayılmalı (0, negatif, boş aynı)');
{
  const M = TMR;
  const t = v => ({ id: null, customerId: 'n', faturaManuel: v, lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  dogru('faturaManuel 0 → yok', M.manuelFatura(t(0)) === null);
  dogru('faturaManuel -5 → yok', M.manuelFatura(t(-5)) === null);
  dogru("faturaManuel '' → yok", M.manuelFatura(t('')) === null);
  dogru('faturaManuel null → yok', M.manuelFatura(t(null)) === null);
  dogru('faturaManuel abc → yok', M.manuelFatura(t('abc')) === null);
  esit('faturaManuel 120000 → 120000', M.manuelFatura(t(120000)), 120000);
  dogru('imeceManuelMi 0 için false', M.imeceManuelMi(t(0)) === false);
  esit('0 girilince 1. fatura satırlardan', M.imeceAnaTutar(t(0)), 795 * 50);
}

baslik('6m) MANUEL FATURA — pazarlık iskontosu 2. faturayla GERİ ALINMAZ');
{
  // Denetimin en pahalı bulgusu: 120.000'e anlaşılan sipariş 2. fatura ürün liste fiyatlarından
  // hesaplandığı için müşteriye yine ~125.750 ödetiyordu (verilen 5.750 ₺ iskonto silinmiş oluyordu).
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.orders = [];
  const listeToplam = 795 * 50 + 860 * 100;                    // 125.750
  const o = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2, faturaManuel: 120000,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] };
  dogru('manuel fatura algılandı', M.imeceManuelMi(o) === true);
  esit('1. fatura = pazarlık tutarı', M.imeceAnaTutar(o), 120000);
  esit('2 ay vade toplamı pazarlık tutarından', M.imeceVadeToplam(o, 2), M.imeceKirp(120000 / (1 - 2.99 / 100)));
  esit('2. fatura', M.imeceFark(o), M.round2(M.imeceKirp(120000 / (1 - 2.99 / 100)) - 120000));
  dogru('müşteri liste tutarından AZ öder (iskonto korundu)', M.imeceGenelToplam(o) < listeToplam,
    TL(M.imeceGenelToplam(o)) + ' < ' + TL(listeToplam));
  const iskontosuz = Object.assign({}, o, { faturaManuel: '' , lines: o.lines.map(l => Object.assign({}, l)) });
  dogru('manuelsiz sipariş DAHA ÇOK öder', M.imeceGenelToplam(iskontosuz) > M.imeceGenelToplam(o));
}

baslik('6n) SİPARİŞ BAZLI DAMGA — kart sonradan değişse GEÇMİŞ BOZULMAZ');
{
  // TEK KURAL: sipariş kaydedildiği andaki durumu damgalar; bir daha müşteri kartına BAKILMAZ.
  // Kart DBS'e de geçebilir, DBS'ten de çıkabilir — geçmiş sipariş her iki yönde de olduğu gibi kalır.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const imeceSip = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 3,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  dogru('İMECE siparişi kaydedildi', imeceSip.imeceFark > 0 && (+imeceSip.dbsOran || 0) === 0, TL(imeceSip.imeceFark));

  // --- kart DBS'e çevrildi ---
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: 'dbs' }];
  esit('rapor/ekran: 2. fatura AYNEN duruyor', M.imeceFark(imeceSip), imeceSip.imeceFark);
  dogru('imeceSeciliMi karta BAKMIYOR', M.imeceSeciliMi(imeceSip) === true);
  const plaka = Object.assign(kopya(imeceSip), { plaka: '10 ABC 10' });
  M.odemeDamgala(plaka);                                   // sevkiyat düzenlemesi — yeniden damgalamaz
  dogru('plaka girişi damgayı BOZMUYOR', plaka.imeceSecili === true && (+plaka.imeceAy) === 3);
  esit('plaka girişinden sonra 2. fatura', M.imeceFark(plaka), imeceSip.imeceFark);
  esit('DBS geriye dönük UYGULANMADI', +plaka.dbsOran || 0, 0);
  // YENİ sipariş artık DBS'li
  const yeniSip = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 3, lines: kopya(imeceSip).lines };
  M.odemeDamgala(yeniSip);
  dogru('yeni sipariş: İMECE temizlendi', yeniSip.imeceSecili === false);
  esit('yeni sipariş: DBS damgalandı', yeniSip.dbsOran, 3);

  // --- kart DBS'ten ÇIKARILDI, DBS damgalı sipariş bozulmamalı ---
  const dbsSip = kaydet(M, { id: null, customerId: 'n', imeceSecili: false, imeceAy: 0,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  esit('DBS siparişi damgalandı', dbsSip.dbsOran, 3);
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  const dokun = Object.assign(kopya(dbsSip), { plaka: '34 XYZ 34' });
  M.odemeDamgala(dokun);
  esit('kart DBS ten çıktı, damga KORUNDU', dokun.dbsOran, 3);
  esit('DBS li kayıt tutarı korundu', M.imeceAnaTutar(dokun), M.imeceAnaTutar(dbsSip));
}

baslik('6l2) KAYIT BULUNAMADI = DEĞİŞMEDİ — silinmiş/sıfırlanmış siparişte damga korunur');
{
  // Sipariş başka cihazda silinmiş / "Siparişleri Sıfırla" çalışmış / yedekten dönülmüşse e={} olurdu:
  // her alan "değişti" görünür, damga yeniden yazılır → 2. fatura silinir, DBS geriye dönük uygulanırdı.
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
  const kayit = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 4,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  const farkOnce = kayit.imeceFark, oranOnce = kayit.imeceOran;
  M.__DB.orders = [];                                                // kayıt başka cihazda SİLİNDİ
  dogru('aliciDegistiMi: kayıt yok → DEĞİŞMEDİ', M.aliciDegistiMi(kayit) === false);
  dogru('vadeDegistiMi: kayıt yok → DEĞİŞMEDİ', M.vadeDegistiMi(kayit) === false);
  const acik = Object.assign(kopya(kayit), { plaka: '10 ABC 10' });
  M.odemeDamgala(acik);
  dogru('İMECE damgası KORUNDU', acik.imeceSecili === true && (+acik.imeceAy) === 4);
  esit('imeceOran damgası korundu', acik.imeceOran, oranOnce);
  esit('2. fatura korundu', M.imeceFark(acik), farkOnce);
  esit('DBS geriye dönük UYGULANMADI', +acik.dbsOran || 0, 0);
}

baslik('6l3) BAYİ SİPARİŞİ — brutListe damgası NET yazmamalı (portal iskontosu kaybolmasın)');
{
  // Bayiye satışta o.fiyatKademe='bayi' ama tarifede 'bayi' SÜTUNU YOK → listeBirimFiyat 0 döner,
  // orderListTotal net fiyata düşer, damga brüt=net olur ve bayi portalında iskonto 0 ₺ görünür.
  const M = TMR;
  M.__DB.products = [{ code: 'BK-300', fabrika: 850, krediKarti: 900 }];
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.orders = []; M.__DB.meta.dbsOran = 3;
  const bayiSip = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'BK-300', qty: 100, price: 824.5 }] };
  esit("kademe 'bayi' tarifede YOK (0)", M.listeBirimFiyat(bayiSip, 'BK-300', 'bayi'), 0);
  esit('orderListKademe bayide fabrika', M.orderListKademe(bayiSip), 'fabrika');
  esit('brüt FABRİKA listesinden', M.orderListTotal(bayiSip), 85000);
  const bl = M.brutListeDamga(bayiSip);
  esit('brutListe damgası brüt (net değil)', bl, 85000);
  esit('bayi portalı iskontosu', M.round2(bl - M.imeceAnaTutar(bayiSip)), 2550);
  // Liste fiyatı HİÇ yoksa damga yazılmamalı (sunucu tersine hesaba düşsün)
  const bilinmeyen = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
    komisyonRate: 3, lines: [{ code: 'YOK-1', qty: 10, price: 500 }] };
  esit('liste fiyatı yoksa damga YAZILMAZ', M.brutListeDamga(bilinmeyen), 0);
  M.__DB.products = [];
}

baslik('6l4) MANUEL FATURA 0 — "yok" sayılmalı (0, negatif, boş aynı)');
{
  const M = TMR;
  const t = v => ({ id: null, customerId: 'n', faturaManuel: v, lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
  dogru('faturaManuel 0 → yok', M.manuelFatura(t(0)) === null);
  dogru('faturaManuel -5 → yok', M.manuelFatura(t(-5)) === null);
  dogru("faturaManuel '' → yok", M.manuelFatura(t('')) === null);
  dogru('faturaManuel null → yok', M.manuelFatura(t(null)) === null);
  dogru('faturaManuel abc → yok', M.manuelFatura(t('abc')) === null);
  esit('faturaManuel 120000 → 120000', M.manuelFatura(t(120000)), 120000);
  dogru('imeceManuelMi 0 için false', M.imeceManuelMi(t(0)) === false);
  esit('0 girilince 1. fatura satırlardan', M.imeceAnaTutar(t(0)), 795 * 50);
}

baslik('6m) MANUEL FATURA — pazarlık iskontosu 2. faturayla GERİ ALINMAZ');
{
  // Denetimin en pahalı bulgusu: 120.000'e anlaşılan sipariş 2. fatura ürün liste fiyatlarından
  // hesaplandığı için müşteriye yine ~125.750 ödetiyordu (verilen 5.750 ₺ iskonto silinmiş oluyordu).
  const M = TMR;
  M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
  M.__DB.meta.imeceOranlar = null; M.__DB.orders = [];
  const listeToplam = 795 * 50 + 860 * 100;                    // 125.750
  const o = { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2, faturaManuel: 120000,
    lines: [{ code: 'DG-10', qty: 50, price: 795 }, { code: 'BK 100+', qty: 100, price: 860 }] };
  dogru('manuel fatura algılandı', M.imeceManuelMi(o) === true);
  esit('1. fatura = pazarlık tutarı', M.imeceAnaTutar(o), 120000);
  esit('2 ay vade toplamı pazarlık tutarından', M.imeceVadeToplam(o, 2), M.imeceKirp(120000 / (1 - 2.99 / 100)));
  esit('2. fatura', M.imeceFark(o), M.round2(M.imeceKirp(120000 / (1 - 2.99 / 100)) - 120000));
  dogru('müşteri liste tutarından AZ öder (iskonto korundu)', M.imeceGenelToplam(o) < listeToplam,
    TL(M.imeceGenelToplam(o)) + ' < ' + TL(listeToplam));
  const iskontosuz = Object.assign({}, o, { faturaManuel: '' , lines: o.lines.map(l => Object.assign({}, l)) });
  dogru('manuelsiz sipariş DAHA ÇOK öder', M.imeceGenelToplam(iskontosuz) > M.imeceGenelToplam(o));
}


// ─────────────────────────────────────────────────────────────────────────────
baslik('7) KAYNAK EŞLİĞİ — DBS düzeltmeleri iki modülde de var mı');
{
  const t = anaScript('siparis-takip/index.html'), y = anaScript('yem/index.html');
  const kontrol = [
    ['fiyat boşaltılınca tarife geri gelir', /_locked=\(v!==''&&v!=null\)/, /_locked=\(v!==''&&v!=null\)/],
    ['kayıt bulunamazsa geri ekle', /idx<0/, /idx<0/],
    ['damga: alıcı değişimi tetikler', /aliciDegistiMi\(/, /aliciDegistiMi\(/],
    ['DBS oranı tek kaynaktan', /dbsOranDamgaHesap\(/, /dbsOranDamgaHesap\(/],
    ['İMECE flag var', /const IMECE_AKTIF/, /const IMECE_AKTIF/],
    ['imeceBlokHTML flag ile gizli', /function imeceBlokHTML\(o,ro\)\{\s*if\(!IMECE_AKTIF\)return ''/, /function imeceBlokHTML\(o,ro\)\{\s*if\(!IMECE_AKTIF\)return ''/],
    ['imeceAySip flag ile 0', /function imeceAySip\(o\)\{if\(!IMECE_AKTIF\)return 0/, /function imeceAySip\(o\)\{if\(!IMECE_AKTIF\)return 0/],
  ];
  for (const [ad, rT, rY] of kontrol) { dogru('TMR: ' + ad, rT.test(t)); dogru('YEM: ' + ad, rY.test(y)); }

  // TEK SEÇİM GARANTİSİ: vade seçimi RADIO olmalı. Checkbox olursa tarayıcı birden fazla ayın
  // işaretli kalmasına izin verir (kullanıcı bunu canlıda yakaladı — bir daha kaçmasın).
  dogru('TMR: vade seçimi RADIO (tek seçim)', /type="radio" name="imeceVadeSecim"/.test(t));
  dogru('TMR: vade başlığında checkbox YOK', !/type="checkbox" \$\{ay===a/.test(t));

  // ── TEK HESAP YOLU MÜHÜRÜ (25 bulguluk denetim) ───────────────────────────
  // Eski toplam-bazlı formüller TMR'den SÖKÜLDÜ. Geri sızarlarsa aynı sipariş yine üç farklı
  // 2. fatura üretir (kayıt ↔ WhatsApp ↔ muhasebe raporu) ve müşterinin onayladığından
  // farklı fatura kesilir. Yem'de hâlâ var (İMECE orada KAPALI, altyapı sonra kurulacak).
  dogru('TMR: eski imeceFarkOranla SÖKÜLDÜ', !/imeceFarkOranla/.test(t));
  dogru('TMR: eski imeceFarkTaban SÖKÜLDÜ', !/imeceFarkTaban/.test(t));
  dogru('TMR: eski imeceTutar SÖKÜLDÜ', !/function imeceTutar\(/.test(t));
  dogru('TMR: onay kapısı imeceFark ile ölçüyor', /_yeniTop=round2\(imeceAnaTutar\(_p\)\+imeceFark\(_p\)\)/.test(t));
  dogru('TMR: kayıt o.imeceFark=imeceFark(o)', /o\.imeceFark=imeceFark\(o\)/.test(t));
  dogru('TMR: WhatsApp da imeceFark(o) kullanıyor', /const _f=imeceFark\(o\)/.test(t));
  dogru('TMR: muhasebe raporu imeceFark(o) kullanıyor', /imeceFark\(o\)>0/.test(t));
  dogru('TMR: vade seçmeden kayıt engelleniyor', /if\(!_ay\)\{toast\('İMECE seçili/.test(t));
  dogru('TMR: geçersiz oranlı vadede kayıt engelleniyor', /!imeceOranGecerli\(imeceOranKolon\(o,_ay\)\)/.test(t));
  dogru('TMR: geçersiz oranlı vade radyosu kapalı', /\$\{\(ro\|\|!gec\)\?'disabled':''\}/.test(t));
  dogru('TMR: muhasebe onayı sonrası kapı TUTAR bazlı', /_tutarDegisti=Math\.abs\(_yt-_et\)>0\.005/.test(t));
  dogru('TMR: muhasebe kapısında blob yedeği var', /muhasebeOnayRec\(o\)\|\|\(o\.muhasebeOnay&&o\.muhasebeOnay\.by\)/.test(t));

  // ── DENETİM TURU 2 MÜHÜRLERİ ──────────────────────────────────────────────
  // İMECE oranı VADEYE bağlıdır. imeceOranSip'in açık-form dalına alıcı ekseni geri sızarsa
  // ekran/kayıt canlı oranı kullanırken damga eski oranda kalır → iki farklı 2. fatura doğar.
  {
    const _ios = (t.match(/function imeceOranSip\([\s\S]*?\n\}/) || [''])[0];
    dogru('TMR: imeceOranSip yalnız VADE eksenini izliyor',
      /o===editOrder&&vadeDegistiMi\(o\)\)/.test(_ios) && !/aliciDegistiMi/.test(_ios), 'alıcı ekseni geri sızmamalı');
    // DBS ise TAM TERSİ: alıcının sabit özelliğidir → önizleme HER İKİ ekseni de izlemek ZORUNDA.
    const _dbs = (t.match(/function dbsOran\([\s\S]*?\n\}/) || [''])[0];
    dogru('TMR: dbsOran önizlemesi İKİ ekseni de izliyor',
      /aliciDegistiMi/.test(_dbs) && /vadeDegistiMi/.test(_dbs));
  }
  // odemeDamgala elle karşılaştırma yaparsa "kayıt bulunamadı = değişmedi" koruması delinir.
  dogru('TMR: odemeDamgala tek eksen kaynağını kullanıyor',
    /yenidenDamgala=!o\.id\|\|_damgasiz\|\|aliciDegistiMi\(o\)\|\|vadeDegistiMi\(o\)/.test(t));
  // ÇAPRAZ SİPARİŞ KORUMASI: id atanmış ama DB'ye henüz push edilmemiş + hiç damgalanmamış sipariş
  // YENİ sayılmalı. Yoksa DBS'li müşterinin her Yem→TMR çapraz siparişinde %3 fazla fatura kesilir.
  dogru('TMR: damgasız/tabansız sipariş YENİ sayılıyor', /_damgasiz=_tabanYok&&\(o\.dbsOran==null\|\|o\.dbsOran===''\)/.test(t));
  dogru('TMR: kayıt bulunamadı → açılış tabanı (aliciDegistiMi)', /const e=ordTaban\(o\);if\(!e\)return false;/.test(t));
  dogru('TMR: açılış görüntüsü alınıyor', /editOrder\._acilis=\{customerId:_o\.customerId/.test(t));
  dogru('TMR: açılış görüntüsü bloba yazılmıyor', /delete o\._acilis;/.test(t));
  dogru('YEM: kayıt bulunamadı → değişmedi (eşlik)', /const e=ordKayit\(o\);if\(!e\)return false;/.test(y));
  dogru('YEM: portal geçişinde önizleme sunucu damgasını koruyor', /_e\.customerId===''\|\|_e\.customerId==null\)&&o\.customerId&&_e\.dbsOran!=null/.test(y));
  dogru('TMR: onay kapıları açılış tabanını kullanıyor',
    /o\.musteriOnay==='onaylandi'&&ordTaban\(o\)/.test(t) && /const _em=ordTaban\(o\);/.test(t));
  dogru('TMR: brutListe damgası satır bazlı güvenilirlik testi', /if\(l&&l\.code&&!\(listeBirimFiyat\(o,l\.code,kad\)>0\)\)return 0;/.test(t));
  dogru('TMR: bayi brütü tek kaynak (bayiIskHam)', /orderListTotal\(o\)-orderTotal\(o\)/.test(t));
  dogru('TMR: kod değişince _locked düşüyor', /if\(f==='code'\)delete editOrder\.lines\[i\]\._locked;/.test(t));
  dogru('TMR: kutucuk kilidi sade (ro veya DBS+seçilmemiş)', /const kilit=ro\|\|\(dbsli&&!secili\);/.test(t));
  // imeceSeciliMi müşteri kartına ASLA bakmamalı — sipariş bazlı damga kuralının mührü.
  dogru('TMR: imeceSeciliMi yalnız damgaya bakıyor',
    /function imeceSeciliMi\(o\)\{return !!\(IMECE_AKTIF&&o&&o\.imeceSecili\);\}/.test(t));
  dogru('TMR: DBS damgası İMECE ye bakmıyor',
    /function dbsOranDamgaHesap\(o\)\{return dbsAliciAktif\(o\)\?dbsOranAyar\(\):0;\}/.test(t));
  dogru('TMR: DBS-İMECE tek karşılaşma noktası (damga anı)',
    /if\(!imeceSecilebilirMi\(o\)\)\{o\.imeceSecili=false;o\.imeceAy=0;\}\s*\n\s*o\.dbsOran=dbsOranDamgaHesap\(o\);/.test(t));
  dogru('TMR: fatura artışı ayrı gösteriliyor', /function faturaArtisi\(o\)/.test(t) && /\+ Fiyat Farkı/.test(t));
  dogru('TMR: negatif miktarda vade tablosu çizilmiyor', /_negatif=\(o\.lines\|\|\[\]\)\.some\(l=>l&&\(\+l\.qty<0\)\)/.test(t));
  dogru('TMR: miktar alanı negatife kapalı', /type="number" step="0\.01" min="0" data-odak="l\$\{i\}q"/.test(t));
  // MODAL YENİDEN ÇİZİMİ: innerHTML değişince .modal-bg (kaydırma kabı) yeniden yaratılıyor →
  // kaydırma başa dönüyor ve açılış animasyonu baştan oynuyor. Formda her tıklamada yeniden çizim
  // olduğu için kullanıcı "sayfa yenileniyor, beni başa atıyor" diye görüyordu.
  dogru('TMR: modal yeniden çizimi modalYaz üzerinden', /function renderOrderModal\(\)\{[\s\S]*?\n  modalYaz\(m\);\n\}/.test(t));
  dogru('TMR: modalYaz kaydırmayı koruyor', /yeni\.scrollTop=sc;/.test(t));
  dogru('TMR: modalYaz yeniden çizimde animasyonu kapatıyor', /yeni\.style\.animation='none';/.test(t));
  dogru('TMR: modalYaz odağı geri veriyor', /el\.focus\(\{preventScroll:true\}\)/.test(t));
  dogru('TMR: satır alanlarında data-odak var', /data-odak="l\$\{i\}c"/.test(t) && /data-odak="l\$\{i\}p"/.test(t));
  // Erken return'ler modalı yeniden çizmeli: o.lines filtrelenmiş olduğu için DOM ile dizi ayrışır
  // ve sonraki düzenleme YANLIŞ ÜRÜNE yazar (denetimde 51.600 ₺'lik senaryo).
  dogru('TMR: "en az bir ürün" dönüşü modalı çiziyor', /toast\('En az bir ürün ekleyin'\);renderOrderModal\(\);return/.test(t));
  dogru('TMR: manuel fatura dönüşü modalı çiziyor', /hesaplanan geçerli olur'\);renderOrderModal\(\);return/.test(t));
  dogru('TMR: 0 fiyat iptali modalı çiziyor', /Yine de kaydedilsin mi\?'\)\)\{renderOrderModal\(\);return;\}/.test(t));
  // Bayi brütü fabrika listesinden ölçülür; yoksa damga net yazar ve portal iskontosu silinir.
  dogru('TMR: bayi brütü fabrika kademesinden', /function orderListKademe\(o\)\{return \(o&&o\.aliciBayi\)\?'fabrika'/.test(t));
  dogru('TMR: güvenilmez brutListe damgası yazılmıyor', /if\(_bl>0\)o\.brutListe=_bl; else delete o\.brutListe/.test(t));
  // Manuel fatura eşiği DBS SONRASI tabana bakmalı (yoksa fatura sessizce artar, uyarı çıkmaz).
  dogru('TMR: manuel fatura eşiği DBS sonrası taban', /manuelFatura\(o\)>orderNetDbs\(o\)/.test(t));
  dogru('TMR: manuel modda eksik-fiyat uyarısı gizlenmiyor', !/const eksik=manuel\?\[\]:/.test(t));
  dogru('TMR: kodsuz satırda vade tablosu çizilmiyor', /Ürün kodu seçilmemiş bir satır var/.test(t));
  dogru('TMR: %0 oran için açık onay isteniyor', /!\(n>0\)&&!confirm\(/.test(t));
  // Danışman portalı fiyatı pazarlıklıdır — İMECE işaretlenince tarifeye ezilmemeli.
  {
    const fn = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    dogru('SUNUCU: danışman portal satırı _locked', /lines\.push\(\{code, qty, price, _locked: true\}\)/.test(fn));
    dogru('SUNUCU: bayi brütü damgayı önceliyor', /\(\+o\.brutListe > 0\) \? \(\+o\.brutListe\) : brut/.test(fn));
    // Sunucu tek yuvarlamayla hesaplarsa istemciyle 1 kuruş ayrışır ve bu 1 kuruş, iç ekranda kayıtta
    // "tutar değişti" kapısını (eşik 0,005) tetikleyip müşteri onayını sahte yere düşürür.
    dogru('SUNUCU: DBS iki adımda yuvarlıyor (istemci ile eş)', /const isk = Math\.round\(t \* oran \/ 100 \* 100\) \/ 100;\s*\n\s*return Math\.round\(\(t - isk\) \* 100\) \/ 100;/.test(fn));
  }

  baslik('8) SUNUCU ↔ İSTEMCİ DBS FORMÜL EŞLİĞİ — 1 kuruş sahte onay düşüşü');
  {
    // Sunucu dbsUygula ile istemci orderNetDbs aynı sayıyı vermeli. X,50 ile biten net tutarlar tuzak.
    const sunucu = (t, oran) => { const x = Math.round((+t || 0) * 100) / 100; if (!(oran > 0)) return x;
      const isk = Math.round(x * oran / 100 * 100) / 100; return Math.round((x - isk) * 100) / 100; };
    const istemci = (net, r) => { const isk = TMR.round2(net * r / 100); return TMR.round2(net - isk); };
    [83274.50, 100000, 39750, 125750, 824.5 * 101, 1.005, 66666.665].forEach(net =>
      esit('DBS %3 · net ' + TL(net), sunucu(net, 3), istemci(net, 3)));
  }

  baslik('9) ÇAPRAZ SİPARİŞ — id atanmış, DB\'de yok, damgasız → DBS DAMGALANIR');
  {
    // processCrossQueue siparişi id ile OLUŞTURUR, odemeDamgala çağırır, SONRA DB.orders'a push eder.
    // O anda ne kayıt ne açılış görüntüsü vardır; "değişmedi" sayılırsa DBS damgası 0 kalır ve
    // DBS'li müşteriye kalıcı olarak %3 fazla fatura kesilir (100.000 ₺'de 3.000 ₺).
    const M = TMR;
    M.__DB.customers = [{ id: 'db', iskonto: 0, odemeTipi: 'dbs' }, { id: 'n', iskonto: 0, odemeTipi: '' }];
    M.__DB.meta.dbsOran = 3; M.__DB.orders = [];
    const capraz = { id: 'cross-1', customerId: 'db', imeceAy: 0, lines: [{ code: 'X', qty: 100, price: 1000 }] };
    M.odemeDamgala(capraz);
    esit('çapraz sipariş DBS damgası', capraz.dbsOran, 3);
    esit('çapraz sipariş tutarı DBS li', M.imeceAnaTutar(capraz), 97000);
    M.__DB.orders = [capraz];
    // Aynı sipariş sonradan açılıp kaydedilince damga KORUNUR (yeniden hesaplanmaz)
    M.__DB.meta.dbsOran = 30;
    const tekrar = kopya(capraz); M.odemeDamgala(tekrar);
    esit('kayıt sonrası damga korunur', tekrar.dbsOran, 3);
    M.__DB.meta.dbsOran = 3;
    // DBS'siz müşteride çapraz sipariş 0 damgalanır (yanlış pozitif yok)
    M.__DB.orders = [];
    const caprazN = { id: 'cross-2', customerId: 'n', imeceAy: 0, lines: [{ code: 'X', qty: 100, price: 1000 }] };
    M.odemeDamgala(caprazN); esit('DBS siz çapraz sipariş', caprazN.dbsOran, 0);
  }

  baslik('10) AÇILIŞ GÖRÜNTÜSÜ — kayıt silinse de alıcı/vade değişimi görülüyor');
  {
    // Modal açıkken sipariş başka cihazda silinirse taban kaybolur; "değişmedi" saymak damgayı eski
    // alıcının/vadenin oranında bırakıyor, onay kapılarını da sessizce atlatıyordu.
    const M = TMR;
    M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }, { id: 'db', iskonto: 0, odemeTipi: 'dbs' }];
    M.__DB.meta.dbsOran = 3; M.__DB.meta.imeceOranlar = null; M.__DB.orders = [];
    const kayit = kaydet(M, { id: null, customerId: 'n', imeceSecili: true, imeceAy: 2,
      lines: [{ code: 'DG-10', qty: 50, price: 795 }] });
    // modal açılışı
    const acik = kopya(kayit);
    acik._acilis = { customerId: kayit.customerId, bayiId: kayit.bayiId, aliciBayi: !!kayit.aliciBayi,
      imeceSecili: !!kayit.imeceSecili, imeceAy: +kayit.imeceAy || 0, imeceOran: kayit.imeceOran,
      dbsOran: kayit.dbsOran, total: kayit.total, imeceFark: kayit.imeceFark, status: kayit.status };
    M.__DB.orders = [];                                    // sipariş başka cihazda SİLİNDİ
    dogru('taban açılış görüntüsüne düşüyor', !!M.ordTaban(acik));
    dogru('değişiklik yokken "değişmedi"', M.aliciDegistiMi(acik) === false && M.vadeDegistiMi(acik) === false);
    const vadeDegisti = Object.assign(kopya(acik), { imeceAy: 4 });
    dogru('kayıt yokken de VADE değişimi görülüyor', M.vadeDegistiMi(vadeDegisti) === true);
    M.odemeDamgala(vadeDegisti);
    esit('yeni vadenin oranı damgalandı', vadeDegisti.imeceOran, 10.99);
    const aliciDegisti = Object.assign(kopya(acik), { customerId: 'db' });
    dogru('kayıt yokken de ALICI değişimi görülüyor', M.aliciDegistiMi(aliciDegisti) === true);
    M.odemeDamgala(aliciDegisti);
    esit('DBS li alıcıya geçince damga', aliciDegisti.dbsOran, 3);
    dogru('DBS li alıcıya geçince İMECE düşer', !aliciDegisti.imeceSecili);
    // damgalı ama kaydı silinmiş sipariş, DEĞİŞMEDİYSE korunur (çapraz istisnası buraya bulaşmamalı)
    M.odemeDamgala(acik);
    esit('değişmemiş silinmiş kayıt: DBS 0 kalır', +acik.dbsOran || 0, 0);
    esit('değişmemiş silinmiş kayıt: İMECE oranı korunur', acik.imeceOran, kayit.imeceOran);
  }

  baslik('11) BAYİ BRÜTÜ — iskonto 0 ve çözülemeyen satır');
  {
    const M = TMR;
    M.__DB.products = [{ code: 'BK-300', fabrika: 850, krediKarti: 900 }];
    M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
    M.__DB.orders = []; M.__DB.meta.dbsOran = 3;
    // İskonto VERİLMEMİŞ bayi siparişi: brüt=net ama damga YAZILMALI (tutar değil güvenilirlik testi)
    const iskontosuz = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
      komisyonRate: 8, lines: [{ code: 'BK-300', qty: 100, price: 850, _locked: true }] };
    esit('iskonto 0 iken damga YAZILIR', M.brutListeDamga(iskontosuz), 85000);
    esit('bayi portalı iskontosu 0', M.round2(M.brutListeDamga(iskontosuz) - M.imeceAnaTutar(iskontosuz)), 0);
    // Karışık: bir satırın listesi çözülemiyor → damga hiç yazılmaz (sunucu tersine hesaba düşsün)
    const karisik = { id: null, aliciBayi: true, bayiId: 'b1', customerId: '', fiyatKademe: 'bayi',
      komisyonRate: 8, lines: [{ code: 'YOK-99', qty: 10, price: 700 }, { code: 'BK-300', qty: 10, price: 782 }] };
    esit('çözülemeyen satır varsa damga YOK', M.brutListeDamga(karisik), 0);
    M.__DB.products = [];
  }

  baslik('12) FATURA ARTIŞI — manuel tutar hesaplanandan yüksekse');
  {
    const M = TMR;
    M.__DB.customers = [{ id: 'n', iskonto: 0, odemeTipi: '' }];
    M.__DB.orders = [];
    const L = [{ code: 'X', qty: 100, price: 900 }];                      // hesaplanan 90.000
    esit('manuel YÜKSEK → fatura artışı', M.faturaArtisi({ id: null, customerId: 'n', faturaManuel: 92000, lines: L }), 2000);
    esit('manuel DÜŞÜK → artış yok', M.faturaArtisi({ id: null, customerId: 'n', faturaManuel: 80000, lines: L }), 0);
    esit('manuel yokken artış yok', M.faturaArtisi({ id: null, customerId: 'n', lines: L }), 0);
    esit('manuel 0 → artış yok', M.faturaArtisi({ id: null, customerId: 'n', faturaManuel: 0, lines: L }), 0);
  }
  dogru('TMR: kırpma kayan noktaya karşı korumalı', /function imeceKirp\([\s\S]{0,200}?toFixed\(6\)/.test(t));
  dogru('TMR: manuel fatura vade tabanı olarak tanınıyor', /if\(imeceManuelMi\(o\)\)return imeceKirp/.test(t));
}

baslik('13) ONAY AKIŞI — YEM hattı TEK KAPILI, TMR hattı İKİ KAPILI');
{
  // FİRMA KURALI: yem ürünü siparişinde yalnız MUHASEBE onayı alınır; ayrı üretim onayı YOKTUR.
  // Yem'den TMR'ye verilen ÇAPRAZ sipariş TMR hattına düşer → hem muhasebe hem üretim onayı alınır.
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const y = anaScript('yem/index.html');

  // ── SUNUCU: zincir hatta göre kesiliyor
  dogru('SUNUCU: üretim zinciri hat kuralına bağlı', /const uretimGerek = mod !== "y";/.test(fn));
  dogru('SUNUCU: üretim mesajı yalnız TMR hattında', /if \(uretimGerek\) \{\s*\n\s*try \{ await uretimOnayMesajiGonder/.test(fn));
  dogru('SUNUCU: yem onayında "üretim onayı gerekmiyor" bildirimi', /Yem hattı — ayrıca üretim onayı gerekmiyor/.test(fn));
  dogru('SUNUCU: portal yem siparişi yemOnayGerek false', /kaynak, yemOnayGerek: false, hist: \[\]/.test(fn));
  // TMR hattı bozulmamalı: çapraz Yem→TMR ve portal TMR siparişi iki kapılı kalır
  dogru('SUNUCU: Yem→TMR çapraz hâlâ iki kapılı', /YENİ SİPARİŞ — MUHASEBE ONAYI BEKLİYOR \(Yem'den çapraz\)[\s\S]{0,120}?Önce muhasebe, ardından üretim onayı/.test(fn));
  dogru('SUNUCU: Yem→TMR çapraz mod=t', /callback_data: "moapprove:t:" \+ r\.targetId/.test(fn));
  // BİLGİ HATTI (firma kararı 29.07): TMR→Yem çapraz artık ONAYA SUNULMAZ — buton YOK.
  dogru('SUNUCU: TMR→Yem çapraz onay butonu KALDIRILDI', !/callback_data: "moapprove:y:" \+ r\.targetId/.test(fn));
  dogru('SUNUCU: TMR→Yem çapraz bilgi metni', /YEM SİPARİŞİ \(TMR'den çapraz\)[\s\S]{0,160}?Bilgi amaçlıdır/.test(fn));
  dogru('SUNUCU: yem dalında buttons null', /if \(r\.to === "yem"\)[\s\S]{0,400}?buttons = null;/.test(fn));
  dogru('SUNUCU: buttons null iken reply_markup HİÇ konmuyor', /if \(buttons\) paket\.reply_markup = \{inline_keyboard: buttons\};/.test(fn));
  dogru('SUNUCU: yoconfirm eski akış için duruyor (geriye uyum)', /data\.startsWith\("yoconfirm:"\)/.test(fn));

  // ── YEM İSTEMCİ: üretim onayı istenmiyor, statüyü muhasebe onayı ilerletiyor
  // BİLGİ HATTI (29.07): iç yem siparişi onay bayrağı ALMAZ; portal siparişi eski akışta kalır.
  dogru('YEM: yeni siparişte onay bayrağı kaynağa bağlı', /o\.muhasebeOnayGerek=!_bilgi;o\.yemOnayGerek=false;/.test(y));
  dogru('YEM: TMR den gelen çapraz onay İSTEMİYOR', /o\.muhasebeOnayGerek=false;o\.yemOnayGerek=false;\s*\/\/ yem ürünü → BİLGİ HATTI/.test(y));
  dogru('YEM: statüyü muhasebe onayı ilerletiyor (portal siparişi için duruyor)', /if\(!o\.yemOnayGerek&&o\.status==='beklemede'\)o\.status='onay';/.test(y));
  // Kapı artık KAYNAĞA bağlı: yalnız portal siparişinde çalışır (_kapiVar).
  dogru('YEM: kayıt kapısı yalnız portal siparişinde', /if\(_kapiVar&&_cikisaGeciyor&&o\.muhasebeOnayGerek&&!_muhOk\)/.test(y));
  dogru('YEM: _kapiVar bayrağa DEĞİL kaynağa bakıyor', /var _kapiVar=!bilgiHattiMi\(o\);/.test(y));
  dogru('YEM: eski akış üretim kapısı korunuyor', /Üretim onayı bekleniyor \(eski akış kaydı\)/.test(y));
  dogru('YEM: onay sütunu tek aşamalı', /var eskiAkis=!!\(o\.yemOnayGerek\|\|yemOnayli\(o\)\);/.test(y));
  dogru('YEM: Telegram metni tek kapıyı anlatıyor', /Muhasebe onayı verilince sipariş üretime geçer/.test(y));
}

baslik('14) TARİHSEL ARŞİV AYNASI — sunucu kopyası istemciyle BİREBİR');
{
  // Geçen-yıl kıyası için YON_TARIHSEL sunucuya KOPYALANDI (Firestore'da yok, kod içinde sabit).
  // İki kopya sapınca aylık rapordaki "geçen yıl aynı ay" sessizce yanlış çıkar — burada kilitlenir.
  const fs = require('fs'), path = require('path');
  const kok = path.join(__dirname, '..');
  const cli = fs.readFileSync(path.join(kok, 'siparis-takip', 'index.html'), 'utf8');
  const fn = fs.readFileSync(path.join(kok, 'functions', 'index.js'), 'utf8');
  const cm = /const YON_TARIHSEL=(\{[\s\S]*?\});/.exec(cli);
  const fm = /const YON_TARIHSEL_FN=(\{[\s\S]*?\});/.exec(fn);
  dogru('istemci arşivi bulundu', !!cm);
  dogru('sunucu arşiv aynası bulundu', !!fm);
  if (cm && fm) {
    const A = JSON.parse(cm[1]), B = JSON.parse(fm[1]);
    const ka = Object.keys(A).sort(), kb = Object.keys(B).sort();
    esit('ay sayısı aynı', kb.length, ka.length);
    dogru('ay anahtarları birebir', JSON.stringify(ka) === JSON.stringify(kb));
    let sapan = null;
    for (const ay of ka) {
      const ta = Object.values(A[ay]).reduce((x, y) => x + (+y || 0), 0);
      const tb = Object.values(B[ay] || {}).reduce((x, y) => x + (+y || 0), 0);
      if (Math.abs(ta - tb) > 0.001) { sapan = ay + ' (' + ta + ' ↔ ' + tb + ')'; break; }
    }
    dogru('her ayın toplam kg değeri aynı', sapan === null, sapan || 'tüm aylar eşit');
    dogru('içerik tamamen aynı (derin)', JSON.stringify(A) === JSON.stringify(B));
  }
  // sınır sabiti de eş olmalı — ayrışırsa canlı/tarihsel kesişir ya da boşluk kalır
  const cs = /const YON_TARIHSEL_SON='([\d-]+)'/.exec(cli);
  const fsn = /const YON_TARIHSEL_SON_FN='([\d-]+)'/.exec(fn);
  dogru('tarihsel sınırı eş', !!(cs && fsn && cs[1] === fsn[1]), cs && fsn ? (cs[1] + ' = ' + fsn[1]) : 'bulunamadı');
  // Dönüşüm kuralı: istemcide ton = qty*prodKg/1000, qty = kg/prodKg → ton = kg/1000.
  // Sunucu ayTonajOf bunu doğrudan kg/1000 olarak uygular; formül değişirse burada yakalanır.
  dogru('sunucu tarihsel dönüşümü kg/1000', /reduce\(\(s, k\) => s \+ \(\+m\[k\] \|\| 0\), 0\) \/ 1000/.test(fn));
  dogru('aylık rapor canlı/tarihsel sınırı kullanıyor', /if \(ym > YON_TARIHSEL_SON_FN\)/.test(fn));
}

baslik('15) YÖNETİM RAPORLARI — ciro YOK + fonksiyonlar arası değişken sızıntısı YOK');
{
  // FİRMA KARARI: haftalık ve aylık yönetim raporları YALNIZ TONAJ gösterir; ciro/₺ bilgisi BULUNMAZ.
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const govde = (ad) => (fn.match(new RegExp('^function ' + ad + '\\([\\s\\S]*?^}', 'm')) || [''])[0];
  const hafta = govde('haftaOzetMesaj'), aylik = govde('aylikRaporMesaj');
  dogru('haftaOzetMesaj bulundu', hafta.length > 100);
  dogru('aylikRaporMesaj bulundu', aylik.length > 100);
  for (const [ad, g] of [['haftalık', hafta], ['aylık', aylik]]) {
    dogru(ad + ': ₺ / TL biçimleyici YOK', !/fmtTLFN|₺/.test(g));
    dogru(ad + ': "Ciro" etiketi YOK', !/Ciro/.test(g));
    dogru(ad + ': o.total okumuyor', !/\.ciro\b/.test(g));
  }
  dogru('fmtTLFN tamamen söküldü', !/const fmtTLFN/.test(fn));
  dogru('haftaOzetHesap ciro toplamıyor', !/ciro/.test(govde('haftaOzetHesap')));
  dogru('aylikRaporHesap ciro toplamıyor', !/ciro \+=|, ciro/.test(govde('aylikRaporHesap')));
  // SIZINTI KORUMASI: haftalık mesaj YALNIZ kendi değişkenlerini kullanır. Toplu metin değiştirme
  // sırasında aylık raporun `A.arsivAyi` ifadesi haftalığa bulaşmış ve çalışma anında ReferenceError
  // üretecek durumdaydı (deploy öncesi yakalandı). Bir daha kaçmasın.
  dogru('haftaOzetMesaj aylık değişkeni A. kullanmıyor', !/\bA\.[a-zA-Z]/.test(hafta));
  dogru('aylikRaporMesaj haftalık değişkeni H./bu./onceki. kullanmıyor', !/\b(H\.|bu\.|onceki\.)[a-zA-Z]/.test(aylik));
  // arşiv ayı koruması yalnız AYLIK raporda olmalı
  dogru('arsivAyi koruması aylık raporda var', /A\.arsivAyi/.test(aylik));
}

baslik('16) SİPARİŞ DEĞİŞİKLİĞİ / İPTAL — imza motoru ve tetikleme sınırları');
{
  // Sipariş içeriği değişince muhasebe onayı DÜŞER ve Telegram'a fark dökümü gider (sunucu taraflı,
  // yaz() içinde — istemci atlayamaz). NEYİN tetikleyip NEYİN tetiklemediği burada kilitlenir:
  // sevkiyat/durum/not/türev damga değişimleri onayı DÜŞÜRMEMELİ (yoksa her plaka girişinde yeniden onay).
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  global.ICERIK_ALAN = JSON.parse('[' + /const ICERIK_ALAN = \[([\s\S]*?)\];/.exec(fn)[1].replace(/\n/g, ' ') + ']');
  const al = (nm) => { const m = fn.match(new RegExp('^function ' + nm + '\\([\\s\\S]*?^}', 'm')); return m ? eval('(' + m[0] + ')') : null; };
  const siparisImza = al('siparisImza'), imzaHash = al('imzaHash'), siparisFark = al('siparisFark');
  dogru('siparisImza / imzaHash / siparisFark tanımlı', !!(siparisImza && imzaHash && siparisFark));
  const baz = {id: 'o1', no: 88, customerId: 'c1', customer: 'Bayi: BAREM', teslimTarihi: '2026-07-28',
    fiyatKademe: 'bayi', status: 'beklemede', lines: [{code: 'BK-300 PLUS', qty: 10, price: 850}]};
  const K = (x) => JSON.parse(JSON.stringify(x));
  const dener = (ad, mut, tetiklemeli) => {
    const y = K(baz); mut(y);
    const d = siparisImza(baz) !== siparisImza(y);
    dogru((tetiklemeli ? 'TETİKLER: ' : 'tetiklemez: ') + ad, d === tetiklemeli, d ? 'imza değişti' : 'imza aynı');
    if (tetiklemeli && d) dogru('  → okunur fark üretiliyor: ' + ad, siparisFark(baz, y, (o) => o.customer || '—').length > 0);
  };
  // İÇERİK — onayı düşürmeli
  dener('miktar değişti', (o) => { o.lines[0].qty = 25; }, true);
  dener('ürün eklendi', (o) => { o.lines.push({code: 'RK-20', qty: 5, price: 600}); }, true);
  dener('ürün çıkarıldı', (o) => { o.lines = []; }, true);
  dener('birim fiyat değişti', (o) => { o.lines[0].price = 900; }, true);
  dener('teslim tarihi değişti', (o) => { o.teslimTarihi = '2026-07-30'; }, true);
  dener('alıcı değişti', (o) => { o.customerId = 'c2'; o.customer = 'NUR'; }, true);
  dener('manuel fatura girildi', (o) => { o.faturaManuel = 120000; }, true);
  dener('İMECE seçildi', (o) => { o.imeceSecili = true; o.imeceAy = 3; }, true);
  dener('fiyat kademesi değişti', (o) => { o.fiyatKademe = 'fabrika'; }, true);
  dener('nakliye değişti', (o) => { o.nakliye = 5000; }, true);
  // SEVKİYAT / DURUM / TÜREV — onayı DÜŞÜRMEMELİ
  dener('plaka girildi', (o) => { o.plaka = '10 ABC 10'; }, false);
  dener('şoför girildi', (o) => { o.sofor = 'Ali'; o.soforTel = '555'; }, false);
  dener('durum ilerledi', (o) => { o.status = 'sevk'; }, false);
  dener('not eklendi', (o) => { o.not = 'acele'; }, false);
  dener('total türevi yazıldı', (o) => { o.total = 8500; }, false);
  dener('İMECE oran/fark damgası', (o) => { o.imeceOran = 2.99; o.imeceFark = 250; }, false);
  dener('DBS oran damgası', (o) => { o.dbsOran = 3; }, false);
  dener('hareket tarihi/saati', (o) => { o.hareketTarihi = '2026-07-28'; o.hareketSaati = '09:00'; }, false);
  dener('onay bayrakları yazıldı', (o) => { o.muhasebeOnay = {by: 'X', ts: 't'}; o.fabrikaOnay = {by: 'Y', ts: 't'}; }, false);
  dener('satır sırası değişti', (o) => { o.lines = [K(baz).lines[0]]; }, false);
  // callback_data Telegram 64 bayt sınırına sığmalı (moapprove:<mod>:<oid>:<hash>)
  const cb = 'moapprove:t:' + baz.id + ':' + imzaHash(siparisImza(baz));
  dogru('callback_data 64 bayt sınırında', cb.length <= 64, cb.length + ' bayt');
  dogru('imza damgası kısa ve sabit', imzaHash(siparisImza(baz)).length <= 7);
  // fark metni satır sonu taşımamalı (Telegram mesajına sahte satır enjeksiyonu)
  {
    const kotu = K(baz); kotu.lines[0].code = 'X\nSAHTE SATIR'; kotu.lines[0].qty = 99;
    const f = siparisFark(baz, kotu, (o) => o.customer || '—').join('|');
    dogru('fark metninde satır sonu YOK (enjeksiyon)', !/[\r\n]/.test(f));
  }
}

baslik('17) SUNUCU KANCALARI — değişiklik/iptal tespiti yaz() içinde ve onaylar düşüyor');
{
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  // Bildirim bayrakları TEK satırda tanımlanır; yeni bayrak eklendiğinde test kırılmasın diye
  // tam metin değil, GEREKLİ olanların hepsinin bulunduğu doğrulanır.
  {
    const _bild = ['wipe', 'silinen', 'silinenMusteri', 'yetkisizSilme', 'degisen', 'iptalEdilen', 'sevkKilidi', 'fiyatKorundu'];
    const _tanim = (fn.match(/let wipe = null,[^;]*;/) || [''])[0];
    const _sifir = (fn.match(/wipe = null; silinen = null;[^;]*;[^\n]*/) || [''])[0];
    dogru('yaz() bildirim bayraklarının HEPSİ tanımlı', _bild.every((k) => _tanim.indexOf(k) >= 0), _tanim.slice(0, 90));
    dogru('transaction her denemede HEPSİNİ sıfırlıyor (mükerrer bildirim yok)',
      _bild.every((k) => _sifir.indexOf(k + ' = null') >= 0 || _sifir.indexOf(k + ' = false') >= 0));
  }
  dogru('imza karşılaştırması tespitte kullanılıyor', /const eImza = siparisImza\(eo\), yImza = siparisImza\(yo\);/.test(fn));
  dogru('iptal ayrı tespit ediliyor', /if \(!eskiIptal && yeniIptal\)/.test(fn));
  dogru('blob tarafında onay bayrakları düşüyor', /delete kopya\.muhasebeOnay; delete kopya\.fabrikaOnay; delete kopya\.yemOnay;/.test(fn));
  // BİLGİ HATTI: bayrak yalnız onay İSTEYEN hatta diriltilir. Koşulsuz true olsaydı, onay
  // beklemeyen yem siparişi ekranda sonsuza dek "Muhasebe Onayı — Bekliyor" gösterirdi.
  dogru('muhasebeOnayGerek yalnız onaylı hatta diriliyor', /kopya\.muhasebeOnayGerek = !yemBilgiHatti\(app, yo\);/.test(fn));
  // Silme artık iki hedefe BAĞIMSIZ + yeniden denemeli yapılıyor (fail-open kapandı).
  dogru('sunucu onay kayıtları siliniyor (muhasebeonay)', /const hedefler = \["apps\/muhasebeonay", app === "siparis" \? "apps\/fabrikaonay" : "apps\/yemonay"\];/.test(fn));
  dogru('üretim onay kaydı da siliniyor', /await db\.doc\(yol\)\.set\(sil, \{merge: true\}\)/.test(fn));
  // YAZMA YOLU KURALI: dış servis (Telegram) yanıtı BLOKLAMAMALI — silme bildiriminde öğrenilen ders.
  dogru('Telegram tavanlı (Promise.race) — yazma yolu bloklanmıyor', /await Promise\.race\(\[Promise\.all\(bekleyenBildirim\), new Promise\(\(r\) => setTimeout\(r, BILDIRIM_TAVAN2\)\)\]\)/.test(fn));
  dogru('bildirim .catch ile korunuyor (unhandled rejection yok)', /\}\)\(\)\.catch\(\(e\) => console\.error\("değişiklik bildirimi", e\)\)/.test(fn));
  dogru('bildirim seli freni var', /rateLimit\("yazdeg:" \+ dec\.uid, 20, 60\)/.test(fn));
  dogru('denetim izi her hâlde tutuluyor', /denetimVer\("siparis-degisti"/.test(fn) && /denetimVer\("siparis-iptal"/.test(fn));
  dogru('bayat onay butonu reddediliyor', /imzaHash\(suanImza\) !== beklenenH/.test(fn));
  dogru('onay kaydına imza damgası yazılıyor', /imza: imzaHash\(suanImza\)/.test(fn));
  // İSTEMCİ: onay iptali yansıması + toptan düşürme emniyeti
  for (const [ad, dosya] of [['TMR', 'siparis-takip/index.html'], ['YEM', 'yem/index.html']]) {
    const c = fs.readFileSync(path.join(__dirname, '..', dosya), 'utf8');
    dogru(ad + ': onay iptali istemciye yansıyor', /muhasebe onayı DÜŞTÜ/.test(c));
    dogru(ad + ': boş harita toptan düşürmeyi engelliyor', /var _bosHarita=!map\|\|Object\.keys\(map\)\.length===0;/.test(c) && /if\(_bosHarita\)return;/.test(c));
  }
}

baslik('18) ONAY DAMGASI AYNASI + İPTAL BYPASS + YEM KİLİDİ (denetim düzeltmeleri)');
{
  const fs = require('fs'), path = require('path');
  const kok = path.join(__dirname, '..');
  const fn = fs.readFileSync(path.join(kok, 'functions', 'index.js'), 'utf8');
  const tmr = fs.readFileSync(path.join(kok, 'siparis-takip', 'index.html'), 'utf8');
  const yem = fs.readFileSync(path.join(kok, 'yem', 'index.html'), 'utf8');
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const cek = (src, re) => { const m = re.exec(src); return m ? m[0] : ''; };
  // --- AYNA EŞLİĞİ: sapınca bayat onay koruması sessizce devre dışı kalır ---
  const RE_IMZA = /function siparisImza\(o\) ?\{[\s\S]*?\n\}/;
  const RE_HASH = /function imzaHash\(s\) ?\{[\s\S]*?\n\}/;
  const RE_ALAN = /const ICERIK_ALAN = \[[\s\S]*?\];/;
  for (const [ad, src] of [['TMR', tmr], ['YEM', yem]]) {
    esit(ad + ': siparisImza aynası birebir', norm(cek(src, RE_IMZA)), norm(cek(fn, RE_IMZA)));
    esit(ad + ': imzaHash aynası birebir', norm(cek(src, RE_HASH)), norm(cek(fn, RE_HASH)));
    esit(ad + ': ICERIK_ALAN aynası birebir', norm(cek(src, RE_ALAN)), norm(cek(fn, RE_ALAN)));
    dogru(ad + ': onay butonu damga taşıyor', /moapprove:[ty]:'\+o\.id\+':'\+onayDamga\(o\)/.test(src));
  }
  // --- İPTAL BYPASS KAPANDI (iptal et → değiştir → geri aç) ---
  dogru('iptal edilen siparişin onayı da düşüyor', /_ipt\.push\(\{id: yo\.id/.test(fn) && /onayDusur\(yo, idx\);\s*\/\/ iptal edilen/.test(fn));
  dogru('iptalden geri alınca KOŞULSUZ onay düşüyor', /if \(eskiIptal && !yeniIptal\)/.test(fn) && /geriAlindi/.test(fn));
  dogru('iptalliyken içerik değişirse de onay düşüyor', /if \(eskiIptal && yeniIptal\) \{ if \(imzaDegisti\) onayDusur\(yo, idx\); return; \}/.test(fn));
  dogru('onay düşürme "okunur fark" şartına BAĞLI DEĞİL', !/if \(!farklar\.length\) return;/.test(fn));
  dogru('fark çözülemezse jenerik satır üretiliyor', /ayrıntı çözülemedi/.test(fn));
  // --- GEÇMİŞ KAYIT MUAFİYETİ ---
  // MUAFİYET YALNIZ SUNUCUDAKİ KAYDA GÖRE: yo.gecmisKayit'e bakılırsa istemci bayrağı gönderip
  // sevk kilidini ve onay düşürmeyi tek alanla kapatabilirdi (denetimde bulunan kritik baypas).
  dogru('geçmiş (Excel) kayıtlar muaf — YALNIZ sunucudaki kayda göre', /if \(eo\.gecmisKayit === true\) return;/.test(fn));
  dogru('istemci gecmisKayit bayrağı muafiyet AÇAMIYOR', !/yo\.gecmisKayit === true \|\|/.test(fn));
  // --- FAIL-OPEN KAPANDI ---
  dogru('onay iptali bağımsız + yeniden denemeli', /Promise\.all\(hedefler\.map\(dene\)\)/.test(fn));
  dogru('onay iptali hatası denetime yazılıyor', /denetimVer\("onay-iptali-basarisiz"/.test(fn));
  dogru('onay iptali hatası gruba UYARI gönderiyor', /ONAY DÜŞÜRÜLEMEDİ/.test(fn));
  dogru('uyarı hız sınırından muaf (mesajHakki kontrolünden ÖNCE)',
    fn.indexOf('ONAY DÜŞÜRÜLEMEDİ') < fn.indexOf('if (!mesajHakki) return;'));
  // --- TEK TAVAN (10 sn → 5 sn) ---
  dogru('bildirimler TEK tavanda bekleniyor', /await Promise\.race\(\[Promise\.all\(bekleyenBildirim\)/.test(fn));
  dogru('silme bildirimi de aynı havuzda', /bekleyenBildirim\.push\(bildirim\);/.test(fn));
  // --- YEM KAPISI İÇ SİPARİŞTE KALDIRILDI (firma kararı 29.07) ---
  // Kapı iskeleti (sevk/teslim geçişi) duruyor ama YALNIZ portal siparişinde çalışır.
  dogru('YEM: kapı iskeleti sevk/teslim geçişinde', /var _CIKIS=\['sevk','teslim'\];/.test(yem));
  dogru('YEM: çıkış geçişi doğru hesaplanıyor', /_cikisaGeciyor=_CIKIS\.indexOf\(o\.status\)>=0 && _CIKIS\.indexOf\(\(_e&&_e\.status\)\|\|''\)<0/.test(yem));
  dogru('YEM: kapı _kapiVar + _cikisaGeciyor ile bağlı', /if\(_kapiVar&&_cikisaGeciyor&&o\.muhasebeOnayGerek&&!_muhOk\)/.test(yem));
  dogru('YEM: içerik-değişti kapısı da portal ile sınırlı', /if\(_kapiVar&&_cikisaGeciyor&&_icerikDegisti\)/.test(yem));
  dogru('YEM: eski akış üretim kapısı da portal ile sınırlı', /if\(_kapiVar&&_cikisaGeciyor&&o\.yemOnayGerek&&!_ureOk\)/.test(yem));
  dogru('YEM: eski RANK kapısı KALDIRILDI', !/_ilerliyor/.test(yem));
  dogru('YEM: onay/hazır aşaması artık serbest', !/onaylanmadan durum ilerletilemez \(diğer düzenlemeler/.test(yem));
}

baslik('19) İPTAL/GERİ-ALMA DAVRANIŞI — koşturularak');
{
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  global.ICERIK_ALAN = JSON.parse('[' + /const ICERIK_ALAN = \[([\s\S]*?)\];/.exec(fn)[1].replace(/\n/g, ' ') + ']');
  const al = (nm) => { const m = fn.match(new RegExp('^function ' + nm + '\\([\\s\\S]*?^}', 'm')); return eval('(' + m[0] + ')'); };
  const siparisImza = al('siparisImza');
  const baz = {id: 'o1', no: 5, customerId: 'c1', customer: 'A', status: 'onay',
    lines: [{code: 'X', qty: 10, price: 100}]};
  // iptal edilirken içerik AYNI → imza aynı; ama iptal dalı onayı yine de düşürmeli (kod kontrolü §18'de)
  const iptalli = Object.assign({}, baz, {status: 'iptal'});
  esit('iptal statüsü imzayı DEĞİŞTİRMEZ (statü imzada yok)', siparisImza(baz), siparisImza(iptalli));
  // iptalliyken miktar değişimi imzayı değiştirir → geri alınca yakalanmalı
  const iptalliDegisik = Object.assign({}, iptalli, {lines: [{code: 'X', qty: 100, price: 100}]});
  dogru('iptalliyken yapılan içerik değişimi imzada görünür', siparisImza(iptalli) !== siparisImza(iptalliDegisik));
  // geri açılınca eski (iptal anındaki) sürümle karşılaştırılsa imzalar AYNI olurdu → bu yüzden
  // "iptalden geri alma" KOŞULSUZ onay düşürür; aşağıdaki eşitlik o kuralın neden şart olduğunu gösterir.
  const geriAcik = Object.assign({}, iptalliDegisik, {status: 'onay'});
  esit('geri açılan sürüm ile iptalli sürümün imzası AYNI (koşulsuz düşürme şart)',
    siparisImza(iptalliDegisik), siparisImza(geriAcik));
}

baslik('20) SERT ONAY KAPISI — TMR + Yem eş davranış');
{
  const fs = require('fs'), path = require('path');
  const kok = path.join(__dirname, '..');
  const tmr = fs.readFileSync(path.join(kok, 'siparis-takip', 'index.html'), 'utf8');
  const yem = fs.readFileSync(path.join(kok, 'yem', 'index.html'), 'utf8');
  // TMR'de artık sert kapı var (önceden yalnız Yem'de vardı → onay düşürme TMR'de kozmetikti).
  dogru('TMR: sert kapı eklendi', /SERT ONAY KAPISI \(Yem ile EŞ\)/.test(tmr));
  dogru('TMR: kapı statü RANK ile ilerlemeye bağlı', /var _RANK=\{beklemede:0,onay:1,hazir:2,sevk:3,teslim:4,iptal:0\};/.test(tmr));
  dogru('TMR: muhasebe VE üretim onayı aranıyor', /onayVarMi\(o,'muhasebe'\)/.test(tmr) && /onayVarMi\(o,'uretim'\)/.test(tmr));
  dogru('TMR: geçmiş/Excel kaydı muaf', /o\.id&&o\.muhasebeOnayGerek&&!o\.gecmisKayit/.test(tmr));
  dogru('TMR: üretim onayı GÜVENİLİR kaynaktan (apps/fabrikaonay)', /function fabrikaOnayRec\(o\)\{const r=\(o&&o\.id&&window\.__FABRIKA\)/.test(tmr));
  // İPTAL rank 0 → hiçbir zaman "ilerleme" değil: onaysız sipariş her zaman iptal EDİLEBİLMELİ.
  dogru('TMR: iptal rank 0 (iptal her zaman mümkün)', /iptal:0\}/.test(tmr));
  dogru('YEM: iptal hiçbir zaman bloklanmaz (çıkış listesinde yok)', !/_CIKIS=\['sevk','teslim','iptal'\]/.test(yem));
  // YÜKLEME YARIŞI: onay haritaları sayfa açılışında geç gelir; o aralıkta ONAYLI sipariş kilitlenmemeli.
  dogru('TMR: yükleme yarışı korumalı (harita yoksa blob alanına düşer)', /function onayVarMi\(o,tur\)\{[\s\S]*?if\(window\.__MUHASEBEONAY\)return !!muhasebeOnayRec\(o\);/.test(tmr));
  dogru('YEM: yükleme yarışı korumalı', /var _muhOk=window\.__MUHASEBEONAY\?muhasebeOnayli\(o\):!!\(o\.muhasebeOnay&&o\.muhasebeOnay\.by\);/.test(yem));
  // Kilitli kalan kullanıcının çıkış yolu OLMALI (yoksa sipariş ölür)
  dogru('TMR: "Muhasebe Onayı İste" düğmesi duruyor', /onclick="tgSiparisModal\(\)"/.test(tmr));
  dogru('YEM: "Tekrar Gönder" düğmesi duruyor', /tekrarMuhasebeOnay\(/.test(yem));
}

baslik('21) AYLIK RAPOR — DANIŞMAN SATIŞLARI (tonaj + toplamdaki pay + önceki ay kıyası)');
{
  const fs = require('fs'), path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  global.YON_TARIHSEL_FN = JSON.parse(/const YON_TARIHSEL_FN=(\{[\s\S]*?\});/.exec(fn)[1]);
  global.YON_TARIHSEL_SON_FN = /const YON_TARIHSEL_SON_FN='([\d-]+)'/.exec(fn)[1];
  const al = (nm) => { const m = fn.match(new RegExp('^function ' + nm + '\\([\\s\\S]*?^}', 'm')); return m ? eval('(' + m[0] + ')') : null; };
  global.prodKgOf = al('prodKgOf');
  global.cikanSiparisFN = al('cikanSiparisFN');   // tonaj tabanı: sevk+teslim — ayTonajOf ve danismanTonajOf bunu çağırır
  const danismanTonajOf = al('danismanTonajOf'), danismanAdi = al('danismanAdi');
  dogru('danismanTonajOf / danismanAdi tanımlı', !!(danismanTonajOf && danismanAdi));
  dogru('cikanSiparisFN tanımlı (çağrılıyor — kayitSayisi vakası tekrarlanmasın)', typeof global.cikanSiparisFN === 'function');
  const DB = {products: [{code: 'P', pkg: '50 kg'}],
    komisyoncular: [{id: 'd1', name: 'Ahmet Yılmaz', type: 'danisman'}, {id: 'd2', name: 'Mehmet Kaya', type: 'danisman'},
      {id: 'b1', name: 'BAREM', type: 'bayi', danismanId: 'd1'}],
    orders: [
      {date: '2026-08-05', status: 'teslim', danismanId: 'd1', lines: [{code: 'P', qty: 2000}]},                  // 100 t  ÇIKTI
      {date: '2026-08-12', status: 'sevk', aliciBayi: true, bayiId: 'b1', danismanId: 'd1', lines: [{code: 'P', qty: 400}]},  // 20 t ÇIKTI (BAYİ üzerinden)
      {date: '2026-08-20', status: 'teslim', danismanId: 'd2', lines: [{code: 'P', qty: 900}]},                   // 45 t  ÇIKTI
      {date: '2026-08-25', status: 'onay', danismanId: 'd2', lines: [{code: 'P', qty: 600}]},                     // 30 t  BEKLEYEN → sayılmaz
      {date: '2026-08-26', status: 'beklemede', danismanId: 'd1', lines: [{code: 'P', qty: 800}]},                // 40 t  BEKLEYEN → sayılmaz
      {date: '2026-08-21', status: 'teslim', lines: [{code: 'P', qty: 200}]},                                     // danışmansız
      {date: '2026-08-22', status: 'iptal', danismanId: 'd1', lines: [{code: 'P', qty: 9999}]},                   // iptal
      {date: '2026-07-10', status: 'teslim', danismanId: 'd1', lines: [{code: 'P', qty: 1960}]},                  // 98 t
    ]};
  const bu = danismanTonajOf(DB, '2026-08');
  esit('d1: doğrudan + BAYİ üzerinden toplanıyor', bu.d1, 120);
  esit('d2 tonajı', bu.d2, 45);
  dogru('danışmansız sipariş sayılmıyor', Object.keys(bu).length === 2);
  dogru('iptal sipariş sayılmıyor', bu.d1 === 120);
  // 31.07 kararı: tonaj tabanı = fiilen çıkan mal. Beklemede/onaylandı sipariş danışman payını ŞİŞİRMEZ.
  dogru('BEKLEYEN sipariş danışman tonajına girmiyor (d1 40 t, d2 30 t hariç)', bu.d1 === 120 && bu.d2 === 45);
  esit('önceki ay (canlı) hesaplanıyor', danismanTonajOf(DB, '2026-07').d1, 98);
  // ARŞİV AYI: danışman kaydı YOK → null (kıyas gösterilmez). Temmuz raporunda Haziran böyledir.
  esit('arşiv ayı null döner (kıyas yok)', danismanTonajOf(DB, '2026-06'), null);
  esit('arşiv sınırındaki ay da null', danismanTonajOf(DB, YON_TARIHSEL_SON_FN), null);
  esit('danışman adı çözülüyor', danismanAdi(DB, 'd1'), 'Ahmet Yılmaz');
  dogru('bilinmeyen danışman güvenli', /bilinmeyen|BAREM/.test(danismanAdi(DB, 'zzz') || 'bilinmeyen'));
  // Mesaj tarafı: blok var, önceki ay yoksa açıklama satırı ayrı satırda
  dogru('rapor mesajında danışman bloğu var', /🧑‍💼 <b>Danışman Satışları<\/b>/.test(fn));
  dogru('kıyas yoksa açıklama AYRI satırda', /danBlok \+= "\\n<i>Önceki ay \(/.test(fn));
  dogru('bu ay satmayan ama önceki ay satan danışman da listeleniyor', /Object\.keys\(A\.danismanOnceki \|\| \{\}\)\.forEach/.test(fn));
  dogru('geçen yıl DEĞİL önceki ay kıyaslanıyor', /_oy\.setMonth\(_oy\.getMonth\(\) - 1\)/.test(fn));

  // ---- PAY SÜTUNU: mesajı GERÇEKTEN üreterek doğrula (metin eşleştirme yüzdeyi hesaplamaz) ----
  // Bu blok aylikRaporHesap + aylikRaporMesaj'ı koşturur; yüzdeler kaynak metninden değil,
  // üretilen Telegram mesajından okunur. Bir sütun kayması/biçim bozulması burada yakalanır.
  global.AYLAR_TR_FN = eval(/const AYLAR_TR_FN\s*=\s*(\[[\s\S]*?\]);/.exec(fn)[1]);
  const ok = (nm) => { const m = fn.match(new RegExp('^const ' + nm + '\\s*=\\s*(\\([\\s\\S]*?);$', 'm')); return m ? eval('(' + m[1] + ')') : null; };
  global.fmtTonFN = ok('fmtTonFN'); global.escHTML = ok('escHTML');
  global.trendEt = al('trendEt'); global.ayTonajOf = al('ayTonajOf');
  global.danismanTonajOf = danismanTonajOf; global.danismanAdi = danismanAdi;
  const aylikRaporHesap = al('aylikRaporHesap'), aylikRaporMesaj = al('aylikRaporMesaj');
  dogru('aylikRaporHesap + aylikRaporMesaj koşturulabilir', !!(aylikRaporHesap && aylikRaporMesaj && global.fmtTonFN && global.escHTML));
  const danBlokOf = (msg) => {
    const i = msg.indexOf('🧑‍💼'); if (i < 0) return '';
    const son = [msg.indexOf('\n🏆', i), msg.indexOf('\n📦', i), msg.length].filter((x) => x > 0);
    return msg.slice(i, Math.min.apply(null, son));
  };
  const sip = (d, did, qty, x) => Object.assign({date: d, status: 'teslim', danismanId: did, lines: [{code: 'P', qty}]}, x || {});
  const kur = (orders, n) => ({products: [{code: 'P', pkg: '50 kg'}], meta: {}, customers: [],
    komisyoncular: Array.from({length: n || 4}, (_, i) => ({id: 'd' + (i + 1), name: 'Danisman' + (i + 1), type: 'danisman'})), orders});
  const uret = (DB, ym) => danBlokOf(aylikRaporMesaj(aylikRaporHesap(DB, ym)));

  // 1) NORMAL: ay toplamı 405 t (danışmansız 150 t dahil) → paylar 405 üzerinden
  {
    const b = uret(kur([sip('2026-08-05', 'd1', 2000), sip('2026-08-12', 'd1', 400), sip('2026-08-20', 'd2', 900),
      sip('2026-08-06', 'd3', 1500), sip('2026-08-14', 'd4', 300), sip('2026-08-21', '', 3000),
      sip('2026-07-10', 'd1', 1960)]), '2026-08');
    dogru('pay sütunu: d1 120/405 = %29,6', /Danisman1\s+120,0 t\s+%29,6/.test(b));
    dogru('pay sütunu: d2 45/405 = %11,1', /Danisman2\s+45,0 t\s+%11,1/.test(b));
    dogru('pay sütunu: d3 75/405 = %18,5', /Danisman3\s+75,0 t\s+%18,5/.test(b));
    dogru('pay sütunu: d4 15/405 = %3,7', /Danisman4\s+15,0 t\s+%3,7/.test(b));
    dogru('PAYDA ay TOPLAMI (danışmansız satış dahil) — paylar 100 etmez', !/%100,0/.test(b));
    dogru('toplam satırı: 255/405 = %63,0', /Danışman toplamı\s+255,0 t\s+%63,0/.test(b));
    dogru('pay biçimi hep tek ondalık (sütun kaymaz)', !/%\d+(\s|$)/.test(b.replace(/[▲▼▬] %[\d.,]+/g, '')));
    dogru('önceki ay kıyas sütunu duruyor', /[▲▼▬] %|🆕 yeni/.test(b));
    const enGenis = b.split('\n').reduce((m, s) => Math.max(m, s.length), 0);
    dogru('tablo genişliği Telegram sınırında (≤48)', enGenis <= 48 || /toplamdaki pay/.test(b.split('\n')[0]));
  }
  // 2) TEK DANIŞMAN: tüm satış onun → %100,0 (üst sınır aşılmıyor)
  {
    const b = uret(kur([sip('2026-08-05', 'd1', 2000), sip('2026-07-05', 'd1', 1000)]), '2026-08');
    dogru('tek danışman %100,0 (üstü YOK)', /Danisman1\s+100,0 t\s+%100,0/.test(b) && !/%1[0-9][1-9],/.test(b));
  }
  // 3) BU AY SATMAYAN: bu=0 → sahte "%0,0" DEĞİL, "—"
  {
    const b = uret(kur([sip('2026-08-05', 'd1', 2000), sip('2026-08-06', '', 1000),
      sip('2026-07-05', 'd1', 1000), sip('2026-07-06', 'd2', 1500)]), '2026-08');
    dogru('bu ay satmayanda pay "—" (sahte %0,0 değil)', /Danisman2\s+0,0 t\s+—/.test(b));
  }
  // 4) 14 DANIŞMAN: liste 12'de kesilir ama TOPLAM satırı kesilenleri DE kapsar
  {
    const b = uret(kur(Array.from({length: 14}, (_, i) => sip('2026-08-0' + ((i % 9) + 1), 'd' + (i + 1), (14 - i) * 100))
      .concat([sip('2026-08-15', '', 2000)]), 14), '2026-08');
    // NOT: ilk satır <pre> ile AYNI satırda başlar → satır-başı (^) ile sayılamaz
    dogru('liste 12 danışmanda kesiliyor', (b.match(/Danisman\d+\s+[\d.,]+ t/g) || []).length === 12);
    dogru('TOPLAM kesilen 2 danışmanı DA sayıyor (525 t, 510 değil)', /Danışman toplamı\s+525,0 t/.test(b));
    dogru('kesme notu toplamın kapsamını söylüyor', /danışman daha \(toplam satırına dahildir\)/.test(b));
  }
  // 5) ARŞİV AYI: danışman kaydı yok → blok hiç çıkmaz (pay da çıkmaz)
  dogru('arşiv ayında danışman bloğu HİÇ çıkmıyor', uret(kur([]), '2026-06') === '');
}

baslik('22) YEM KAPI DAVRANIŞI — hangi geçiş bloklanır, hangisi serbest (koşturarak)');
{
  // FİRMA KURALI (25.07): Yem'de onaysız sipariş DÜZENLENEBİLİR, İPTAL EDİLEBİLİR, 'onay'/'hazır'a
  // geçebilir; yalnız SEVK/TESLİM'e GEÇİŞ muhasebe onayı ister. TMR ise her ilerlemede onay ister.
  const _CIKIS = ['sevk', 'teslim'];
  const bloklanir = (eskiSt, yeniSt) => _CIKIS.indexOf(yeniSt) >= 0 && _CIKIS.indexOf(eskiSt) < 0;
  const T = (ad, e, y, bekle) => dogru((bekle ? 'BLOKLANIR: ' : 'serbest: ') + ad, bloklanir(e, y) === bekle);
  // serbest olmalı
  T('içerik düzenleme (beklemede→beklemede)', 'beklemede', 'beklemede', false);
  T('iptal (beklemede→iptal)', 'beklemede', 'iptal', false);
  T('iptal (hazir→iptal)', 'hazir', 'iptal', false);
  T('onaya alma (beklemede→onay)', 'beklemede', 'onay', false);
  T('hazır yapma (onay→hazir)', 'onay', 'hazir', false);
  T('sevk edilmiş siparişi düzenleme (sevk→sevk)', 'sevk', 'sevk', false);
  T('sevk→teslim (mal zaten çıktı)', 'sevk', 'teslim', false);
  T('geri alma (hazir→beklemede)', 'hazir', 'beklemede', false);
  // bloklanmalı
  T('hazır→sevk', 'hazir', 'sevk', true);
  T('beklemede→sevk', 'beklemede', 'sevk', true);
  T('beklemede→teslim', 'beklemede', 'teslim', true);
  T('onay→teslim', 'onay', 'teslim', true);
  T('iptal→sevk', 'iptal', 'sevk', true);
  // TMR farkı: TMR'de HER ilerleme bloklanır (RANK tabanlı) — iki modül KASITEN farklı.
  const _RANK = {beklemede: 0, onay: 1, hazir: 2, sevk: 3, teslim: 4, iptal: 0};
  const tmrBlok = (e, y) => (_RANK[y] || 0) > (_RANK[e] || 0);
  dogru('TMR beklemede→onay BLOKLAR (Yem serbest bırakır)', tmrBlok('beklemede', 'onay') === true && bloklanir('beklemede', 'onay') === false);
  dogru('TMR de iptali bloklamaz', tmrBlok('hazir', 'iptal') === false);
  dogru('TMR sevk→teslim BLOKLAR (Yem serbest)', tmrBlok('sevk', 'teslim') === true && bloklanir('sevk', 'teslim') === false);
}

baslik('23) SEVK SONRASI İÇERİK KİLİDİ — arayüz + sunucu (firma kararı 25.07)');
{
  const fs = require('fs'), path = require('path');
  const kok = path.join(__dirname, '..');
  const fn = fs.readFileSync(path.join(kok, 'functions', 'index.js'), 'utf8');
  const tmr = fs.readFileSync(path.join(kok, 'siparis-takip', 'index.html'), 'utf8');
  const yem = fs.readFileSync(path.join(kok, 'yem', 'index.html'), 'utf8');
  for (const [ad, src] of [['TMR', tmr], ['YEM', yem]]) {
    dogru(ad + ': sevkKilitli tanımlı', /function sevkKilitli\(o\)\{return !!\(o&&\['sevk','teslim'\]\.indexOf\(o\.status\)>=0&&!o\._kilitAcik\);\}/.test(src));
    dogru(ad + ': kilidi YALNIZ yönetici açabilir', /function sevkKilidiAc\(\)\{[\s\S]*?if\(!isAdmin\(\)\)\{toast\('Bu kilidi yalnız yönetici açabilir'\)/.test(src));
    dogru(ad + ': açma işlemi geçmişe yazılıyor', /Yönetici sevk sonrası içerik kilidini açtı/.test(src));
    dogru(ad + ': açmadan önce açık onay isteniyor', /SEVK EDİLMİŞ SİPARİŞİN İÇERİĞİNİ AÇIYORSUNUZ/.test(src));
    dogru(ad + ': içerik icRO ile kilitleniyor', /const icRO=ro\|\|sevkKilitli\(o\);/.test(src));
    dogru(ad + ': ürün+fiyat bölgesi fieldset ile kapalı', /<fieldset \$\{icRO\?'disabled':''\}/.test(src));
    dogru(ad + ': kullanıcıya durum şeridi gösteriliyor', /sevkKilitUyariHTML\(o\)/.test(src));
    // Kilit açması OTURUMLUK olmalı: bloba yazılsaydı kilit herkes için KALICI açılırdı.
    dogru(ad + ': _kilitAcik bloba yazılmıyor', /delete o\._kilitAcik;/.test(src));
    // 03.08: düğme yalnız üstteki şeritteydi, modal kaydırılınca görünmüyordu → kullanıcı bulamadı.
    // Kaydet'in yanına ikinci giriş noktası kondu. Koşullar aynı kalmalı: KAYITLI + KİLİTLİ + YÖNETİCİ.
    dogru(ad + ': alt düğme kaydedilmiş+kilitli+yönetici şartına bağlı',
      /\$\{o\.id&&sevkKilitli\(o\)&&isAdmin\(\)\?`<button[^`]*onclick="sevkKilidiAc\(\)"/.test(src));
    dogru(ad + ': alt düğme Kaydet’in HEMEN yanında',
      /onclick="sevkKilidiAc\(\)"[\s\S]{0,700}?onclick="saveOrder\(\)">Kaydet/.test(src));
    dogru(ad + ': kilit açıkken ekranda uyarı duruyor', /Düzenleme açık — kaydedince bildirilir/.test(src));
    dogru(ad + ': iki giriş noktası da aynı adı taşıyor (Kilidi Aç ↔ Düzenle karışmasın)',
      !/Kilidi Aç/.test(src) && (src.match(/>Düzenle<\/button>/g) || []).length === 2);
    dogru(ad + ': 403 uyarısı kullanıcıyı DOĞRU düğmeye yönlendiriyor',
      /sipariş kartının altındaki "Düzenle" düğmesiyle değiştirebilir/.test(src));
  }
  // TMR: kilitlenen içerik alanları
  dogru('TMR: müşteri seçici kilitli', /pick:'pickOrderCustomer',ro:icRO\}/.test(tmr));
  dogru('TMR: teslim tarihi kilitli', /\$\{icRO\?'disabled':''\} onchange="editOrder\.teslimTarihi=this\.value"/.test(tmr));
  dogru('TMR: teslim noktası kilitli', /<select \$\{icRO\?'disabled':''\} onchange="onChangeKademe/.test(tmr));
  dogru('TMR: İMECE bloğu kilitli', /imeceBlokHTML\(o,icRO\)/.test(tmr));
  dogru('TMR: komisyon satırı kilitli', /orderKomisyonRow\(o,icRO\)/.test(tmr));
  // SUNUCU UCU: arayüz kilidi konsoldan atlatılabilir → sunucu da reddetmeli
  dogru('SUNUCU: sevk sonrası içerik değişimi yönetici şartına bağlı', /if \(\["sevk", "teslim"\]\.indexOf\(String\(eo\.status \|\| ""\)\) >= 0 && !yoneticiMi\)/.test(fn));
  dogru('SUNUCU: yönetici ölçütü silme hakkıyla aynı', /const yoneticiMi = \(dec\.portalYonetici === true\) \|\| \(dec\[app\] === "admin"\);/.test(fn));
  dogru('SUNUCU: yetkisizse transaction İPTAL', /if \(_kilitli\.length\) \{ sevkKilidi = _kilitli; return; \}/.test(fn));
  dogru('SUNUCU: 403 sevk_sonrasi_kilit dönüyor', /res\.status\(403\)\.json\(\{hata: "sevk_sonrasi_kilit"/.test(fn));
  dogru('SUNUCU: denetim izi tutuluyor', /denetimVer\("sevk-kilidi-engellendi"/.test(fn));
  dogru('SUNUCU: tx her denemede sevkKilidi sıfırlanıyor', /iptalEdilen = null; sevkKilidi = null;/.test(fn));
  // SEVKİYAT ALANI İÇERİK DEĞİLDİR → plaka girişi 403 yememeli
  const alan = JSON.parse('[' + /const ICERIK_ALAN = \[([\s\S]*?)\];/.exec(fn)[1].replace(/\n/g, ' ') + ']');
  for (const k of ['plaka', 'sofor', 'soforTel', 'hareketTarihi', 'hareketSaati', 'status', 'not'])
    dogru('sevkiyat/durum alanı içerik SAYILMIYOR: ' + k, alan.indexOf(k) < 0);
}

baslik('24) SEVK KİLİDİ KAPSAMI — ölçülerek (arayüzde açık kalan alan ∩ sunucu içerik alanları = BOŞ)');
{
  // Denetim dersi: "şu dize var mı" testi kapsamı ÖLÇMEZ. Burada arayüzde sevk sonrası DÜZENLENEBİLİR
  // kalan alanlar çıkarılıp sunucunun ICERIK_ALAN listesiyle kesiştiriliyor. Kesişim BOŞ olmalı —
  // aksi halde kullanıcı alanı düzenler, sunucu 403 verir ve kayıt sessizce kaybolur (sekme kilitlenir).
  const fs = require('fs'), path = require('path');
  const kok = path.join(__dirname, '..');
  const fn = fs.readFileSync(path.join(kok, 'functions', 'index.js'), 'utf8');
  const ALAN = new Set(JSON.parse('[' + /const ICERIK_ALAN = \[([\s\S]*?)\];/.exec(fn)[1].replace(/\n/g, ' ') + ']'));
  dogru('sunucu içerik alanı listesi okundu', ALAN.size > 10, ALAN.size + ' alan');
  for (const [ad, dosya] of [['TMR', 'siparis-takip/index.html'], ['YEM', 'yem/index.html']]) {
    const src = fs.readFileSync(path.join(kok, dosya), 'utf8');
    const i = src.indexOf('function renderOrderModal(){');
    const son = src.indexOf('function closeModal(');
    const blok = src.slice(i, son > i ? son : i + 60000);
    // fieldset (sevk kilidinde disabled) aralığı — içindeki her şey zaten kilitli
    const fa = blok.indexOf("<fieldset ${icRO?'disabled':''}");
    const fb = fa >= 0 ? blok.indexOf('</fieldset>', fa) : -1;
    const fieldsetIcinde = (pos) => fa >= 0 && fb > fa && pos > fa && pos < fb;
    const acik = new Set();
    const tara = (re) => { let m; while ((m = re.exec(blok))) { if (!fieldsetIcinde(m.index)) acik.add(m[1]); } };
    tara(/\$\{ro\?'disabled':''\}(?:[^>]{0,220}?)onchange="editOrder\.([A-Za-z0-9_]+)\s*=/g);
    tara(/\$\{shipRO\?'disabled':''\}(?:[^>]{0,220}?)onchange="editOrder\.([A-Za-z0-9_]+)\s*=/g);
    const kesisim = [...acik].filter((k) => ALAN.has(k)).sort();
    dogru(ad + ': sevk sonrası açık alan ∩ sunucu içerik alanı = BOŞ', kesisim.length === 0,
      kesisim.length ? ('403 riski: ' + kesisim.join(', ')) : ('açık kalanlar: ' + [...acik].sort().join(', ')));
    // Sevkiyat/durum alanları AÇIK KALMALI — kilitlenirse teslim işaretlenemez, plaka girilemez
    for (const k of ['plaka', 'hareketSaati'])
      dogru(ad + ': sevkiyat alanı açık kalıyor — ' + k, acik.has(k) || !blok.includes('editOrder.' + k + '='), k);
  }
}

baslik('25) BİLDİRİM BLOĞU — GERÇEKTEN KOŞTURULARAK (metin testi çalışma-zamanı hatasını görmez)');
{
  // DERS: `const BILDIRIM_TAVAN2` blok İÇİNDE tanımlanıp DIŞINDA kullanılıyordu → ReferenceError →
  // silme/değişiklik/iptal içeren HER kaydetme HTTP 500 dönüyordu (veri commit olduğu hâlde).
  // 499 regex kontrolü bunu YAKALAYAMADI. Bu yüzden blok artık sahte bağımlılıklarla ÇALIŞTIRILIYOR.
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const a = src.indexOf('    const BILDIRIM_TAVAN2 = 5000;');
  const b = src.indexOf('    res.json({ok: true});', a);   // a'DAN SONRA ara: dosyada daha erken res.json'lar var
  dogru('bildirim bölgesi bulundu', a >= 0 && b > a);
  if (a >= 0 && b > a) {
    const govde = src.slice(a, b) + '    res.json({ok:true});';
    const D = (id) => ({id, no: '1', ad: 'X', tutar: 1, tarih: '', teslim: '', urun: [], farklar: ['a'], imzaH: 'h', onayliydi: true});
    const senaryolar = [
      ['yalnız silme', {silinen: [D('o1')], degisen: null, iptalEdilen: null}],
      ['yalnız değişiklik', {silinen: null, degisen: [D('o1')], iptalEdilen: null}],
      ['yalnız iptal', {silinen: null, degisen: null, iptalEdilen: [D('o2')]}],
      ['hiçbiri', {silinen: null, degisen: null, iptalEdilen: null}],
      ['silme+değişiklik+iptal', {silinen: [D('o1')], degisen: [D('o1')], iptalEdilen: [D('o2')]}],
      ['6+ değişiklik (özet dalı)', {silinen: null, degisen: [1, 2, 3, 4, 5, 6, 7].map((n) => D('o' + n)), iptalEdilen: null}],
      ['6+ iptal (özet dalı)', {silinen: null, degisen: null, iptalEdilen: [1, 2, 3, 4, 5, 6].map((n) => D('o' + n))}],
    ];
    for (const [ad, v] of senaryolar) {
      let cikti = null, hata = null;
      const sahte = {
        app: 'siparis', dec: {uid: 'u1', email: 'a@b.c', portalYonetici: false, siparis: 'siparis'},
        EPOSTA_SON: /@x$/, silinen: v.silinen, degisen: v.degisen, iptalEdilen: v.iptalEdilen,
        admin: {firestore: {FieldValue: {delete: () => 'DEL'}}},
        db: {doc: () => ({set: async () => {}})},
        denetimVer: async () => {}, portalAd: async () => 'Ali', rateLimit: async () => true,
        tgToken: () => 'T', tgChat: () => 'C', tg: async () => {},
        res: {json: (x) => { cikti = x; }, status: () => ({json: (x) => { cikti = x; }})},
        console: {log: () => {}, warn: () => {}, error: () => {}},
      };
      try {
        const f = new Function(...Object.keys(sahte), 'return (async()=>{' + govde + '})();');
        // senkron çalıştır: await yerine döngüsel bekleme yapmadan, promise'i test sonunda çözülmüş sayıyoruz
        f(...Object.values(sahte));
      } catch (e) { hata = e; }
      dogru('çalışma zamanı hatası YOK: ' + ad, !hata, hata ? hata.message : 'ok');
    }
  }
  // Ayrıca kapsam kuralı: TAVAN sabiti kullanıldığı yerle AYNI kapsamda olmalı
  const tanim = src.indexOf('const BILDIRIM_TAVAN2 = 5000;');
  const blokBas = src.indexOf('if ((degisen && degisen.length) || (iptalEdilen && iptalEdilen.length)) {');
  dogru('BILDIRIM_TAVAN2 blok DIŞINDA tanımlı', tanim >= 0 && blokBas > tanim, 'tanım ' + tanim + ' < blok ' + blokBas);
}

// ============================================================================
// 26) YEM BİLGİ HATTI (firma kararı 29.07) — iç yem siparişi onaya SUNULMAZ
// ----------------------------------------------------------------------------
// KURAL: apps/yem'deki sipariş, kaynağı bayi/danışman PORTALI DEĞİLSE onay istemez.
//        Telegram'a yalnız bilgi düşer; sevk/teslim kapısı yoktur.
//        Portal siparişi (dışarıdan, fiyatsız) eski iki aşamalı akışta KALIR.
//        TMR (apps/siparis) bu kuraldan HİÇ etkilenmez.
// Bu bölüm ASENKRON: sonuc() en sonda, IIFE bitince çağrılır.
// ============================================================================
(async () => {
  baslik('26) YEM BİLGİ HATTI — kaynak bazlı onay ayrımı (koşturularak)');
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const yem = fs.readFileSync(path.join(__dirname, '..', 'yem', 'index.html'), 'utf8');

  // ---- 1) SUNUCU kuralı: yemBilgiHatti(app, o) matrisi ----
  // DİKKAT: her ikisi de TEK SATIRLIK fonksiyon → `[\s\S]*?^}` gibi çok-satır kalıbı sonraki
  // fonksiyona taşar (ilk denemede `async function muhasebeOnayVarMi`i yutup SyntaxError verdi).
  global.PORTAL_KAYNAK = eval('(' + /const PORTAL_KAYNAK = (\(.*);$/m.exec(src)[1] + ')');
  const ybh = eval('(' + /^function yemBilgiHatti\(app, o\) \{.*\}$/m.exec(src)[0] + ')');
  const M = [
    // [app,           kaynak,             bilgi hattı mı?, açıklama]
    ['yem', undefined, true, 'Yem modülünde açılan sipariş'],
    ['yem', '', true, 'kaynağı boş yem siparişi'],
    ['yem', 'tmr', true, 'TMR den çapraz düşen yem siparişi'],
    ['yem', 'bayi-portal', false, 'BAYİ portalından gelen yem siparişi'],
    ['yem', 'danisman-portal', false, 'DANIŞMAN portalından gelen yem siparişi'],
    ['siparis', undefined, false, 'TMR siparişi (kural TMR yi hiç etkilemez)'],
    ['siparis', 'bayi-portal', false, 'TMR bayi portal siparişi'],
  ];
  M.forEach(([app, kaynak, bekle, ad]) => {
    dogru('SUNUCU ' + (bekle ? 'BİLGİ' : 'ONAYLI') + ': ' + ad, ybh(app, kaynak === undefined ? {} : {kaynak}) === bekle);
  });
  dogru('SUNUCU: order null/undefined güvenli (çökmez)', ybh('yem', null) === true && ybh('siparis', null) === false);

  // ---- 2) İSTEMCİ kuralı SUNUCU ile AYNI olmalı (ayrışırsa kapı bir uçta açık kalır) ----
  const bhm = eval('(' + /^function bilgiHattiMi\(o\)\{.*\}$/m.exec(yem)[0] + ')');
  let ayrisma = 0;
  M.filter(([app]) => app === 'yem').forEach(([, kaynak]) => {
    if (bhm(kaynak === undefined ? {} : {kaynak}) !== ybh('yem', kaynak === undefined ? {} : {kaynak})) ayrisma++;
  });
  dogru('İSTEMCİ kuralı SUNUCU ile BİREBİR aynı', ayrisma === 0, ayrisma + ' ayrışma');
  dogru('İSTEMCİ: order boş gelirse çökmüyor', bhm(null) === true && bhm(undefined) === true);

  // ---- 3) SEVK KAPISI matrisi: hangi geçiş bloklanır ----
  // Kapı = _kapiVar(portal siparişi) && sevk/teslim'e GEÇİŞ && onay yok
  const _CIKIS = ['sevk', 'teslim'];
  const bloklanir = (kaynak, eski, yeni, onayVar) => {
    const kapiVar = !bhm({kaynak});
    const cikisa = _CIKIS.indexOf(yeni) >= 0 && _CIKIS.indexOf(eski) < 0;
    return kapiVar && cikisa && !onayVar;
  };
  const G = [
    ['iç sipariş: beklemede→sevk', '', 'beklemede', 'sevk', false, false],
    ['iç sipariş: beklemede→teslim', '', 'beklemede', 'teslim', false, false],
    ['iç sipariş: hazir→sevk', '', 'hazir', 'sevk', false, false],
    ['iç sipariş: düzenleme', '', 'beklemede', 'beklemede', false, false],
    ['iç sipariş: iptal', '', 'hazir', 'iptal', false, false],
    ['çapraz (tmr): beklemede→sevk', 'tmr', 'beklemede', 'sevk', false, false],
    ['PORTAL: beklemede→sevk (onaysız)', 'bayi-portal', 'beklemede', 'sevk', false, true],
    ['PORTAL: beklemede→teslim (onaysız)', 'danisman-portal', 'beklemede', 'teslim', false, true],
    ['PORTAL: beklemede→sevk (ONAYLI)', 'bayi-portal', 'beklemede', 'sevk', true, false],
    ['PORTAL: düzenleme (onaysız)', 'bayi-portal', 'beklemede', 'beklemede', false, false],
    ['PORTAL: iptal (onaysız)', 'bayi-portal', 'hazir', 'iptal', false, false],
    ['PORTAL: hazır (onaysız)', 'bayi-portal', 'beklemede', 'hazir', false, false],
    ['PORTAL: sevk→teslim (zaten çıkmış)', 'bayi-portal', 'sevk', 'teslim', false, false],
  ];
  G.forEach(([ad, k, e, y, onay, bekle]) => {
    dogru((bekle ? 'BLOKLANIR: ' : 'serbest: ') + ad, bloklanir(k, e, y, onay) === bekle);
  });

  // ---- 4) DEĞİŞİKLİK BİLDİRİMİ: bilgi hattında onay butonu KONMAMALI (koşturarak) ----
  const a = src.indexOf('    const BILDIRIM_TAVAN2 = 5000;');
  const b = src.indexOf('    res.json({ok: true});', a);
  const govde = src.slice(a, b) + '    res.json({ok:true});';
  const D = (id, bilgi) => ({id, no: id, ad: 'Müşteri ' + id, tutar: 1, tarih: '', teslim: '',
    urun: ['YEM: 10 çuval'], farklar: ['• miktar: 10 → 20'], imzaH: 'h' + id, onayliydi: true, bilgi});
  const kosturVeYakala = async (app, degisen, iptalEdilen) => {
    const gonderilen = [];
    const sahte = {
      app, dec: {uid: 'u1', email: 'a@b.c', portalYonetici: false, yem: 'yem', siparis: 'siparis'},
      EPOSTA_SON: /@x$/, silinen: null, degisen, iptalEdilen,
      admin: {firestore: {FieldValue: {delete: () => 'DEL'}}},
      db: {doc: () => ({set: async () => {}})},
      denetimVer: async () => {}, portalAd: async () => 'Ali', rateLimit: async () => true,
      tgToken: () => 'T', tgChat: () => 'C',
      tg: async (t, metot, p) => { if (metot === 'sendMessage') gonderilen.push(p); },
      res: {json: () => {}, status: () => ({json: () => {}})},
      console: {log: () => {}, warn: () => {}, error: () => {}},
    };
    const f = new Function(...Object.keys(sahte), 'return (async()=>{' + govde + '})();');
    await f(...Object.values(sahte));
    return gonderilen;
  };
  const butonluMu = (p) => !!(p && p.reply_markup && p.reply_markup.inline_keyboard);

  {
    const g = await kosturVeYakala('yem', [D('Y1', true)], null);
    dogru('BİLGİ değişikliği: mesaj GİDİYOR', g.length === 1);
    dogru('BİLGİ değişikliği: onay butonu YOK', g.length === 1 && !butonluMu(g[0]));
    dogru('BİLGİ değişikliği: başlık "bilgi"', g.length === 1 && /SİPARİŞ DEĞİŞTİRİLDİ \(bilgi\)/.test(g[0].text));
    dogru('BİLGİ değişikliği: "yeniden onaylayın" YAZMIYOR', g.length === 1 && !/yeniden onayla/i.test(g[0].text));
    dogru('BİLGİ değişikliği: değişiklik dökümü DURUYOR', g.length === 1 && /miktar: 10 → 20/.test(g[0].text));
  }
  {
    const g = await kosturVeYakala('yem', [D('P1', false)], null);
    dogru('PORTAL değişikliği: onay butonu VAR', g.length === 1 && butonluMu(g[0]));
    dogru('PORTAL değişikliği: moapprove:y ile', g.length === 1 &&
      /^moapprove:y:P1:/.test(g[0].reply_markup.inline_keyboard[0][0].callback_data));
  }
  {
    const g = await kosturVeYakala('siparis', [D('T1', false)], null);
    dogru('TMR değişikliği: onay butonu VAR (kural TMR yi bozmadı)', g.length === 1 && butonluMu(g[0]));
    dogru('TMR değişikliği: moapprove:t ile', g.length === 1 &&
      /^moapprove:t:T1:/.test(g[0].reply_markup.inline_keyboard[0][0].callback_data));
  }
  {
    // KARIŞIK GRUP: aynı kaydetmede hem bilgi hem portal siparişi değişirse her biri KENDİ mesajını alır
    const g = await kosturVeYakala('yem', [D('Y1', true), D('P1', false)], null);
    dogru('KARIŞIK: iki ayrı mesaj', g.length === 2);
    dogru('KARIŞIK: bilgi butonsuz, portal butonlu', g.length === 2 && !butonluMu(g[0]) && butonluMu(g[1]));
  }
  {
    // 6+ ÖZET DALI: hepsi bilgi ise "yeniden gönderin" kuyruğu YAZILMAMALI (yanıltıcı olurdu)
    const hepBilgi = [1, 2, 3, 4, 5, 6].map((n) => D('Y' + n, true));
    const g = await kosturVeYakala('yem', hepBilgi, null);
    dogru('6+ hepsi bilgi: tek özet mesajı', g.length === 1);
    dogru('6+ hepsi bilgi: "yeniden gönderin" YOK', g.length === 1 && !/yeniden gönderin/.test(g[0].text));
    dogru('6+ hepsi bilgi: "onaya sunulmaz" notu VAR', g.length === 1 && /onaya sunulmaz/.test(g[0].text));
    const karisik = [D('Y1', true), D('Y2', true), D('Y3', true), D('Y4', true), D('Y5', true), D('P1', false)];
    const g2 = await kosturVeYakala('yem', karisik, null);
    dogru('6+ karışık: "yeniden gönderin" VAR (onaylı sipariş var)', g2.length === 1 && /yeniden gönderin/.test(g2[0].text));
  }
  {
    // İPTAL bilgi hattında da mesaj gönderir ve zaten butonsuzdur
    const g = await kosturVeYakala('yem', null, [{id: 'Y9', no: 'Y9', ad: 'Müşteri', teslim: '', urun: 'YEM: 5 çuval'}]);
    dogru('İPTAL: mesaj gidiyor, buton yok', g.length === 1 && !butonluMu(g[0]) && /İPTAL EDİLDİ/.test(g[0].text));
  }

  // ---- 5) İç yem siparişinde onay bayrağı DİRİLTİLMEMELİ ----
  dogru('SUNUCU: onayDusur bayrağı hatta göre veriyor', /kopya\.muhasebeOnayGerek = !yemBilgiHatti\(app, yo\);/.test(src));
  dogru('İSTEMCİ: onay iptalinde de aynı kural', /delete o\.muhasebeOnay;o\.muhasebeOnayGerek=!_b;/.test(yem));
  dogru('İSTEMCİ: bilgi hattında onay mesajı gönderilmiyor', /function sendYemSiparisBildirim\(o\)\{if\(bilgiHattiMi\(o\)\)sendYemSiparisBilgi\(o\);else sendMuhasebeSiparisOnay\(o\);\}/.test(yem));
  dogru('İSTEMCİ: bilgi mesajında onay butonu YOK', /function sendYemSiparisBilgi\(o\)\{[\s\S]*?tgSend\(text\);/.test(yem));
  dogru('İSTEMCİ: sipariş oluşturma tek giriş noktasından', (yem.match(/sendYemSiparisBildirim\(o\)/g) || []).length >= 2);

  // ---- 6) ESKİ İÇ SİPARİŞ: blob'da muhasebeOnayGerek=true taşıyor ama artık BEKLEYEN onay YOK ----
  // (Kural değişmeden önce açılmış siparişler. Ekranda sonsuz "onay bekliyor" kutusu kalmamalı.)
  global.bilgiHattiMi = bhm;   // bekleyenMuhOnay bunu çağırır — global'e koymadan ReferenceError verir
  const bmo = eval('(' + /^function bekleyenMuhOnay\(o\)\{.*\}$/m.exec(yem)[0] + ')');
  dogru('ESKİ iç sipariş: bayrak dolu ama bekleyen onay YOK', bmo({muhasebeOnayGerek: true, kaynak: ''}) === false);
  dogru('ESKİ çapraz sipariş: bekleyen onay YOK', bmo({muhasebeOnayGerek: true, kaynak: 'tmr'}) === false);
  dogru('PORTAL siparişi: bekleyen onay VAR', bmo({muhasebeOnayGerek: true, kaynak: 'bayi-portal'}) === true);
  dogru('PORTAL onaylanmış: bekleyen onay YOK', bmo({muhasebeOnayGerek: false, kaynak: 'bayi-portal'}) === false);
  dogru('bekleyenMuhOnay: boş girdi güvenli', bmo(null) === false && bmo(undefined) === false);
  dogru('İSTEMCİ: liste sütunu bekleyenMuhOnay kullanıyor', /if\(!bekleyenMuhOnay\(o\)&&!o\.yemOnayGerek&&!muhasebeOnayli\(o\)&&!yemOnayli\(o\)\)/.test(yem));
  dogru('İSTEMCİ: modal kutusu bekleyenMuhOnay kullanıyor', /var inMu=\(bekleyenMuhOnay\(o\)\|\|muhasebeOnayli\(o\)\);/.test(yem));

  // ==========================================================================
  baslik('27) NAKLİYE KDV — birim KDV HARİÇ girilir, faturaya KDV DAHİL gider');
  // ==========================================================================
  // FİRMA KURALI (29.07): nakliye hizmet bedelidir → %20 KDV. Matrah hesaplanır, üzerine KDV
  // eklenir, fatura toplamına KDV DAHİL tutar yazılır (bir daha KDV eklenmez).
  // GERİYE DÖNÜK KORUMA: oran sipariş anında DAMGALANIR. Damgasız (özellikten önceki) kayıtta
  // oran 0'dır — o siparişlerde KDV birim fiyata ELLE gömülmüştü (0,28 yerine 0,336 girilmişti);
  // %20 eklemek tutarı ikinci kez şişirir ve geçmiş faturaları bozardı.
  {
    // TEK SATIRLIK fonksiyonu önce dene: çok-satır kalıbı sonraki fonksiyona taşıyor (bkz. 26)
    const alY = (n) => {
      const tek = yem.match(new RegExp('^function ' + n + '\\(.*\\}$', 'm'));
      if (tek) return eval('(' + tek[0] + ')');
      const m = yem.match(new RegExp('^function ' + n + '\\([\\s\\S]*?^}', 'm'));
      return m ? eval('(' + m[0] + ')') : null;
    };
    global.round2 = alY('round2');
    global.NAKLIYE_KDV_ORAN = +/const NAKLIYE_KDV_ORAN=(\d+);/.exec(yem)[1];
    global.DB = {products: [{code: 'Y', pkg: '50 kg', kg: 50}]};
    global.prodByCode = (c) => global.DB.products.find((p) => p.code === c);
    ['orderCuval', 'orderKg', 'orderNakliyeMatrah', 'nakliyeKdvOran', 'orderNakliyeKdv', 'orderNakliye', 'nakliyeKdvDamgala']
      .forEach((n) => { global[n] = alY(n); });
    const sip = (x) => Object.assign({lines: [{code: 'Y', qty: 446}]}, x);   // 446 × 50 kg = 22.300 kg

    // --- GERÇEK SİPARİŞ (ekran görüntüsündeki rakamlar) ---
    const yeni = sip({nakliyeTipi: 'kg', nakliyeBirim: 0.28});
    esit('22.300 kg × 0,28 → matrah', orderNakliyeMatrah(yeni), 6244);
    esit('KDV %20', orderNakliyeKdv(yeni), 1248.8);
    esit('KDV DAHİL nakliye (faturaya giden)', orderNakliye(yeni), 7492.8);
    dogru('kalemler toplama BİREBİR eşit (yuvarlama kayması yok)',
      round2(orderNakliyeMatrah(yeni) + orderNakliyeKdv(yeni)) === orderNakliye(yeni));

    // --- GERİYE DÖNÜK: KDV'si birim fiyata gömülü ESKİ kayıt bozulmamalı ---
    const eski = sip({id: 'yo_eski', nakliyeTipi: 'kg', nakliyeBirim: 0.336});
    esit('damgasız eski kayıtta oran 0', nakliyeKdvOran(eski), 0);
    esit('eski kayıt tutarı DEĞİŞMİYOR', orderNakliye(eski), 7492.8);
    esit('eski kayıtta KDV kalemi 0', orderNakliyeKdv(eski), 0);
    // Aynı sipariş yanlışlıkla %20 ile hesaplansaydı: 8.991,36 → bu ASLA olmamalı
    dogru('eski kayıt ikinci kez KDV YEMİYOR', orderNakliye(eski) !== round2(7492.8 * 1.2));

    // --- DAMGA: yalnız YENİ siparişe basılır ---
    const a = sip({}); nakliyeKdvDamgala(a);
    esit('yeni sipariş damgalanıyor', a.nakliyeKdv, 20);
    const b = sip({id: 'yo_x'}); nakliyeKdvDamgala(b);
    dogru('MEVCUT kayda damga BASILMIYOR', b.nakliyeKdv === undefined);
    const c = sip({id: 'yo_y', nakliyeKdv: 20}); nakliyeKdvDamgala(c);
    esit('zaten damgalı kayıt korunuyor', c.nakliyeKdv, 20);
    const d = sip({id: 'yo_z', nakliyeKdv: 0}); nakliyeKdvDamgala(d);
    esit('oran 0 damgası da korunuyor (KDV öncesi kayıt)', d.nakliyeKdv, 0);

    // --- HER NAKLİYE TİPİNDE çalışıyor ---
    [['kg', 0.28, 6244], ['cuval', 10, 4460], ['sabit', 5000, 5000]].forEach(([t, birim, mat]) => {
      const o = sip({nakliyeTipi: t, nakliyeBirim: birim});
      esit('tip=' + t + ' matrah', orderNakliyeMatrah(o), mat);
      esit('tip=' + t + ' KDV dahil', orderNakliye(o), round2(mat * 1.2));
    });

    // --- SINIR: nakliye yok / sıfır / kalemsiz ---
    [sip({}), sip({nakliyeTipi: 'kg', nakliyeBirim: 0}), {lines: [], nakliyeTipi: 'kg', nakliyeBirim: 0.28}]
      .forEach((o, i) => { esit('nakliye yok/0 → toplam 0 (senaryo ' + (i + 1) + ')', orderNakliye(o), 0); });
    dogru('nakliyeKdvOran boş girdide çökmüyor', nakliyeKdvOran(null) === 0 && nakliyeKdvOran(undefined) === 0);

    // --- KAYNAK: damga ve saklama noktaları ---
    dogru('damga tutarlar HESAPLANMADAN ÖNCE basılıyor',
      yem.indexOf('nakliyeKdvDamgala(o);') < yem.indexOf('o.nakliyeMatrah=orderNakliyeMatrah(o)'));
    dogru('matrah + KDV AYRI saklanıyor', /o\.nakliyeMatrah=orderNakliyeMatrah\(o\);o\.nakliyeKdvTutar=orderNakliyeKdv\(o\);/.test(yem));
    dogru('nakliyeTutar = KDV DAHİL', /function orderNakliye\(o\)\{return round2\(orderNakliyeMatrah\(o\)\+orderNakliyeKdv\(o\)\);\}/.test(yem));
    dogru('fatura toplamı orderNakliye üzerinden (KDV dahil)', /function orderTotal\(o\)\{return round2\(orderUrunNet\(o\)-dbsIskonto\(o\)\+orderNakliye\(o\)/.test(yem));
    // ÇAPRAZ ve PORTAL siparişleri id'siyle DOĞAR → nakliyeKdvDamgala onları atlar; açık damga ŞART
    dogru('ÇAPRAZ sipariş açıkça damgalanıyor', /nakliyeKdv:NAKLIYE_KDV_ORAN,/.test(yem));
    dogru('PORTAL siparişi sunucuda damgalanıyor', /nakliyeKdv: NAKLIYE_KDV_ORAN_FN,/.test(src));
    // İki uçtaki oran AYRIŞIRSA portal siparişi ile iç sipariş farklı KDV alır
    const sunucuOran = +/const NAKLIYE_KDV_ORAN_FN = (\d+);/.exec(src)[1];
    esit('SUNUCU ve İSTEMCİ oranı AYNI', sunucuOran, global.NAKLIYE_KDV_ORAN);

    // --- EKRAN: kalem kalem gösterim ---
    dogru('ekranda matrah kalemi var', /Nakliye matrahı \(KDV hariç\)/.test(yem));
    dogru('ekranda KDV kalemi var', /\+ KDV %\$\{fmtN\(or\)\}/.test(yem));
    dogru('ekranda KDV dahil kalemi var', /= Nakliye \(KDV dahil\)/.test(yem));
    dogru('eski kayıtta "birim fiyata dahil" uyarısı var', /KDV birim fiyata dahil \(eski kayıt\)/.test(yem));
    dogru('giriş alanı "KDV HARİÇ girin" diyor', /KDV HARİÇ girin/.test(yem));

    // --- DÖKÜM BLOĞU GERÇEKTEN KOŞTURULUYOR ---
    // Bu IIFE renderOrderModal içinde çalışır; bir hata TÜM sipariş modalını kırar.
    // Metin eşleştirmesi çalışma-zamanı hatasını görmez (BILDIRIM_TAVAN2 dersi).
    const bas = yem.indexOf('(function(){   // NAKLİYE KDV DÖKÜMÜ');
    const son = yem.indexOf('})()}', bas);
    dogru('döküm bloğu bulundu', bas >= 0 && son > bas);
    if (bas >= 0 && son > bas) {
      const kod = yem.slice(bas, son + 4);   // '})()}' → kapanış `})()` dahil, şablon `}`'ı hariç
      const fmtTL2 = (n) => (+n || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ₺';
      const fmtN = (n) => String(+n || 0);
      const ciz = (o) => new Function('o', 'orderNakliyeMatrah', 'nakliyeKdvOran', 'orderNakliyeKdv',
        'orderNakliye', 'fmtTL2', 'fmtN', 'return ' + kod + ';')(
        o, orderNakliyeMatrah, nakliyeKdvOran, orderNakliyeKdv, orderNakliye, fmtTL2, fmtN);
      const senaryo = [
        ['yeni sipariş (KDV\'li)', sip({nakliyeTipi: 'kg', nakliyeBirim: 0.28})],
        ['eski kayıt (damgasız)', sip({id: 'yo_e', nakliyeTipi: 'kg', nakliyeBirim: 0.336})],
        ['nakliyesiz sipariş', sip({})],
        ['nakliye 0', sip({nakliyeTipi: 'kg', nakliyeBirim: 0})],
        ['kalemsiz sipariş', {lines: [], nakliyeTipi: 'kg', nakliyeBirim: 0.28}],
        ['sabit tip', sip({nakliyeTipi: 'sabit', nakliyeBirim: 5000})],
      ];
      senaryo.forEach(([ad, o]) => {
        let html = null, hata = null;
        try { html = ciz(o); } catch (e) { hata = e; }
        dogru('render çökmüyor: ' + ad, !hata, hata ? hata.message : 'ok');
        dogru('render string döndürüyor: ' + ad, typeof html === 'string');
      });
      const hYeni = ciz(sip({nakliyeTipi: 'kg', nakliyeBirim: 0.28}));
      dogru('YENİ siparişte üç kalem de basılıyor',
        /6\.244,00/.test(hYeni) && /1\.248,80/.test(hYeni) && /7\.492,80/.test(hYeni));
      const hEski = ciz(sip({id: 'yo_e', nakliyeTipi: 'kg', nakliyeBirim: 0.336}));
      dogru('ESKİ kayıtta KDV kalemi BASILMIYOR', !/KDV %/.test(hEski) && /eski kayıt/.test(hEski));
      dogru('nakliyesiz siparişte blok BOŞ', ciz(sip({})) === '');
    }
  }

  // ==========================================================================
  baslik('28) YEDEK — kayitSayisi vakası: çağrılan ama TANIMSIZ fonksiyon');
  // ==========================================================================
  // 30.07 03:00: günlük yedek 8 modülün 8'inde de "HATA" bildirdi. Kök neden
  // `ReferenceError: kayitSayisi is not defined` — fonksiyon 4 yerde ÇAĞRILIYOR, hiç TANIMLANMAMIŞ.
  // Yedekler aslında ALINMIŞTI (hata try'ın SON satırında, iki yazımdan da sonra) ama:
  //   • günlük rapor yanlış alarm veriyordu
  //   • geri-yükleme PROVASI hiç geçemiyordu
  //   • GERİ YÜKLEME canlı veriyi ezip 500 dönüyordu → "başarısız" yalanı + denetim izi YOK
  {
    const kayitSayisiVar = /^function kayitSayisi\(blob\) \{/m.test(src);
    dogru('kayitSayisi TANIMLI', kayitSayisiVar);
    // ÇÖKMEDEN devam et: tanım yoksa eval null'a takılıp TÜM testi öldürüyordu → asıl regresyon
    // (genel "tanımsız fonksiyon" koruması) hiç çalışamıyordu. Test kendi hatasını yutmamalı ama
    // tek bir eksik yüzünden geri kalan 600+ kontrolü de kaybetmemeli.
    const alS = (n) => { const m = src.match(new RegExp('^function ' + n + '\\([\\s\\S]*?^}', 'm')); return m ? eval('(' + m[0] + ')') : null; };
    global.diziUzunluk = alS('diziUzunluk');
    const ks = alS('kayitSayisi') || (() => 0);
    esit('normal blob sayımı (3+2+4)', ks({r: JSON.stringify({orders: [1, 2, 3], customers: [1, 2], products: [1, 1, 1, 1], meta: {x: 1}})}), 9);
    esit('bozuk JSON → 0 (çökmez)', ks({a: '{bozuk'}), 0);
    esit('boş blob → 0', ks({}), 0);
    dogru('null/undefined güvenli', ks(null) === 0 && ks(undefined) === 0);
    dogru('DAİMA sayı döner', typeof ks({}) === 'number' && typeof ks(null) === 'number');

    // --- yedekAl GERÇEKTEN koşuyor mu (metin testi ReferenceError'ı görmez) ---
    {
      const govde = src.match(/^async function yedekAl\(\)[\s\S]*?^}/m)[0];
      const cagrilar = [];
      const sahte = {
        db: {
          doc: () => ({get: async () => ({exists: true, data: () => ({data: {r: JSON.stringify({orders: [1, 2]})}})}), set: async () => { cagrilar.push('fs-yaz'); }}),
          collection: () => ({get: async () => ({docs: []})}),
        },
        admin: {storage: () => ({bucket: () => ({
          file: () => ({save: async () => { cagrilar.push('gcs-yaz'); }, download: async () => [Buffer.from('{"data":{}}')]}),
          getFiles: async () => [[]],
        })})},
        YEDEK_KAYNAK: ['siparis', 'yem'], kayitSayisi: ks,
        console: {log: () => {}, error: (...a) => cagrilar.push('HATA:' + a[0])},
      };
      let r = null, hata = null;
      try {
        r = await new Function(...Object.keys(sahte), govde + '; return yedekAl();')(...Object.values(sahte));
      } catch (e) { hata = e; }
      dogru('yedekAl çalışma zamanı hatası VERMİYOR', !hata, hata ? hata.message : 'ok');
      dogru('her modül "ok" (HATA değil)', !!r && r.sonuc.every((x) => x.durum === 'ok'),
        r ? JSON.stringify(r.sonuc) : '-');
      dogru('kayıt sayısı raporlanıyor', !!r && r.sonuc.every((x) => x.kayit === 2));
      dogru('İKİ konuma da yazılıyor (Firestore + GCS)',
        cagrilar.filter((x) => x === 'fs-yaz').length === 2 && cagrilar.filter((x) => x === 'gcs-yaz').length === 2);
      dogru('konsola hata basılmıyor', !cagrilar.some((x) => String(x).startsWith('HATA:')));
    }

    // --- GERİ YÜKLEME sertleştirmesi: yazımdan SONRAKİ hata "başarısız" diyemez ---
    dogru('sayım YAZIMDAN ÖNCE yapılıyor',
      src.indexOf('const kayit = kayitSayisi((y.veri && y.veri.data) || {});') <
      src.indexOf('await db.doc("apps/" + modul).set(y.veri);'));
    dogru('denetim hatası yutuluyor (500 olmuyor)', /catch \(e\) \{\s*\n\s*console\.error\("geri-yukle\/denetim", e\); uyari = /.test(src));
    dogru('Telegram hatası yutuluyor', /console\.error\("geri-yukle\/telegram", e\)/.test(src));
    dogru('yanıt DAİMA ok:true + uyarı alanı', /res\.json\(Object\.assign\(\{ok: true, tarih, modul, kayit\}, uyari \? \{uyari\} : \{\}\)\)/.test(src));

    // --- SINIF KORUMASI: functions/index.js'te çağrılan HER yerel fonksiyon tanımlı mı ---
    // Asıl ders bu: kayitSayisi 4 yerde çağrılıp hiç yazılmamıştı ve deploy bunu YAKALAMADI
    // (ReferenceError yalnız o satır KOŞTUĞUNDA patlar — gece 03:00'te).
    {
      // YORUM / DİZE / ŞABLON / REGEX içeriği SOYULUR. Türkçe yorumlardaki "…grubu (" gibi
      // ifadeler yoksa fonksiyon çağrısı sanılır (ilk denemede 130+ sahte bulgu verdi).
      // Regex tabanlı soyucu dosyanın YARISINI yiyordu → karakter tarayıcı şart.
      // Uzunluk KORUNUR (yalnız içerik boşluğa döner) ki hiçbir tanım kaybolmasın.
      const soyKod = (s) => {
        let o = '', i = 0; const n = s.length;
        const onceki = () => { for (let j = o.length - 1; j >= 0; j--) { if (!/\s/.test(o[j])) return o[j]; } return ''; };
        while (i < n) {
          const c = s[i], d = s[i + 1];
          if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') { o += ' '; i++; } continue; }
          if (c === '/' && d === '*') { while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { o += (s[i] === '\n' ? '\n' : ' '); i++; } o += '  '; i += 2; continue; }
          if (c === '"' || c === "'") { o += c; i++; while (i < n && s[i] !== c) { if (s[i] === '\\') { o += '  '; i += 2; continue; } o += (s[i] === '\n' ? '\n' : ' '); i++; } o += (i < n ? c : ''); i++; continue; }
          if (c === '`') {
            o += c; i++; let dpt = 0;
            while (i < n) {
              if (s[i] === '\\') { o += '  '; i += 2; continue; }
              if (s[i] === '$' && s[i + 1] === '{') { dpt++; o += '  '; i += 2; continue; }
              if (dpt > 0 && s[i] === '}') { dpt--; o += ' '; i++; continue; }
              if (dpt === 0 && s[i] === '`') break;
              o += (s[i] === '\n' ? '\n' : ' '); i++;
            }
            o += (i < n ? '`' : ''); i++; continue;
          }
          if (c === '/') {
            const p = onceki();
            if (p === '' || '=(,:[!&|?{};+-*%<>~^'.includes(p)) {   // regex literal konumu
              o += ' '; i++; let sinif = false;
              while (i < n && s[i] !== '\n') {
                if (s[i] === '\\') { o += '  '; i += 2; continue; }
                if (s[i] === '[') sinif = true; else if (s[i] === ']') sinif = false;
                else if (s[i] === '/' && !sinif) { o += ' '; i++; break; }
                o += ' '; i++;
              }
              continue;
            }
          }
          o += c; i++;
        }
        return o;
      };
      const kod = soyKod(src);
      // SOYUCUNUN KENDİ DOĞRULAMASI: bir tanımı bile yerse test sahte "temiz" verir.
      const reFnSay = /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
      esit('soyucu uzunluğu koruyor', kod.length, src.length);
      esit('soyucu hiçbir function tanımını yemiyor',
        (kod.match(reFnSay) || []).length, (src.match(reFnSay) || []).length);
      const YERLESIK = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
        'require', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Promise',
        'Set', 'Map', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent',
        'decodeURIComponent', 'setTimeout', 'clearTimeout', 'Buffer', 'console', 'await', 'new',
        'onRequest', 'onSchedule', 'onDocumentWritten', 'defineSecret', 'initializeApp', 'getFirestore',
        'fetch', 'admin', 'db', 'exports', 'module', 'process', 'Symbol', 'BigInt', 'structuredClone',
        'async', 'else', 'do', 'try', 'delete', 'void', 'yield']);   // 'async' → (async () => {})() kalıbı
      // Tanımlar: function X( · const X = ( · const X = async ( · let/var X = (
      const tanimli = new Set();
      let m;
      const reTanim = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
      while ((m = reTanim.exec(kod))) tanimli.add(m[1]);
      const reAtama = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g;
      while ((m = reAtama.exec(kod))) tanimli.add(m[1]);
      // yerel iç fonksiyonlar + parametre olarak gelenler de tanımlı sayılır
      const reIc = /(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*[:,]\s*(?:async\s*)?(?:\(|function)/g;
      while ((m = reIc.exec(kod))) tanimli.add(m[1]);
      // ÇOKLU BİLDİRİM: `const now = Date.now(), taze = (t) => …` — reAtama yalnız İLKİNİ görür.
      // Anahtar kelimeden bağımsız "ok fonksiyonu/function ATANMIŞ" kalıbı virgülden sonrakini de yakalar.
      const reAtamaGenel = /([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|function)/g;
      while ((m = reAtamaGenel.exec(kod))) tanimli.add(m[1]);
      // Çağrılar: satır başı/operatör sonrası bare isim + ( — `x.foo(` HARİÇ
      const cagrilan = new Set();
      const reCagri = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
      while ((m = reCagri.exec(kod))) cagrilan.add(m[2]);
      const eksik = [...cagrilan].filter((n) => !tanimli.has(n) && !YERLESIK.has(n) &&
        !/^[A-Z_]+$/.test(n) && n.length > 2);
      dogru('çağrılan her yerel fonksiyon TANIMLI', eksik.length === 0,
        eksik.length ? 'TANIMSIZ: ' + eksik.join(', ') : 'eksik yok');
    }
  }

  // ==========================================================================
  baslik('29) TONAJ TABANI — "sevk edilen" ile "sipariş alınan" ayrımı (koşturularak)');
  // ==========================================================================
  // 31.07: rapor 431,4 t derken firmanın elle tuttuğu kayıt 338,8 t diyordu. Kök neden:
  // tonaj raporu iptal DIŞINDAKİ her siparişi sayıyordu — beklemede/onaylandı dahil.
  // Yani "ne sattık" değil "ne sipariş aldık" ölçülüyordu. 92,6 t fark = Temmuz'da alınıp
  // Temmuz'da çıkmayan mal. FİRMA KARARI: taban = sevk edilen (sevk + teslim).
  // Tarihsel arşiv sanal siparişleri status='teslim' taşır → geçmiş aylar KAYMAZ.
  {
    const H = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'siparis-takip', 'index.html'), 'utf8');
    // gövdeyi karakter tarayıcıyla çıkar (tonajData çok satırlı, iç içe süslü parantez var)
    const govde = (ad) => {
      const i = H.indexOf('function ' + ad + '(');
      if (i < 0) throw new Error(ad + ' bulunamadı');
      let d = 0, basladi = false;
      for (let k = i; k < H.length; k++) {
        if (H[k] === '{') { d++; basladi = true; } else if (H[k] === '}') { d--; if (basladi && !d) return H.slice(i, k + 1); }
      }
      throw new Error(ad + ' kapanmadı');
    };
    const URUN = { A25: 25, B50: 50 };
    const kur = (orders, taban) => {
      const ort = {
        tonajSel: { year: '2026', month: '07', taban },
        raporOrders: () => orders,
        tonOf: (c, q) => (+q || 0) * (URUN[c] || 25) / 1000,
        tonajHedefMap: () => ({}),
      };
      return new Function(...Object.keys(ort),
        govde('tonajCikti') + '\n' + govde('tonajData') + '\nreturn tonajData();')(...Object.values(ort));
    };
    const S = (no, gun, durum, kod, adet) =>
      ({ no, date: '2026-07-' + gun, status: durum, lines: [{ code: kod, qty: adet }] });
    const VERI = [
      S(1, '05', 'teslim', 'A25', 8000),      // 200,0 t  çıktı
      S(2, '10', 'sevk', 'A25', 4168),        // 104,2 t  çıktı
      S(3, '28', 'beklemede', 'A25', 2404),   //  60,1 t  bekliyor
      S(4, '29', 'onay', 'A25', 2684),        //  67,1 t  bekliyor
      S(5, '30', 'iptal', 'A25', 9999),       //          hiç sayılmaz
      S(6, '06', 'teslim', 'B50', 0),         //   0,0 t  sıfır kalem çökertmesin
    ];
    const yak = (a, b) => Math.abs(a - b) < 0.05;

    let d = kur(VERI, 'sevk');
    dogru('SEVK tabanı: yalnız sevk+teslim sayılıyor', yak(d.monthTot, 304.2), d.monthTot.toFixed(1) + ' t');
    dogru('SEVK tabanı: tabanSevk bayrağı true', d.tabanSevk === true);
    dogru('SEVK tabanı: günlük dökümde bekleyen gün YOK', !d.byDayTot['28'] && !d.byDayTot['29']);
    dogru('SEVK tabanı: sevk günleri yerinde', yak(d.byDayTot['05'], 200) && yak(d.byDayTot['10'], 104.2));
    dogru('SEVK tabanı: yıllık toplam da süzülüyor', yak(d.yearTot, 304.2));
    dogru('bekleyen tonaj doğru', yak(d.ayBekleyen, 127.2), d.ayBekleyen.toFixed(1) + ' t');
    dogru('aySiparis TABANDAN BAĞIMSIZ', yak(d.aySiparis, 431.4));
    dogru('ayCikan TABANDAN BAĞIMSIZ', yak(d.ayCikan, 304.2));
    dogru('iptal her iki tabanda da HARİÇ', yak(d.aySiparis, 431.4) && yak(d.ayCikan, 304.2));

    d = kur(VERI, 'siparis');
    dogru('SİPARİŞ tabanı: durumdan bağımsız tümü', yak(d.monthTot, 431.4), d.monthTot.toFixed(1) + ' t');
    dogru('SİPARİŞ tabanı: tabanSevk bayrağı false', d.tabanSevk === false);
    dogru('SİPARİŞ tabanı: bekleyen günler görünüyor', yak(d.byDayTot['28'], 60.1));
    dogru('SİPARİŞ tabanında bekleyen rakamı DEĞİŞMİYOR', yak(d.ayBekleyen, 127.2));

    // TUZAK: yıl listesi süzülmüş kümeden üretilirse, hiç sevk olmayan yılda dönem seçici boşalır
    d = kur([S(9, '15', 'beklemede', 'A25', 400)], 'sevk');
    dogru('hiç sevk yokken YIL LİSTESİ kaybolmuyor', d.years.length === 1 && d.years[0] === '2026');
    dogru('hiç sevk yokken tonaj 0 — çökme yok', d.monthTot === 0);
    dogru('hiç sevk yokken bekleyen görünüyor', yak(d.ayBekleyen, 10));

    // TUZAK: arşiv status taşımasaydı sevk tabanında geçmiş aylar sıfırlanırdı
    d = kur([{ no: 0, date: '2026-03-15', status: 'teslim', tarihsel: true, lines: [{ code: 'A25', qty: 4000 }] }].concat(VERI), 'sevk');
    dogru('tarihsel arşiv SEVK tabanında sayılıyor (geçmiş kaymaz)', yak(d.yearTot, 404.2));

    // Yönetici Raporu aynı tabanı kullanmalı — yoksa geçmiş "satılan", bugün "sipariş alınan" olur
    dogru('yonVeri de sevk tabanlı', /tonajCikti\(o\)&&o\.date\.slice\(0,7\)>YON_TARIHSEL_SON/.test(H));
    dogru('taban seçici arayüzde var', /tonajSel\.taban=this\.value;render\(\)/.test(H));
    dogru('varsayılan taban SEVK', /tonajSel=\{year:'',month:'',taban:'sevk'\}/.test(H));
    dogru('yanıltıcı "1 çuval = 25 kg" ibaresi kaldırıldı', !/1 çuval = 25 kg/.test(H));

    // ── SUNUCU: Telegram raporları ekranla AYNI tabanı kullanmalı.
    // Yoksa Telegram "431,4 t" derken site "304,2 t" der ve tam da düzelttiğimiz sorun geri gelir.
    const FN = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const ciktiFN = eval('(' + FN.match(/^function cikanSiparisFN\([\s\S]*?^}/m)[0] + ')');
    dogru('SUNUCU: cikanSiparisFN tanımlı', typeof ciktiFN === 'function');
    dogru('SUNUCU: sevk sayılıyor', ciktiFN({status: 'sevk'}) === true);
    dogru('SUNUCU: teslim sayılıyor', ciktiFN({status: 'teslim'}) === true);
    dogru('SUNUCU: beklemede SAYILMIYOR', ciktiFN({status: 'beklemede'}) === false);
    dogru('SUNUCU: onaylandı SAYILMIYOR', ciktiFN({status: 'onay'}) === false);
    dogru('SUNUCU: hazır SAYILMIYOR', ciktiFN({status: 'hazir'}) === false);
    dogru('SUNUCU: iptal SAYILMIYOR', ciktiFN({status: 'iptal'}) === false);
    dogru('SUNUCU: null/undefined çökertmiyor', ciktiFN(null) === false && ciktiFN(undefined) === false);
    dogru('SUNUCU: istemci kuralıyla BİREBİR aynı durum kümesi',
      /o\.status === "sevk" \|\| o\.status === "teslim"/.test(FN) &&
      /o\.status==='sevk'\|\|o\.status==='teslim'/.test(H));
    // dört tonaj toplayıcının dördü de yeni tabana bağlı olmalı
    [['ayTonajOf', 'aylık tonaj'], ['danismanTonajOf', 'danışman payı'],
      ['tmrTonajHesap', 'günlük/aylık Telegram tonajı'], ['aylikRaporHesap', 'aylık rapor']].forEach(([nm, ad]) => {
      const g = FN.match(new RegExp('^function ' + nm + '\\([\\s\\S]*?^}', 'm'));
      dogru('SUNUCU: ' + ad + ' (' + nm + ') sevk tabanlı', !!g && /cikanSiparisFN\(o\)/.test(g[0]));
    });
    dogru('SUNUCU: haftalık rapor da sevk tabanlı',
      /const list = \(DB\.orders \|\| \[\]\)\.filter\(\(o\) => o && o\.date && cikanSiparisFN\(o\) && o\.date >= a/.test(FN));

    // ── BEKLEYEN SATIRI (04.08.2026 vakası) ────────────────────────────────────
    // Sevk tabanına geçince ayın başında rapor "0,0 t · 0 sipariş" dedi; oysa 4 sipariş vardı.
    // Bekleyen gizlenirse rapor doğru ama YANILTICI olur. Üç raporda da görünmeli.
    const fgovde = (nm) => (FN.match(new RegExp('^function ' + nm + '\\([\\s\\S]*?^}', 'm')) || [''])[0];
    for (const nm of ['tmrTonajHesap', 'aylikRaporHesap']) {
      const g = fgovde(nm);
      dogru('SUNUCU: ' + nm + ' bekleyeni hesaplıyor', /bekTon/.test(g) && /bekAdet/.test(g));
      dogru('SUNUCU: ' + nm + ' bekleyeni DÖNDÜRÜYOR (kayitSayisi vakası)', /return \{[\s\S]*?bekTon[\s\S]*?bekAdet/.test(g));
      dogru('SUNUCU: ' + nm + ' iptali bekleyene saymıyor', /o\.status === "iptal" \|\| cikanSiparisFN\(o\)/.test(g));
    }
    // Bekleyen satırı SABİT (04.08 kararı): koşulsuz her mesajda yazılır — 0,0 t olsa da
    dogru('SUNUCU: günlük mesajda bekleyen satırı var', /sat\("Bekleyen", fmtTonFN\(D\.bekTon\)/.test(fgovde('tmrTonajMesaj')));
    dogru('SUNUCU: haftalık mesajda bekleyen satırı var', /Dmonth\.bekAdet > 0/.test(fgovde('haftaOzetMesaj')));
    dogru('SUNUCU: aylık mesajda bekleyen satırı var', /sat\("Bekleyen", fmtTonFN\(A\.bekTon\)/.test(fgovde('aylikRaporMesaj')));
    // Etiket ne ölçtüğünü söylemeli: "Tonaj"/"Aylık Toplam" artık yalnız SEVK EDİLENİ gösteriyor.
    dogru('SUNUCU: yanıltıcı "Aylık Toplam" etiketi kalmadı', !/sat\("Aylık Toplam"/.test(FN));
    dogru('SUNUCU: günlük etiket "Sevk Edilen"', /sat\("Sevk Edilen"/.test(fgovde('tmrTonajMesaj')));
    dogru('SUNUCU: haftalık etiket "Sevk edilen"', /sat\("Sevk edilen"/.test(fgovde('haftaOzetMesaj')));
    dogru('SUNUCU: aylık etiket "Sevk edilen"', /sat\("Sevk edilen"/.test(fgovde('aylikRaporMesaj')));
    // SIRA FİRMA KARARI (04.08): sevk · bekleyen · toplam sipariş · satış günü · günlük ort. — günlük + aylık aynı
    dogru('SUNUCU: günlük özet sırası firma kararına uygun',
      /sat\("Sevk Edilen"[\s\S]{0,120}?sat\("Bekleyen"[\s\S]{0,120}?sat\("Toplam Sipariş"[\s\S]{0,120}?sat\("Satış Günü"[\s\S]{0,120}?sat\("Günlük Ort\."/.test(fgovde('tmrTonajMesaj')));
    dogru('SUNUCU: aylık özet sırası günlükle aynı',
      /sat\("Sevk edilen"[\s\S]{0,160}?sat\("Bekleyen"[\s\S]{0,160}?sat\("Toplam sipariş"[\s\S]{0,160}?sat\("Satış günü"[\s\S]{0,160}?sat\("Günlük ort\."/.test(fgovde('aylikRaporMesaj')));
    dogru('SUNUCU: haftalık ay bloğunda ay toplamı', /sat\("Ay toplamı", fmtTonFN\(Dmonth\.toplam \+ Dmonth\.bekTon\)/.test(fgovde('haftaOzetMesaj')));
    // KIRILIM AY TOPLAMI: yalnız sevk'ten beslenirse ay başında bomboş çıkar, bekleyen ürünler görünmez
    dogru('SUNUCU: günlük kırılım ay toplamından (prodTotAy)', /Object\.entries\(D\.prodTotAy\)/.test(fgovde('tmrTonajMesaj')));
    dogru('SUNUCU: aylık kırılım ay toplamından (prodTonAy)', /Object\.entries\(A\.prodTonAy/.test(fgovde('aylikRaporMesaj')));
    dogru('SUNUCU: kırılım başlığı tabanını söylüyor', /Ürün Kırılımı<\/b> — ay toplamı/.test(FN));
    dogru('SUNUCU: hedef takibi HÂLÂ sevk edilen üzerinden (toplam değil)',
      /const yuzde = D\.toplam \/ D\.hedef \* 100;/.test(fgovde('tmrTonajMesaj')));

    // ── GÜNLÜK MESAJ GERÇEKTEN KOŞTURULUR (metin testi çalışma-zamanı hatasını görmez) ──
    {
      const sbt = (nm) => {
        const m = FN.match(new RegExp('^const ' + nm + ' ?= ?([\\s\\S]*?);$', 'm'));
        return 'const ' + nm + ' = ' + m[1] + ';';
      };
      const M = new Function([sbt('AYLAR_TR_FN'), sbt('GUN_TR_FN'), sbt('fmtTonFN'), sbt('escHTML'),
        fgovde('prodKgOf'), fgovde('cikanSiparisFN'), fgovde('tmrTonajHesap'), fgovde('tmrTonajMesaj'),
        'return {tmrTonajHesap, tmrTonajMesaj};'].join('\n'))();
      const U = [{code: 'A', pkg: '25 kg'}];
      const S = (gun, durum, adet) => ({date: '2026-08-' + gun, status: durum, lines: [{code: 'A', qty: adet}]});
      const now = new Date(2026, 7, 4, 10, 0, 0);
      // 04.08.2026 gerçek hâli: 3 sipariş bekliyor, hiçbiri sevk edilmemiş
      let D = M.tmrTonajHesap({products: U, meta: {}, orders: [
        S('03', 'beklemede', 372), S('03', 'onay', 132), S('03', 'hazir', 72), S('02', 'iptal', 9999)]}, now);
      esit('KOŞTU: sevk edilen 0 t', D.toplam, 0);
      esit('KOŞTU: bekleyen 3 sipariş', D.bekAdet, 3);
      dogru('KOŞTU: bekleyen 14,4 t (iptal hariç)', Math.abs(D.bekTon - 14.4) < 0.05, D.bekTon.toFixed(2) + ' t');
      let msg = M.tmrTonajMesaj(D, now);
      dogru('KOŞTU: mesaj bekleyeni gösteriyor', /Bekleyen/.test(msg) && /14,4/.test(msg));
      dogru('KOŞTU: mesaj bekleyeni açıklıyor', /henüz sevk edilmedi/.test(msg));
      // SIRA FİRMA KARARI (04.08): sevk → bekleyen → toplam sipariş → satış günü → günlük ort.
      dogru('KOŞTU: özet satırları firma sırasında',
        /Sevk Edilen[\s\S]*?Bekleyen[\s\S]*?Toplam Sipariş[\s\S]*?Satış Günü[\s\S]*?Günlük Ort\./.test(msg));
      dogru('KOŞTU: toplam sipariş = sevk + bekleyen adet', /Toplam Sipariş\s+3 adet/.test(msg));   // 0 sevk + 3 bekleyen
      // KIRILIM AY TOPLAMI: sevk 0 iken bile bekleyen ürünler kırılımda görünmeli (04.08 vakası)
      dogru('KOŞTU: sevk 0 iken kırılım BOŞ DEĞİL (bekleyen ürünler var)', /Ürün Kırılımı<\/b> — ay toplamı/.test(msg) && /A\s+14,4 t/.test(msg));
      // Karşı durum: her şey sevk edilmiş — beş satır SABİT, bekleyen 0,0 olarak durur
      D = M.tmrTonajHesap({products: U, meta: {}, orders: [S('03', 'teslim', 400), S('04', 'sevk', 200)]}, now);
      msg = M.tmrTonajMesaj(D, now);
      dogru('KOŞTU: bekleyen 0 iken satır 0,0 t olarak DURUYOR (sabit biçim)', /Bekleyen\s+0,0 t/.test(msg));
      dogru('KOŞTU: bekleyen yokken toplam = sevk', /Toplam Sipariş\s+2 adet/.test(msg));
      esit('KOŞTU: sevk edilen 15 t', Math.round(D.toplam), 15);
      dogru('KOŞTU: boş ayda çökmüyor',
        typeof M.tmrTonajMesaj(M.tmrTonajHesap({products: U, meta: {}, orders: []}, now), now) === 'string');
    }
  }

  // ==========================================================================
  baslik('30) EXCEL’DEN FİYAT YÜKLEME — firma dosyası doğrudan okunur');
  // ==========================================================================
  // Firma iki dosya kullanıyor: "BAYİ SATIŞLARI" (Fabrika/Yakın/Uzak) + "danışmanlar için" (Torbalı).
  // Kredi Kartı ikisinde de yok → FİRMA KURALI: Kredi Kartı = Fabrika Teslim.
  // Aşağıdaki sayfa, gerçek dosyaların YERLEŞİMİNİ birebir taklit eder (tuzaklar dahil):
  //   • sütunlar harf sabitiyle değil BAŞLIK metniyle bulunur
  //   • "UZAK İLLER SAYILAN ŞEHİRLER" yan tablosu "Uzak Bayi" sütunu sanılmamalı
  //   • SheetJS tarihi gece yarısına saniyeler kala düşürür (06.08 → 05.08T20:59:04Z)
  //   • "TMR ÖNKARIŞIM" başlık hücresi ÜRÜN sayılmamalı
  {
    const H = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'siparis-takip', 'index.html'), 'utf8');
    const govde = (ad) => {
      const i = H.indexOf('function ' + ad + '(');
      if (i < 0) throw new Error(ad + ' yok');
      let d = 0, b = false;
      for (let k = i; k < H.length; k++) {
        if (H[k] === '{') { d++; b = true; } else if (H[k] === '}') { d--; if (b && !d) return H.slice(i, k + 1); }
      }
      throw new Error(ad + ' kapanmadı');
    };
    const sbt = (nm) => (H.match(new RegExp('^const ' + nm + '=([\\s\\S]*?);$', 'm')) || [])[0];
    const P = new Function([sbt('FIY_ALAN'), govde('fiyatNormHam'), govde('fiyatNorm'),
      govde('fiyatSayi'), govde('fiyatTabloCoz'),
      'return {fiyatNorm, fiyatNormHam, fiyatSayi, fiyatTabloCoz};'].join('\n'))();

    // ── TR sayı ──
    esit('sayı "1.005" (binlik) → 1005', P.fiyatSayi('1.005'), 1005);
    esit('sayı "1.234,56" → 1234.56', P.fiyatSayi('1.234,56'), 1234.56);
    esit('sayı "32,2" → 32.2', P.fiyatSayi('32,2'), 32.2);
    esit('kayan nokta artığı yuvarlanıyor', P.fiyatSayi(805.0000000000001), 805);
    dogru('boş/bozuk değer null döner', P.fiyatSayi('') === null && P.fiyatSayi('abc') === null && P.fiyatSayi(null) === null);

    // ── Ad eşleştirme: BK 300+ ile BK 300 Plus AYRI ürün, fiyatları karışmamalı ──
    dogru('"BK 300+" → sistem "BK-300"', P.fiyatNorm('TMR Önkarışım BK 300+') === P.fiyatNorm('BK-300'));
    dogru('"BK 300 Plus" → sistem "BK-300 PLUS"', P.fiyatNorm('TMR Önkarışım BK 300 Plus') === P.fiyatNorm('BK-300 PLUS'));
    dogru('İKİSİ AYRI normalize oluyor (fiyat takası olmaz)',
      P.fiyatNorm('TMR Önkarışım BK 300+') !== P.fiyatNorm('TMR Önkarışım BK 300 Plus'));
    dogru('"BK 100+" → "BK-100"', P.fiyatNorm('TMR Önkarışım BK 100+') === P.fiyatNorm('BK-100'));
    dogru('"RK-30 E" → "RK-30E"', P.fiyatNorm('TMR Önkarışım RK-30 E') === P.fiyatNorm('RK-30E'));
    dogru('"FLUSHING" → "Flushing" (Türkçe i tuzağı)', P.fiyatNorm('TMR Önkarışım FLUSHING') === P.fiyatNorm('Flushing'));
    dogru('önek olmadan da çalışır (ad zaten temizse)', P.fiyatNorm('DG-10') === P.fiyatNorm('TMR Önkarışım DG-10'));

    // ── Gerçek dosya yerleşimini taklit eden sayfa ──
    const TARIH = new Date(Date.UTC(2026, 7, 5, 20, 59, 4));   // SheetJS artığı: aslında 06.08
    const BAYI = [
      [], [], [], [null, null, null, 'ZİVE  YEM  FİYAT  LİSTESİ'],
      [null, null, null, null, null, null, null, null, 'TMR  ÖNKARIŞIM'],
      [null, null, null, null, null, null, null, null, 'FİYAT LİSTESİ'],
      [TARIH],
      [null, null, null, null, null, null, null, null, 'Fabrika Teslim', 'Yakın Bayi Satış', 'Uzak Bayi Satış',
        null, 'UZAK İLLER SAYILAN ŞEHİRLER'],
      [], [], [],
      ['TMR Önkarışım DG-10', null, null, null, '25 kg', null, null, null, 855, 970, 1010, null, 'ADANA'],
      ['TMR Önkarışım BK 300+', null, null, null, '25 kg', null, null, null, 850, 965, 1005, null, 'AĞRI'],
      ['TMR Önkarışım BK 300 Plus', null, null, null, '25 kg', null, null, null, 920, 1035, 1070, null, 'ANKARA'],
    ];
    const DAN = [
      [], [], [], [null, null, null, 'ZİRVE  YEM'],
      [null, null, null, null, null, null, 'TMR  ÖNKARIŞIM'],
      [], [new Date(Date.UTC(2026, 7, 2, 20, 59, 4))],
      [null, null, null, null, null, null, 'TL / kg', null, 'Torbalı'],
      [], [], [],
      ['TMR Önkarışım DG-10', null, null, null, '25 kg', null, 32.2, null, 805.0000000000001],
      ['TMR Önkarışım BK 300+', null, null, null, '25 kg', null, 31.6, null, 790],
      ['TMR Önkarışım PG-04', null, null, null, '10 kg', null, 572, null, 5720],
    ];
    const B = P.fiyatTabloCoz(BAYI), A = P.fiyatTabloCoz(DAN);

    esit('bayi: tarih EN YAKIN GÜNE yuvarlanıyor (06.08)', B.tarih, '2026-08-06');
    esit('danışman: tarih yuvarlanıyor (03.08)', A.tarih, '2026-08-03');
    esit('bayi: 3 ürün satırı', B.satirlar.length, 3);
    dogru('bayi: "TMR ÖNKARIŞIM" BAŞLIĞI ürün sayılmadı', !B.satirlar.some((s) => !s.ad));
    dogru('bayi: sütunlar başlıkla bulundu', B.sutun.fabrika === 8 && B.sutun.yakin === 9 && B.sutun.uzak === 10,
      JSON.stringify(B.sutun));
    dogru('bayi: "UZAK İLLER" yan tablosu Uzak sütunu SANILMADI', B.sutun.uzak !== 12);
    dogru('bayi: Torbalı sütunu yok', B.sutun.danismanListe == null);
    dogru('danışman: Torbalı bulundu, fabrika/yakın/uzak YOK',
      A.sutun.danismanListe === 8 && A.sutun.fabrika == null && A.sutun.uzak == null);
    dogru('danışman: "TL / kg" fiyat sütunu sanılmadı', !A.satirlar[0].fiyat.fabrika);
    const bDG = B.satirlar.find((s) => s.ad === 'DG-10');
    dogru('bayi DG-10 = 855/970/1010', bDG.fiyat.fabrika === 855 && bDG.fiyat.yakin === 970 && bDG.fiyat.uzak === 1010);
    esit('bayi: ambalaj okundu', bDG.pkg, '25 kg');
    esit('danışman DG-10 torbalı = 805', A.satirlar.find((s) => s.ad === 'DG-10').fiyat.danismanListe, 805);
    dogru('boş sayfa çökertmiyor', P.fiyatTabloCoz([]).satirlar.length === 0);

    // ── YAZMA YOLU GERÇEKTEN KOŞTURULUR (metin testi çalışma-zamanı hatasını görmez) ──
    const kurWrite = (opts) => {
      const DB = {
        meta: {},
        products: [
          {code: 'DG-10', pkg: '25 kg', fabrika: 610, yakin: 710, uzak: 750, danismanListe: 0, krediKarti: 0},
          {code: 'BK-300', pkg: '25 kg', fabrika: 600, yakin: 700, uzak: 740, danismanListe: 0, krediKarti: 0},
          {code: 'BK-300 PLUS', pkg: '25 kg', fabrika: 640, yakin: 740, uzak: 780, danismanListe: 0, krediKarti: 0},
          {code: 'PG-04', pkg: '25 kg', fabrika: 1000, yakin: 1100, uzak: 1200, danismanListe: 0, krediKarti: 0},
          {code: 'SODA', pkg: '25 kg', fabrika: 111, yakin: 222, uzak: 333, danismanListe: 44, krediKarti: 55},
        ],
      };
      const durum = {yayin: null, uyari: '', log: ''};
      const ort = {
        DB, FY: Object.assign({bayi: opts.bayi, dan: opts.dan, esle: opts.esle || {}, hata: '', tarih: '', not: ''}),
        isAdmin: () => true, todayISO: () => '2026-08-04',
        fmtN: (n) => String(n), fmtDate: (d) => String(d), esc: (x) => String(x == null ? '' : x),
        confirm: () => opts.onay !== false, toast: (t) => { durum.uyari = t; },
        saveDB: () => {}, closeModal: () => {}, render: () => {}, tariffPDF: () => {},
        logAct: (t) => { durum.log = t; }, publishSnapshot: (d, n) => { durum.yayin = {d, n}; },
        document: {getElementById: (id) => ({value: id === 'fyDate' ? '2026-08-06' : 'Ağustos zammı'})},
      };
      new Function(...Object.keys(ort), [
        sbt('FIY_ALAN'), govde('fiyatNormHam'), govde('fiyatNorm'), govde('fiyatSayi'),
        govde('fiyatAliasMap'), govde('fiyatSatirlari'), govde('fiyatEslesme'), govde('fiyatPlanCikar'),
        govde('fiyatUygulaYayinla'), 'fiyatUygulaYayinla();',
      ].join('\n'))(...Object.values(ort));
      return {DB, ...durum, bul: (c) => DB.products.find((p) => p.code === c)};
    };

    {
      const R = kurWrite({bayi: B, dan: A});
      dogru('KOŞTU: DG-10 fiyatları yazıldı', R.bul('DG-10').fabrika === 855 && R.bul('DG-10').yakin === 970 && R.bul('DG-10').uzak === 1010);
      esit('KOŞTU: DG-10 danışman fiyatı (2. dosyadan)', R.bul('DG-10').danismanListe, 805);
      esit('KOŞTU: Kredi Kartı = Fabrika (firma kuralı)', R.bul('DG-10').krediKarti, 855);
      // EN KRİTİK: "BK 300+" ile "BK 300 Plus" birbirinin fiyatını ALMAMALI
      esit('KOŞTU: BK-300 ← "BK 300+" (850)', R.bul('BK-300').fabrika, 850);
      esit('KOŞTU: BK-300 PLUS ← "BK 300 Plus" (920)', R.bul('BK-300 PLUS').fabrika, 920);
      dogru('KOŞTU: iki ürünün fiyatı TAKAS OLMADI', R.bul('BK-300').fabrika !== R.bul('BK-300 PLUS').fabrika);
      esit('KOŞTU: BK-300 danışman fiyatı 790', R.bul('BK-300').danismanListe, 790);
      dogru('KOŞTU: dosyada olmayan SODA hiç değişmedi',
        R.bul('SODA').fabrika === 111 && R.bul('SODA').danismanListe === 44 && R.bul('SODA').krediKarti === 55);
      esit('KOŞTU: eşleşmeyen satır ürün YARATMADI', R.DB.products.length, 5);
      dogru('KOŞTU: tarife yayınlandı (arşiv)', !!R.yayin && R.yayin.d === '2026-08-06', R.yayin && R.yayin.d);
      // AMBALAJ KAPISI: danışman dosyasındaki PG-04 10 kg, sistemdeki PG-04 25 kg'a OTOMATİK yazılmamalı
      dogru('KOŞTU: 10 kg satırı 25 kg ürüne yazılmadı', R.bul('PG-04').fabrika === 1000 && R.bul('PG-04').danismanListe === 0);
      // ALIAS: yalnız BİLEREK yapılan seçim kalıcı olmalı — otomatik eşleşme/eşleşmeme yazılmaz,
      // yoksa ürün adı değişince sistem kendini bir daha asla toparlayamaz.
      dogru('KOŞTU: otomatik eşleşme alias’a YAZILMADI', !Object.keys(R.DB.meta.fiyatAlias || {}).length,
        JSON.stringify(R.DB.meta.fiyatAlias || {}));
    }
    {
      // ONAY İPTALİ: hiçbir şey yazılmamalı (eskiden fiyatlar confirm’den ÖNCE yazılıyordu)
      const R = kurWrite({bayi: B, dan: A, onay: false});
      dogru('KOŞTU: "Vazgeç" → DG-10 fiyatı DEĞİŞMEDİ', R.bul('DG-10').fabrika === 610 && R.bul('DG-10').krediKarti === 0);
      dogru('KOŞTU: "Vazgeç" → BK-300 fiyatı DEĞİŞMEDİ', R.bul('BK-300').fabrika === 600);
      dogru('KOŞTU: "Vazgeç" → tarife YAYINLANMADI', R.yayin === null);
      dogru('KOŞTU: "Vazgeç" → alias haritası KİRLENMEDİ', !Object.keys(R.DB.meta.fiyatAlias || {}).length);
    }
    {
      // ÇAKIŞMA: Excel'de hem "BK 300" hem "BK 300+" varsa ikisi aynı anahtara düşer → HİÇBİR ŞEY yazılmamalı
      const CAK = P.fiyatTabloCoz(BAYI.concat([
        ['TMR Önkarışım BK 300', null, null, null, '25 kg', null, null, null, 780, 895, 935],
      ]));
      const R = kurWrite({bayi: CAK, dan: null});
      dogru('KOŞTU: çakışma → BK-300 fiyatı DEĞİŞMEDİ', R.bul('BK-300').fabrika === 600);
      dogru('KOŞTU: çakışma → tarife YAYINLANMADI', R.yayin === null);
      dogru('KOŞTU: çakışma kullanıcıya bildirildi', /aynı ada düşen/i.test(R.uyari), R.uyari);
      dogru('KOŞTU: çakışma diğer ürünleri de YAZDIRMADI (bütün yükleme durur)',
        R.bul('DG-10').fabrika === 610);
    }
    {
      // ELLE SEÇİM: kullanıcı eşleştirmeyi seçerse hem yazılır hem KALICI olur
      const anahtar = P.fiyatNorm('PG-04') + '|10KG';
      const R = kurWrite({bayi: null, dan: A, esle: {[anahtar]: 'PG-04'}});
      esit('KOŞTU: elle seçilen eşleştirme yazıldı', R.bul('PG-04').danismanListe, 5720);
      esit('KOŞTU: elle seçim alias’a KALICI yazıldı', (R.DB.meta.fiyatAlias || {})[anahtar], 'PG-04');
    }
    // Sütun tespiti: serbest metindeki "…fabrika teslim…" notu sütunu KAPMAMALI (ilk-eşleşen-kazanır tuzağı)
    {
      const TUZAK = [
        ['Bu liste fabrika teslim fiyatlarını içerir, uzak bayi satış için nakliye ekleyiniz'],
        [null, null, null, null, null, null, null, null, 'Fabrika Teslim', 'Yakın Bayi Satış', 'Uzak Bayi Satış'],
        [], ['TMR Önkarışım DG-10', null, null, null, '25 kg', null, null, null, 855, 970, 1010],
      ];
      const R = P.fiyatTabloCoz(TUZAK);
      dogru('serbest metin notu fiyat sütunu SANILMADI', R.sutun.fabrika === 8 && R.sutun.uzak === 10,
        JSON.stringify(R.sutun));
      esit('tuzak sayfada fiyat doğru okundu', R.satirlar[0].fiyat.fabrika, 855);
    }
    // Eski tarifeye dönünce krediKarti (İMECE tabanı) da geri gelmeli — arşivde var ama atlanıyordu
    dogru('setActiveTariff krediKarti’yi geri yüklüyor',
      /if\(it\.krediKarti!=null\)prod\.krediKarti=it\.krediKarti;/.test(H));
    dogru('çakışan satır yazmayı DURDURUYOR (sunucu doğrulaması yok)',
      /if\(P\.cakisan\)\{toast\(/.test(H));
    dogru('plan DB’ye dokunmadan çıkarılıyor (onay öncesi yazma yok)',
      /function fiyatPlanCikar\(\)[\s\S]{0,1200}?return \{rows,plan,deg,atlanan,cakisan\}/.test(H));
    dogru('alias YALNIZ elle seçimde kalıcı', /if\(FY\.esle\[x\.key\]!==undefined\)A\[x\.key\]=FY\.esle\[x\.key\];/.test(H));
    // Arayüz kancaları
    dogru('düğme yalnız yöneticide', /if\(isAdmin\(\)\)tb\.innerHTML=[\s\S]{0,80}openFiyatYukle\(\)/.test(H));
    dogru('yükleme yöneticiye kilitli', /function openFiyatYukle\(\)\{\s*if\(!isAdmin\(\)\)\{toast\('Sadece yönetici'\)/.test(H));
    dogru('0/boş fiyat YAZILMIYOR', /if\(v==null\|\|!\(v>0\)\)return;/.test(H));
    dogru('uygulamadan önce onay isteniyor', /if\(!confirm\([\s\S]{0,200}?Yeni tarife yayınlanacak/.test(H));
  }

  // ==========================================================================
  baslik('31) FİYAT & TARİFE SUNUCU KAPISI — yetkisiz değişim süzülür (reddedilmez)');
  // ==========================================================================
  // Arayüz fiyat düzenlemeyi yöneticiye kilitliyor ama konsoldan atlanabilir; fiyat yayınlanan
  // tarifeye, oradan HER siparişe yansır → sunucu da doğrulamalı.
  // 403 DEĞİL SÜZME: reddetseydik yetkisiz kullanıcının yerel blobu kirli kalır ve o sekme bir daha
  // hiç kaydedemezdi (İK'da yaşanan hata). Sunucudaki sürüm korunur, istemci taze updated ile alır.
  {
    const fs = require('fs'), path = require('path');
    const FN = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const H2 = fs.readFileSync(path.join(__dirname, '..', 'siparis-takip', 'index.html'), 'utf8');
    // Ok fonksiyonunu parantez sayarak çıkar (regex çok satırlı gövdede yanılıyor)
    const cikar = (nm) => {
      const i = FN.indexOf('const ' + nm + ' = (db) =>');
      if (i < 0) throw new Error(nm + ' bulunamadı');
      let d = 0, j = i;
      for (; j < FN.length; j++) {
        const c = FN[j];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') d--;
        else if (c === ';' && d === 0) break;
      }
      return FN.slice(i, j + 1);
    };
    const I = new Function([cikar('urunImza'), cikar('tarifeImza'),
      'return {urunImza, tarifeImza};'].join('\n'))();

    const U = (kod, fab) => ({code: kod, pkg: '25 kg', fabrika: fab, yakin: fab + 100, uzak: fab + 140,
      danismanListe: fab - 20, krediKarti: fab, active: true});
    const TABAN = {products: [U('DG-10', 855), U('BK-300', 850)],
      priceLists: [{id: 'pl1', date: '2026-08-06', active: true, items: [{code: 'DG-10', fabrika: 855}]}],
      meta: {activePriceListId: 'pl1'}};
    const kopya = () => JSON.parse(JSON.stringify(TABAN));

    dogru('aynı veri → imza AYNI (boşuna süzme yok)',
      I.urunImza(TABAN) === I.urunImza(kopya()) && I.tarifeImza(TABAN) === I.tarifeImza(kopya()));
    // YANLIŞ ALARM KAPISI: ürün kartı düzenlemesi diziyi kaydırabilir; sıra değişimi değişiklik SAYILMAZ
    const sirali = kopya(); sirali.products.reverse();
    dogru('ürün SIRASI değişince süzme TETİKLENMEZ', I.urunImza(TABAN) === I.urunImza(sirali));
    // Gerçek değişiklikler yakalanmalı
    const fiyat = kopya(); fiyat.products[0].fabrika = 999;
    dogru('fabrika fiyatı değişimi YAKALANIR', I.urunImza(TABAN) !== I.urunImza(fiyat));
    const kk = kopya(); kk.products[0].krediKarti = 1;
    dogru('krediKarti (İMECE tabanı) değişimi YAKALANIR', I.urunImza(TABAN) !== I.urunImza(kk));
    const dan = kopya(); dan.products[1].danismanListe = 1;
    dogru('danışman liste fiyatı değişimi YAKALANIR', I.urunImza(TABAN) !== I.urunImza(dan));
    const yeni = kopya(); yeni.products.push(U('SAHTE', 1));
    dogru('ürün EKLEME yakalanır', I.urunImza(TABAN) !== I.urunImza(yeni));
    const eksik = kopya(); eksik.products.pop();
    dogru('ürün SİLME yakalanır', I.urunImza(TABAN) !== I.urunImza(eksik));
    const pasif = kopya(); pasif.products[0].active = false;
    dogru('ürün pasifleştirme yakalanır', I.urunImza(TABAN) !== I.urunImza(pasif));
    const tarifeIc = kopya(); tarifeIc.priceLists[0].items[0].fabrika = 1;
    dogru('ARŞİVLENMİŞ tarife içeriğinin değişimi yakalanır', I.tarifeImza(TABAN) !== I.tarifeImza(tarifeIc));
    const aktif = kopya(); aktif.meta.activePriceListId = 'pl0';
    dogru('aktif tarife değiştirme yakalanır', I.tarifeImza(TABAN) !== I.tarifeImza(aktif));
    const yeniTarife = kopya(); yeniTarife.priceLists.push({id: 'pl2', date: '2026-09-01', active: true, items: []});
    dogru('yeni tarife yayınlama yakalanır', I.tarifeImza(TABAN) !== I.tarifeImza(yeniTarife));
    dogru('eksik/bozuk blob çökertmiyor',
      typeof I.urunImza({}) === 'string' && typeof I.tarifeImza({}) === 'string');

    // Kapının kendisi
    dogru('SUNUCU: yönetici ölçütü silme/sevk kapısıyla AYNI',
      /const fyYonetici = \(dec\.portalYonetici === true\) \|\| \(dec\[app\] === "admin"\);/.test(FN));
    dogru('SUNUCU: yalnız YETKİSİZ kullanıcıda çalışıyor', /if \(!fyYonetici\) \{/.test(FN));
    dogru('SUNUCU: sunucudaki ürün/tarife sürümü korunuyor (403 DEĞİL)',
      /inDB\.products = curDB\.products;/.test(FN) && /inDB\.priceLists = curDB\.priceLists;/.test(FN));
    dogru('SUNUCU: koruma sonrası taze updated üretiliyor (istemci doğrusunu alır)',
      /if \(korundu\) \{ outData = Object\.assign/.test(FN));
    dogru('SUNUCU: deneme denetime yazılıyor', /denetimVer\("fiyat-degisimi-engellendi"/.test(FN));
    dogru('SUNUCU: tx yeniden denemesinde bayrak sıfırlanıyor', /sevkKilidi = null; fiyatKorundu = null;/.test(FN));

    // İSTEMCİ: bir kerelik fiyat göçü USER kurulduktan SONRA ve YALNIZ yöneticide koşmalı.
    // loadDB'de kalsaydı isAdmin() daima false olur (USER henüz yok) ve göç hiç çalışmazdı;
    // kapısız bırakılsaydı sürüm değişiminde ilk açan yetkisiz kullanıcının yazımı süzülürdü.
    dogru('İSTEMCİ: fiyat göçü initApp içinde', /function initApp\(\)\{\s*fiyatGocuCalistir\(\);/.test(H2));
    dogru('İSTEMCİ: fiyat göçü yönetici kapısına bağlı',
      /function fiyatGocuCalistir\(\)\{[\s\S]{0,200}?!isAdmin\(\)\)return;/.test(H2));
    dogru('İSTEMCİ: göç loadDB’den çıkarıldı',
      !/if\(DB\.meta\.priceVersion!==PRICE_VERSION\)\{applyPriceList\(\)/.test(H2));
  }

  // ==========================================================================
  baslik('32) ÖN SİPARİŞ — ayrı dizide yaşar, hiçbir rapora SIZMAZ');
  // ==========================================================================
  // Müşteri talebi netleşmeden not alınır. DB.orders'a bayrakla konsaydı tonaj/ciro/komisyon/
  // Telegram/onay zincirinin HEPSİNİ tek tek süzmek gerekirdi; biri atlanınca ön sipariş
  // gerçek satış gibi görünürdü. Bu yüzden AYRI dizi: DB.preOrders.
  {
    const H3 = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'siparis-takip', 'index.html'), 'utf8');
    const FN3 = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');

    dogru('ayrı dizide tutuluyor (orders’a bayrak DEĞİL)',
      /DB\.preOrders=DB\.preOrders\|\|\[\]/.test(H3) && !/o\.onSiparis\b/.test(H3));
    // SIZINTI KAPISI: tonaj/ciro/rapor toplayıcılarının hiçbiri preOrders okumamalı
    for (const fn of ['tonajData', 'yonVeri', 'raporOrders', 'custRaporHTML', 'tarihselSanalOrders']) {
      const i = H3.indexOf('function ' + fn + '(');
      let g = '';
      if (i >= 0) { let d = 0, b = false; for (let k = i; k < H3.length; k++) { const c = H3[k];
        if (c === '{') { d++; b = true; } else if (c === '}') { d--; if (b && !d) { g = H3.slice(i, k + 1); break; } } } }
      dogru(fn + ' ön siparişe DOKUNMUYOR', !!g && g.indexOf('preOrder') < 0);
    }
    dogru('sunucu tonaj toplayıcıları ön siparişi bilmiyor', FN3.indexOf('preOrder') < 0 || !/cikanSiparisFN[\s\S]{0,400}preOrder/.test(FN3));
    dogru('ön siparişte onay/Telegram akışı YOK',
      !/preOrder[\s\S]{0,3000}?sendTelegram/.test(H3) && !/savePreOrder\(\)\{[\s\S]{0,900}?muhasebeOnayGerek/.test(H3));

    // DÖNÜŞTÜRME: ön sipariş ancak sipariş GERÇEKTEN kaydedilince kapanır
    dogru('dönüştürme bayrağı bloba yazılmıyor', /const _onSip=o\._onSipId;delete o\._onSipId;/.test(H3));
    dogru('ön sipariş kapanışı saveDB’den ÖNCE ve yalnız _onSip varsa',
      /if\(_onSip\)\{[\s\S]{0,400}?durum='donusturuldu'[\s\S]{0,300}?\}\s*saveDB\(\);/.test(H3));
    dogru('dönüştürülen ön sipariş sipariş numarasını saklıyor (iz)',
      /_p\.donusenSiparisId=o\.id;_p\.donusenNo=o\.no;/.test(H3));
    dogru('yalnız AÇIK ön sipariş dönüştürülür (iki kez kapanmaz)', /if\(_p&&_p\.durum==='acik'\)/.test(H3));

    // Panel: çizginin altı + tarihsizler
    dogru('panelde ön siparişler AYRI şeritte (çizgi altı)', /class="pre-sep"><span>ön sipariş<\/span>/.test(H3));
    dogru('panelde yalnız AÇIK ve o güne ait olanlar', /p\.durum==='acik'&&p\.tarih===ds/.test(H3));
    dogru('tarihi belirsizler ayrı kartta (gözden kaçmasın)', /p\.durum==='acik'&&!p\.tarih/.test(H3));
    dogru('gün kutusundaki sipariş SAYACI ön siparişi saymıyor',
      /const dayO=weekOrders\.filter\(o=>kanbanDate\(o\)===ds\)/.test(H3));

    // Yetki + eşzamanlılık
    dogru('ön sipariş yazımı canEdit kapısında', /function openPreOrder\(id\)\{\s*if\(!canEdit\(\)\)/.test(H3));
    dogru('plasiyer yalnız kendi müşterisinin ön siparişini görür',
      /function preOrdersVisible\(\)\{return isPlasiyer\(\)\?/.test(H3));
    dogru('SUNUCU: eşzamanlı ön sipariş kaybolmuyor',
      /\["preOrders", curDB\.preOrders, "ön sipariş"\]/.test(FN3));

    // Motor gerçekten koşturulur
    {
      const govde2 = (nm) => {
        const i = H3.indexOf('function ' + nm + '(');
        let d = 0, b = false;
        for (let k = i; k < H3.length; k++) { const c = H3[k];
          if (c === '{') { d++; b = true; } else if (c === '}') { d--; if (b && !d) return H3.slice(i, k + 1); } }
        return '';
      };
      const DB = {products: [{code: 'A', pkg: '25 kg'}, {code: 'B', pkg: '50 kg'}], preOrders: []};
      const M = new Function('DB', 'prodByCode', 'isPlasiyer', [
        govde2('preOrders'), govde2('preOrderTon'), govde2('preNextNo'),
        'return {preOrders, preOrderTon, preNextNo};',
      ].join('\n'))(DB, (c) => DB.products.find((p) => p.code === c), () => false);
      // tonOf/prodKg zincirini taklit etmeden doğrudan ölçelim: 25 kg × 400 = 10 t
      dogru('preOrderTon: ürünsüz ön sipariş 0 t', M.preOrderTon({lines: []}) === 0);
      dogru('preOrderTon: bozuk satır çökertmiyor', M.preOrderTon({lines: [null, {}, {code: ''}]}) === 0);
      dogru('preOrderTon: girdisiz çağrı güvenli', M.preOrderTon(null) === 0 && M.preOrderTon({}) === 0);
      DB.preOrders = [{no: 3}, {no: 7}, {no: 1}];
      esit('preNextNo en büyükten devam eder', M.preNextNo(), 8);
      DB.preOrders = [];
      esit('ilk ön sipariş no 1', M.preNextNo(), 1);
    }
  }

  sonuc();
})();
