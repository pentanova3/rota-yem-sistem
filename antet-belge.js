/* ══════════════════════════════════════════════════════════════════════════
   ROTA SMI — ANTETLİ BELGE İSKELETİ  (ORTAK · tek yazıcı)

   Bayiye / danışmana / müşteriye GÖNDERİLEN her basılı rapor bu iskeletten
   çıkar. Amaç: firmanın gerçek antetli kağıdı (veri/rota-smi-antet.pdf)
   üzerine basılmış gibi görünen, A4'e oturan, çok sayfada bozulmayan belge.

   ── Sayfalama reçetesi (bozmadan önce oku) ────────────────────────────────
   • Üst bant <thead> içinde  → HER sayfanın tepesinde kendiliğinden tekrarlar.
   • Alt bant İKİ parça:
       1) <tfoot>'ta GÖRÜNMEZ eş-boyut yer tutucu — içerik antedin altına
          girmesin diye her sayfada yer ayırır.
       2) position:fixed gerçek görsel — yarım dolu sayfada bile kağıdın
          fiziksel dibine oturur.
     Tek parça yapılırsa ya metin antedin üstüne biner ya da son sayfada
     bant ortada asılı kalır.
   • @page{margin:0} + yan marjlar İÇERİK HÜCRESİNDE (td.icerik padding).
     Marj @page'e verilirse bantlar kenardan kopar, antet ortada yüzer.
   • print-color-adjust:exact → lacivert bantlar/başlıklar baskıda solmaz.
   • Görseller MUTLAK yolla verilir: belge window.open('','_blank') ile açılan
     about:blank penceresine yazılıyor; göreli yol orada ÇÖZÜLMEZ (sessizce
     404 → antetsiz belge, hata da vermez).

   Kaynak antet: veri/rota-smi-antet.pdf → 400 dpi kırpım (antet-ust/alt.png).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var UST_MM = 34.55;   // üst bandın basılı yüksekliği (3307×544 px @400dpi)
  var ALT_MM = 28.33;   // alt bandın basılı yüksekliği (3307×446 px @400dpi)
  var YAN_MM = 15;      // sol/sağ marj — antet bantları kenardan kenara gider

  function kok() {
    // about:blank penceresinde location.origin yok sayılır; opener'ınki kullanılır.
    try { return window.location.origin; } catch (e) { return ''; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }

  var STIL = `
  @page{size:A4;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --lac:#2A3A70;          /* antet laciverti */
    --lac2:#1F2C57;         /* koyu ton — başlık ve toplam satırı */
    --tint:#F2F4FA;         /* çok açık lacivert zemin */
    --tint2:#E7EBF6;
    --cizgi:#DCE1EE;
    --metin:#141A2B;
    --soluk:#6A7288;
    --yesil:#15803D;--kirmizi:#B91C1C;--kehribar:#B45309;
  }
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Segoe UI",Calibri,Carlito,"Helvetica Neue",Arial,sans-serif;
       color:var(--metin);font-size:9.5pt;line-height:1.45;background:#8A90A0}
  .kagit{width:210mm;min-height:297mm;margin:58px auto 24px;background:#fff;position:relative;
         box-shadow:0 6px 26px rgba(0,0,0,.28)}
  .sayfa{width:100%;border-collapse:collapse}
  .ust{display:block;width:100%;height:auto}
  .altyer{height:${ALT_MM}mm}
  .alt{position:absolute;bottom:0;left:0;width:100%;display:block}
  /* Boşluk üst bandın HÜCRESİNDE: <thead> her sayfada tekrarladığı için pay da tekrarlar.
     İçerik hücresine verilseydi yalnız 1. sayfada olurdu, 2. sayfada metin antede yapışırdı. */
  table.sayfa > thead > tr > td{padding:0 0 7mm}
  td.icerik{padding:0 ${YAN_MM}mm 4mm;vertical-align:top}

  /* ── belge künyesi ─────────────────────────────────────────────────── */
  .kunye{display:flex;justify-content:space-between;align-items:flex-end;gap:14mm;
         border-bottom:2px solid var(--lac);padding-bottom:7px}
  .kunye .tip{font-size:7.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
              color:var(--lac);margin-bottom:3px}
  .kunye h1{font-size:17pt;font-weight:700;color:var(--lac2);line-height:1.15;letter-spacing:-.2px}
  .kunye .altad{font-size:9pt;color:var(--soluk);margin-top:2px}
  .kunye .sag{text-align:right;font-size:8.5pt;color:var(--soluk);white-space:nowrap;line-height:1.7}
  .kunye .sag b{color:var(--lac2);font-weight:600}

  /* ── özet şeridi ───────────────────────────────────────────────────── */
  .ozet{display:flex;margin-top:9px;border:1px solid var(--cizgi);border-top:2px solid var(--lac);
        background:var(--tint);break-inside:avoid}
  .ozet > div{flex:1;padding:7px 10px;border-left:1px solid var(--cizgi)}
  .ozet > div:first-child{border-left:0}
  .ozet .k{font-size:7pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--soluk)}
  .ozet .v{font-size:13pt;font-weight:700;color:var(--lac2);font-variant-numeric:tabular-nums;
           margin-top:1px;line-height:1.2}
  .ozet .n{font-size:7.5pt;color:var(--soluk);font-weight:500}
  .ozet .vurgu .v{color:var(--lac)}

  /* ── bölüm ─────────────────────────────────────────────────────────── */
  .blok{margin-top:13px}
  .blok > h2{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
             color:var(--lac);border-bottom:1px solid var(--cizgi);padding-bottom:4px;margin-bottom:6px;
             break-after:avoid;page-break-after:avoid}
  .blok > h2 span{float:right;font-weight:600;letter-spacing:0;text-transform:none;color:var(--soluk);font-size:8pt}

  /* ── tablo ─────────────────────────────────────────────────────────── */
  table.t{width:100%;border-collapse:collapse;font-size:8.5pt}
  table.t thead{display:table-header-group}
  table.t th{background:var(--lac);color:#fff;font-size:7pt;font-weight:700;letter-spacing:.05em;
             text-transform:uppercase;padding:5px 6px;text-align:left;border-right:1px solid rgba(255,255,255,.18)}
  table.t th:last-child{border-right:0}
  table.t td{padding:4px 6px;border-bottom:1px solid #EDEFF6;vertical-align:top}
  table.t tbody tr:nth-child(even) td{background:#F8F9FD}
  table.t tr{break-inside:avoid;page-break-inside:avoid}
  table.t .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  /* İç tabloda tfoot = GENEL TOPLAM. Tarayıcı varsayılanı (table-footer-group) onu her
     sayfanın altında tekrarlar → okuyan "ara toplam" sanır, para belgesinde kabul edilemez.
     Yalnız tablonun sonunda çıksın diye satır grubuna çevrildi. Sayfa iskeletinin
     (.sayfa) kendi tfoot'u ise alt bant yer tutucusudur — o TEKRARLAMALI. */
  table.t tfoot{display:table-row-group}
  table.sayfa > tfoot{display:table-footer-group}
  table.t tfoot td{background:var(--tint2);font-weight:700;border-top:1.5px solid var(--lac);
                   border-bottom:0;padding:6px}
  table.t .bos{text-align:center;padding:26px;color:#9AA1B4;font-style:italic}
  /* .sik = sıkışık varyant: 11 sütunlu döküm A4'e ancak bu ölçüyle sığar.
     Küçültmeden önce sütun genişliklerini (colgroup) kontrol et. */
  table.t.sik{font-size:7.4pt}
  table.t.sik th{font-size:6.4pt;padding:4px 4px}
  table.t.sik td{padding:3px 4px}
  table.t.sik tfoot td{padding:5px 4px}
  .ad{font-weight:600}
  /* "B" = bayi üzerinden. Düz harf bırakılırsa bayi ADININ parçası sanılır
     ("Altınova Yem B"); rozet olarak basılıyor. */
  .kk{display:inline-block;font-size:6.5pt;font-weight:700;line-height:1.5;color:#fff;background:var(--lac);
      border-radius:2px;padding:0 3px;margin-left:3px;vertical-align:1px}

  /* ── kutucuklar (çeyrek vb.) ───────────────────────────────────────── */
  .kutular{display:flex;gap:6px;break-inside:avoid}
  .kutular > div{flex:1;padding:8px 10px;border:1px solid var(--cizgi);background:#fff}
  .kutular .k{font-size:7pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--soluk)}
  .kutular .v{font-size:11.5pt;font-weight:700;color:var(--lac2);font-variant-numeric:tabular-nums;margin-top:1px}
  .kutular .son{background:var(--tint);border-color:var(--lac)}
  .kutular .son .v{color:var(--lac)}

  .not{font-size:7.5pt;color:var(--soluk);line-height:1.5;margin-top:5px}
  .not b{color:#4A5266}
  .imza{margin-top:12px;font-size:7.5pt;color:#98A0B2;border-top:1px solid var(--cizgi);padding-top:5px;
        display:flex;justify-content:space-between;break-inside:avoid}

  /* ── ekran araç çubuğu (baskıda yok) ───────────────────────────────── */
  .pbar{position:fixed;top:12px;right:12px;display:flex;gap:7px;z-index:99}
  .pbar button{display:inline-flex;align-items:center;gap:5px;padding:9px 14px;border:none;border-radius:6px;
    font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(0,0,0,.22)}
  .bp{background:var(--lac);color:#fff}.bx{background:#16A34A;color:#fff}.bc{background:#fff;color:#334155}

  @media print{
    body{background:#fff}
    .kagit{width:auto;min-height:0;margin:0;box-shadow:none}
    .alt{position:fixed}
    .pbar{display:none}
  }
  @media screen and (max-width:840px){
    body{background:#fff}
    .kagit{width:auto;min-height:0;margin:0;box-shadow:none}
    td.icerik{padding:6mm 5mm 4mm}
  }`;

  /**
   * Antetli A4 belge üretir (tam HTML string).
   * @param {Object} o
   *   tip       : üstteki küçük etiket        ("BAYİ İSKONTO RAPORU")
   *   ad        : büyük başlık                (bayi/danışman adı)
   *   altad     : başlık altı açıklama        (opsiyonel)
   *   kunye     : [{k,v}]  sağ üst künye satırları
   *   ozet      : [{k,v,n,vurgu}]  özet şeridi kutuları (opsiyonel)
   *   govde     : ana içerik HTML
   *   imzaSol / imzaSag : en alt gri satır
   *   araclar   : ekranda sabit araç çubuğu HTML'i (opsiyonel)
   *   baslikEtiket : <title> (opsiyonel — yoksa tip · ad)
   *   otoYazdir : ms cinsinden gecikme; verilirse yükleme sonrası yazdır
   */
  window.antetBelge = function (o) {
    o = o || {};
    var K = kok();
    var kunye = (o.kunye || []).map(function (x) {
      return '<div>' + esc(x.k) + ': <b>' + esc(x.v) + '</b></div>';
    }).join('');
    var ozet = (o.ozet || []).length
      ? '<div class="ozet">' + o.ozet.map(function (x) {
        return '<div' + (x.vurgu ? ' class="vurgu"' : '') + '><div class="k">' + esc(x.k) + '</div>' +
               '<div class="v">' + esc(x.v) + '</div>' +
               (x.n ? '<div class="n">' + esc(x.n) + '</div>' : '') + '</div>';
      }).join('') + '</div>'
      : '';
    // Yazdırma, görseller yüklendikten SONRA tetiklenmeli — window.onload bunu garanti eder.
    // Erken print() antedi boş basar (klasik "antet çıkmadı" şikâyeti).
    var oto = o.otoYazdir
      ? '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},' + (+o.otoYazdir || 400) + ')}</scr' + 'ipt>'
      : '';
    return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(o.baslikEtiket || ((o.tip || 'Rapor') + ' · ' + (o.ad || ''))) + '</title>' +
      '<style>' + STIL + '</style></head><body>' +
      (o.araclar ? '<div class="pbar">' + o.araclar + '</div>' : '') +
      '<div class="kagit"><table class="sayfa">' +
        '<thead><tr><td><img class="ust" src="' + K + '/antet-ust.png" alt=""></td></tr></thead>' +
        '<tbody><tr><td class="icerik">' +
          '<div class="kunye"><div>' +
            (o.tip ? '<div class="tip">' + esc(o.tip) + '</div>' : '') +
            '<h1>' + esc(o.ad || '') + '</h1>' +
            (o.altad ? '<div class="altad">' + esc(o.altad) + '</div>' : '') +
          '</div><div class="sag">' + kunye + '</div></div>' +
          ozet + (o.govde || '') +
          '<div class="imza"><span>' + esc(o.imzaSol || '') + '</span><span>' + esc(o.imzaSag || '') + '</span></div>' +
        '</td></tr></tbody>' +
        '<tfoot><tr><td><div class="altyer"></div></td></tr></tfoot>' +
      '</table>' +
      '<img class="alt" src="' + K + '/antet-alt.png" alt=""></div>' +
      oto + '</body></html>';
  };

  window.antetBelge.UST_MM = UST_MM;
  window.antetBelge.ALT_MM = ALT_MM;

  /** Belgeyi yeni sekmede açar. Pop-up engelliyse null döner. */
  window.antetBelgeAc = function (html) {
    var w = window.open('', '_blank');
    if (!w) return null;
    w.document.open(); w.document.write(html); w.document.close();
    return w;
  };
})();
