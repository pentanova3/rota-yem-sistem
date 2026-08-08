/* Rota Yem — Plasiyer Aktüerya Raporu
   Dönem: aylık / 3 ay / 6 ay / yıllık
   Kırılım: ürün, müşteri, plasiyer × ay
   Skor → önerilen prim oranı bandı (karar destek; bağlayıcı değil)
   Bağımlılıklar (siparis-takip globals): DB, esc, fmtTL, fmtN, fmtTon, orderTon, orderTotal,
   ordPlasiyer, satisMi, satisTarihi, tonOf, prodByCode, custById, plasById, AY_KISA, AYLAR_TR, render */
(function (global) {
  'use strict';

  var S = {
    donem: 'yil',       // ay | 3ay | 6ay | yil
    yil: '',
    ay: '',             // YYYY-MM (aylık) veya şeritte vurgu
    metrik: 'tonaj',    // tonaj | ciro | siparis | musteri | urun
    grafMod: 'ay',      // ay | kum
    plasId: '',         // '' = tümü
    detay: 'ozet'       // ozet | urun | musteri
  };

  var METRIK = [
    { k: 'tonaj', l: 'Tonaj', tip: 'ton' },
    { k: 'ciro', l: 'Ciro', tip: 'tl' },
    { k: 'siparis', l: 'Sipariş', tip: 'n' },
    { k: 'musteri', l: 'Müşteri', tip: 'n' },
    { k: 'urun', l: 'Ürün Çeşidi', tip: 'n' }
  ];

  /* Önerilen prim bandı — ciro üzerinden % (karar destek) */
  var PRIM_BAND = [
    { min: 0, max: 30, lo: 0.25, hi: 0.50, ad: 'Düşük' },
    { min: 30, max: 50, lo: 0.50, hi: 0.75, ad: 'Alt Orta' },
    { min: 50, max: 70, lo: 0.75, hi: 1.25, ad: 'Orta' },
    { min: 70, max: 85, lo: 1.25, hi: 1.75, ad: 'Üst Orta' },
    { min: 85, max: 101, lo: 1.75, hi: 2.50, ad: 'Yüksek' }
  ];

  var ISI = ['#FEF2F2', '#FECACA', '#F87171', '#DC2626', '#991B1B', '#6E0A16'];

  function injectCss() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('plas-rep-css')) return;
    var s = document.createElement('style');
    s.id = 'plas-rep-css';
    s.textContent = [
      '.pr-myil{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 10px}',
      '.pr-myil-c{flex:1;min-width:52px;text-align:center;padding:8px 4px;border-radius:8px;background:var(--slate-100,#F1F5F9);color:var(--slate-500);font-size:11px;font-weight:700;cursor:default;line-height:1.25}',
      '.pr-myil-c small{display:block;font-weight:600;font-size:10px;margin-top:2px;opacity:.9}',
      '.pr-myil-c.on{background:#1E3E90;color:#fff}',
      '.pr-myil-c.dolu{background:#DBEAFE;color:#1E3A8A;cursor:pointer}',
      '.pr-myil-c.off{background:#F8FAFC;color:#CBD5E1}',
      '.pr-myil-c.dis{opacity:.45}',
      '.pr-lej{display:flex;gap:14px;flex-wrap:wrap;padding:4px 16px 12px;font-size:11.5px;color:var(--slate-500)}',
      '.pr-lej span{display:inline-flex;align-items:center;gap:6px}',
      '.pr-lej i{width:12px;height:12px;border-radius:3px;display:inline-block}',
      '.pr-mc.a{color:#B91C1C}.pr-mc.d{color:#15803D}.pr-mc.n{color:var(--slate-400)}',
      'table.tbl.pr-isi td.pr-h{font-variant-numeric:tabular-nums}',
      'table.tbl.pr-isi th:first-child,table.tbl.pr-isi td:first-child{position:sticky;left:0;background:#fff;z-index:1}',
      'table.tbl.pr-isi tr.pr-tot td{background:#6E0A16;color:#fff;font-weight:700}',
      'table.tbl.pr-isi tr.pr-avg td{background:var(--slate-50,#F8FAFC);font-weight:600}',
      '.pr-skor{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}',
      '.pr-skor.s1{background:#FEF2F2;color:#991B1B}.pr-skor.s2{background:#FFF7ED;color:#C2410C}',
      '.pr-skor.s3{background:#FEF9C3;color:#A16207}.pr-skor.s4{background:#ECFDF5;color:#047857}',
      '.pr-skor.s5{background:#EEF2FF;color:#3730A3}',
      '.pr-help{font-size:11.5px;color:var(--slate-500);line-height:1.55;margin:0 0 12px}',
      '.pr-help b{color:var(--slate-700)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function g() { return global; }
  function esc(x) { return (g().esc || function (t) { return String(t == null ? '' : t); })(x); }
  function fmtTL(n) { return g().fmtTL(n); }
  function fmtN(n) { return g().fmtN(n); }
  function fmtTon(n) { return g().fmtTon(n); }

  function todayYM() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    var dt = new Date(y, m, 1);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  }

  function monthsBetween(from, to) {
    var out = [], cur = from;
    while (cur <= to) { out.push(cur); cur = addMonths(cur, 1); }
    return out;
  }

  function ayAd(ym) {
    var A = g().AYLAR_TR || [];
    var i = +ym.slice(5, 7) - 1;
    return (A[i] || ym.slice(5, 7)) + ' ' + ym.slice(0, 4);
  }

  function ay3(ym) {
    var K = g().AY_KISA || [];
    return (K[+ym.slice(5, 7) - 1] || ym.slice(5, 7)).toUpperCase();
  }

  function ensureYil() {
    if (!S.yil) S.yil = String(new Date().getFullYear());
    if (!S.ay) S.ay = todayYM();
  }

  function periodSpec() {
    ensureYil();
    var now = todayYM();
    var yil = S.yil;
    var months = [], label = '', from = '', to = '';
    if (S.donem === 'ay') {
      from = to = (S.ay && S.ay.slice(0, 4) === yil) ? S.ay : (yil + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
      if (from.slice(0, 4) !== yil) from = to = yil + '-01';
      months = [from];
      label = ayAd(from);
    } else if (S.donem === '3ay' || S.donem === '6ay') {
      var n = S.donem === '3ay' ? 3 : 6;
      to = now.slice(0, 4) === yil && now <= yil + '-12' ? (now < yil + '-01' ? yil + '-01' : now) : yil + '-12';
      if (to.slice(0, 4) !== yil) to = yil + '-12';
      from = addMonths(to, -(n - 1));
      if (from.slice(0, 4) !== yil) from = yil + '-01';
      months = monthsBetween(from, to);
      label = 'Son ' + n + ' ay · ' + ayAd(from) + ' – ' + ayAd(to);
    } else {
      from = yil + '-01';
      to = (now.slice(0, 4) === yil) ? now : yil + '-12';
      months = monthsBetween(from, to);
      label = yil + ' yılı · ' + ayAd(from) + ' – ' + ayAd(to);
    }
    return { from: from, to: to, months: months, label: label, yil: yil };
  }

  function emptyBucket() {
    return {
      tonaj: 0, ciro: 0, siparis: 0, cuval: 0,
      musteri: {}, urun: {}, yeni: {},
      iptal: 0, acik: 0, bayiAracili: 0, direkt: 0
    };
  }

  function safeTon(o) {
    try { return +g().orderTon(o) || 0; } catch (e) { return 0; }
  }
  function safeTotal(o) {
    try { return +g().orderTotal(o) || 0; } catch (e) { return 0; }
  }
  function safeTonOf(code, qty) {
    try { return +g().tonOf(code, qty) || 0; } catch (e) { return 0; }
  }
  function safePlas(o) {
    try { return g().ordPlasiyer(o); } catch (e) { return null; }
  }

  function addOrder(b, o, live) {
    var ton = safeTon(o);
    var cuval = (o.lines || []).reduce(function (s, l) { return s + (+l.qty || 0); }, 0);
    b.tonaj += ton;
    b.cuval += cuval;
    b.siparis += 1;
    if (live) {
      b.ciro += safeTotal(o);
      if (o.aliciBayi) b.bayiAracili += 1; else b.direkt += 1;
    }
    var cid = o.customerId || o.customer || '';
    if (cid && live) b.musteri[cid] = 1;
    (o.lines || []).forEach(function (l) {
      if (l && l.code) b.urun[l.code] = (b.urun[l.code] || 0) + (+l.qty || 0);
    });
  }

  function mergeBucket(a, b) {
    a.tonaj += b.tonaj; a.ciro += b.ciro; a.siparis += b.siparis; a.cuval += b.cuval;
    a.iptal += b.iptal; a.acik += b.acik; a.bayiAracili += b.bayiAracili; a.direkt += b.direkt;
    Object.keys(b.musteri).forEach(function (k) { a.musteri[k] = 1; });
    Object.keys(b.yeni).forEach(function (k) { a.yeni[k] = 1; });
    Object.keys(b.urun).forEach(function (k) { a.urun[k] = (a.urun[k] || 0) + b.urun[k]; });
    return a;
  }

  function countKeys(o) { return Object.keys(o || {}).length; }

  function firstSaleMap() {
    var map = {};
    (g().DB.orders || []).forEach(function (o) {
      if (!g().satisMi(o) || o.tarihsel) return;
      var cid = o.customerId;
      if (!cid) return;
      var t = g().satisTarihi(o);
      if (!t) return;
      if (!map[cid] || t < map[cid]) map[cid] = t;
    });
    return map;
  }

  function plasOrdersInScope(P) {
    var DB = g().DB;
    var from = P.from, to = P.to;
    var out = [];
    (DB.orders || []).forEach(function (o) {
      if (!o) return;
      var pl = safePlas(o);
      if (!pl) return;
      if (S.plasId && pl.id !== S.plasId) return;
      try {
        if (g().satisMi(o)) {
          var st = String(g().satisTarihi(o) || '');
          var ym = st.slice(0, 7);
          if (ym.length === 7 && ym >= from && ym <= to) out.push({ o: o, pl: pl, ym: ym, kind: 'teslim' });
        } else if (o.status === 'iptal') {
          var d = String(o.date || '').slice(0, 7);
          if (d.length === 7 && d >= from && d <= to) out.push({ o: o, pl: pl, ym: d, kind: 'iptal' });
        } else if (o.status !== 'iptal') {
          var d2 = String(o.date || '').slice(0, 7);
          if (d2.length === 7 && d2 >= from && d2 <= to) out.push({ o: o, pl: pl, ym: d2, kind: 'acik' });
        }
      } catch (e) { /* bozuk sipariş satırını atla */ }
    });
    return out;
  }

  function build() {
    var P = periodSpec();
    var first = firstSaleMap();
    var rows = plasOrdersInScope(P);
    var byPlas = {};
    var byAy = {};
    var byPlasAy = {};
    var byUrun = {};
    var byMusteri = {};

    P.months.forEach(function (ym) { byAy[ym] = emptyBucket(); });

    rows.forEach(function (r) {
      var id = r.pl.id;
      if (!byPlas[id]) byPlas[id] = { plas: r.pl, tot: emptyBucket(), ay: {} };
      if (!byPlas[id].ay[r.ym]) byPlas[id].ay[r.ym] = emptyBucket();
      if (!byPlasAy[id]) byPlasAy[id] = {};
      if (!byPlasAy[id][r.ym]) byPlasAy[id][r.ym] = emptyBucket();
      if (!byAy[r.ym]) byAy[r.ym] = emptyBucket();

      if (r.kind === 'iptal') {
        byPlas[id].tot.iptal++; byPlas[id].ay[r.ym].iptal++; byAy[r.ym].iptal++;
        return;
      }
      if (r.kind === 'acik') {
        byPlas[id].tot.acik++; byPlas[id].ay[r.ym].acik++; byAy[r.ym].acik++;
        return;
      }

      var live = !r.o.tarihsel;
      addOrder(byPlas[id].tot, r.o, live);
      addOrder(byPlas[id].ay[r.ym], r.o, live);
      addOrder(byAy[r.ym], r.o, live);
      addOrder(byPlasAy[id][r.ym], r.o, live);

      if (live && r.o.customerId && first[r.o.customerId] && first[r.o.customerId].slice(0, 7) === r.ym) {
        byPlas[id].tot.yeni[r.o.customerId] = 1;
        byPlas[id].ay[r.ym].yeni[r.o.customerId] = 1;
      }

      (r.o.lines || []).forEach(function (l) {
        if (!l || !l.code) return;
        var u = byUrun[l.code] || (byUrun[l.code] = { code: l.code, tonaj: 0, cuval: 0, ciro: 0, siparis: 0, musteri: {} });
        var t = safeTonOf(l.code, l.qty);
        u.tonaj += t; u.cuval += (+l.qty || 0);
        if (live) {
          u.ciro += (+l.price || 0) * (+l.qty || 0);
          if (r.o.customerId) u.musteri[r.o.customerId] = 1;
        }
      });
      if (live) {
        var mid = r.o.customerId || ('ad:' + (r.o.customer || '?'));
        var m = byMusteri[mid] || (byMusteri[mid] = {
          id: r.o.customerId || '', ad: r.o.customer || '(müşteri)', tonaj: 0, ciro: 0, siparis: 0, urun: {}, plasId: id
        });
        m.tonaj += safeTon(r.o);
        m.ciro += safeTotal(r.o);
        m.siparis += 1;
        (r.o.lines || []).forEach(function (l) { if (l && l.code) m.urun[l.code] = 1; });
      }
    });

    /* sipariş sayacı ürün için yaklaşık: her teslimde ürün varsa +1 — satır bazlı değil sipariş bazlı */
    rows.forEach(function (r) {
      if (r.kind !== 'teslim') return;
      var seen = {};
      (r.o.lines || []).forEach(function (l) {
        if (!l || !l.code || seen[l.code]) return;
        seen[l.code] = 1;
        if (byUrun[l.code]) byUrun[l.code].siparis += 1;
      });
    });

    var list = Object.keys(byPlas).map(function (id) {
      var x = byPlas[id];
      var t = x.tot;
      return {
        id: id,
        plas: x.plas,
        ay: x.ay,
        tonaj: t.tonaj,
        ciro: t.ciro,
        siparis: t.siparis,
        cuval: t.cuval,
        musteri: countKeys(t.musteri),
        urun: countKeys(t.urun),
        yeni: countKeys(t.yeni),
        iptal: t.iptal,
        acik: t.acik,
        bayiAracili: t.bayiAracili,
        direkt: t.direkt,
        teslimOran: (t.siparis + t.iptal) ? t.siparis / (t.siparis + t.iptal) : 1,
        ortSipTon: t.siparis ? t.tonaj / t.siparis : 0,
        ortSipCiro: t.siparis ? t.ciro / t.siparis : 0
      };
    }).sort(function (a, b) { return b.tonaj - a.tonaj; });

    scoreAll(list, P.months.length);

    var tot = emptyBucket();
    list.forEach(function (r) {
      tot.tonaj += r.tonaj; tot.ciro += r.ciro; tot.siparis += r.siparis; tot.cuval += r.cuval;
      tot.iptal += r.iptal; tot.acik += r.acik; tot.bayiAracili += r.bayiAracili; tot.direkt += r.direkt;
    });
    /* benzersiz müşteri/ürün dönem toplamı — satırların birleşimi */
    var allMus = {}, allUrun = {}, allYeni = {};
    Object.keys(byPlas).forEach(function (id) {
      Object.keys(byPlas[id].tot.musteri).forEach(function (k) { allMus[k] = 1; });
      Object.keys(byPlas[id].tot.urun).forEach(function (k) { allUrun[k] = 1; });
      Object.keys(byPlas[id].tot.yeni).forEach(function (k) { allYeni[k] = 1; });
    });

    return {
      P: P,
      list: list,
      byAy: byAy,
      byPlasAy: byPlasAy,
      byUrun: byUrun,
      byMusteri: byMusteri,
      tot: {
        tonaj: tot.tonaj, ciro: tot.ciro, siparis: tot.siparis, cuval: tot.cuval,
        musteri: countKeys(allMus), urun: countKeys(allUrun), yeni: countKeys(allYeni),
        iptal: tot.iptal, acik: tot.acik, bayiAracili: tot.bayiAracili, direkt: tot.direkt
      }
    };
  }

  function pctRank(val, arr) {
    if (!arr.length) return 50;
    /* tek plasiyerde göreli sıra anlamsız — faaliyeti varsa orta-üst band */
    if (arr.length === 1) return val > 0 ? 65 : 15;
    var below = arr.filter(function (x) { return x < val; }).length;
    var equal = arr.filter(function (x) { return x === val; }).length;
    return Math.round(100 * (below + 0.5 * equal) / arr.length);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function scoreAll(list, nAy) {
    if (!list.length) return;
    var tonArr = list.map(function (r) { return r.tonaj; });
    var ciroArr = list.map(function (r) { return r.ciro; });
    var musArr = list.map(function (r) { return r.musteri; });
    var yeniArr = list.map(function (r) { return r.yeni; });
    var urunArr = list.map(function (r) { return r.urun; });
    var frekArr = list.map(function (r) { return nAy ? r.siparis / nAy : r.siparis; });

    list.forEach(function (r) {
      var s =
        0.25 * pctRank(r.tonaj, tonArr) +
        0.20 * pctRank(r.ciro, ciroArr) +
        0.15 * pctRank(r.musteri, musArr) +
        0.10 * pctRank(r.yeni, yeniArr) +
        0.10 * pctRank(r.urun, urunArr) +
        0.10 * pctRank(nAy ? r.siparis / nAy : r.siparis, frekArr) +
        0.05 * clamp(r.teslimOran * 100, 0, 100) +
        0.05 * clamp((r.ortSipTon / 5) * 100, 0, 100); /* ~5 t ort. sipariş = tam puan */
      r.skor = Math.round(s);
      r.band = PRIM_BAND.find(function (b) { return r.skor >= b.min && r.skor < b.max; }) || PRIM_BAND[0];
      r.primOneri = r.band.lo + '–' + r.band.hi;
      /* kayıtlı karar */
      r.primKayit = (r.plas && r.plas.primOran != null && r.plas.primOran !== '') ? +r.plas.primOran : null;
    });
  }

  function skorSinif(sk) {
    if (sk >= 85) return 's5';
    if (sk >= 70) return 's4';
    if (sk >= 50) return 's3';
    if (sk >= 30) return 's2';
    return 's1';
  }

  function metrikDeg(b, k) {
    if (!b) return 0;
    if (k === 'tonaj') return b.tonaj || 0;
    if (k === 'ciro') return b.ciro || 0;
    if (k === 'siparis') return b.siparis || 0;
    if (k === 'musteri') return countKeys(b.musteri);
    if (k === 'urun') return countKeys(b.urun);
    return 0;
  }

  function bicim(v, tip) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
    if (tip === 'tl') return fmtTL(v);
    if (tip === 'ton') return fmtTon(v) + ' t';
    return fmtN(Math.round(v * 10) / 10);
  }

  function isiRenk(v, max) {
    if (!v || !max) return ISI[0];
    var t = v / max;
    var i = Math.min(ISI.length - 1, Math.floor(t * (ISI.length - 1)));
    return ISI[i];
  }

  function svgSeyir(D) {
    var months = D.P.months;
    if (!months.length) return '<div class="tbl-empty">Dönemde veri yok</div>';
    var vals = months.map(function (ym) {
      var b = D.byAy[ym] || emptyBucket();
      return { ym: ym, ton: b.tonaj || 0, ciro: b.ciro || 0, sip: b.siparis || 0 };
    });
    var kum = 0;
    vals.forEach(function (v) {
      kum += (S.metrik === 'ciro' ? v.ciro : S.metrik === 'siparis' ? v.sip : v.ton);
      v.val = S.metrik === 'ciro' ? v.ciro : S.metrik === 'siparis' ? v.sip : v.ton;
      v.kum = kum;
    });
    var series = vals.map(function (v) { return S.grafMod === 'kum' ? v.kum : v.val; });
    var max = Math.max.apply(null, series.concat([0.0001]));
    var W = Math.max(520, months.length * 72), H = 220, padL = 48, padB = 36, padT = 24, padR = 16;
    var iw = W - padL - padR, ih = H - padT - padB;
    var bw = Math.min(48, iw / months.length * 0.62);
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="display:block">');
    for (var gline = 0; gline <= 4; gline++) {
      var gy = padT + ih * gline / 4;
      parts.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#E5E8EC" stroke-width="1"/>');
      var gv = max * (1 - gline / 4);
      var glbl = S.metrik === 'ciro' ? (gv >= 1e6 ? (gv / 1e6).toFixed(1) + ' M₺' : fmtN(Math.round(gv / 1000)) + ' B₺')
        : S.metrik === 'siparis' ? fmtN(Math.round(gv)) : fmtTon(gv);
      parts.push('<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="#9CA2AA">' + esc(glbl) + '</text>');
    }
    vals.forEach(function (v, i) {
      var x = padL + (i + 0.5) * (iw / months.length);
      var h = (series[i] / max) * ih;
      var y = padT + ih - h;
      parts.push('<rect x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + Math.max(1, h) + '" rx="4" fill="#1E3E90"/>');
      var tip = METRIK.find(function (m) { return m.k === S.metrik; }) || METRIK[0];
      parts.push('<text x="' + x + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#1E3E90">' + esc(bicim(series[i], tip.tip).replace(' t', '')) + '</text>');
      parts.push('<text x="' + x + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#535A65">' + esc(ay3(v.ym)) + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function set(k, v) {
    S[k] = v;
    if (typeof g().render === 'function') g().render();
  }

  function savePrim(id, val) {
    var p = g().plasById(id);
    if (!p || !g().isAdmin || !g().isAdmin()) { if (g().toast) g().toast('Sadece yönetici'); return; }
    var n = parseFloat(String(val).replace(',', '.'));
    if (val === '' || val == null) delete p.primOran;
    else if (isNaN(n) || n < 0 || n > 20) { if (g().toast) g().toast('Prim % 0–20 arası olmalı'); return; }
    else p.primOran = Math.round(n * 100) / 100;
    if (g().logAct) g().logAct('Plasiyer prim oranı: ' + p.name + ' → ' + (p.primOran != null ? '%' + p.primOran : 'kaldırıldı'));
    if (g().saveDB) g().saveDB();
    if (g().toast) g().toast('Prim oranı kaydedildi');
    if (g().render) g().render();
  }

  function yearsAvailable() {
    var ys = {};
    (g().DB.orders || []).forEach(function (o) {
      try {
        if (!g().satisMi(o)) return;
        if (!safePlas(o)) return;
        var y = String(g().satisTarihi(o) || '').slice(0, 4);
        if (y && y.length === 4) ys[y] = 1;
      } catch (e) { /* skip */ }
    });
    var arr = Object.keys(ys).sort();
    if (!arr.length) arr = [String(new Date().getFullYear())];
    return arr;
  }

  function html() {
    injectCss();
    ensureYil();
    var D;
    try { D = build(); }
    catch (e) {
      console.error('plasiyerRapor.build', e);
      throw e;
    }
    var tip = METRIK.find(function (m) { return m.k === S.metrik; }) || METRIK[0];
    var years = yearsAvailable();
    if (years.indexOf(S.yil) < 0) S.yil = years[years.length - 1];

    var h = '';
    h += '<div class="pr-help"><b>Plasiyer Aktüerya Raporu</b> — teslim edilen satışlar üzerinden ürün, müşteri ve dönem parametrelerini puanlar; önerilen prim bandı karar destek amaçlıdır. Kayıtlı prim oranı plasiyer kartına yazılır (henüz otomatik hakediş yok).</div>';

    /* kontroller */
    h += '<div class="filters" style="margin-bottom:12px">';
    [['ay', 'Aylık'], ['3ay', '3 Aylık'], ['6ay', '6 Aylık'], ['yil', 'Yıllık']].forEach(function (d) {
      h += '<button class="btn btn-sm' + (S.donem === d[0] ? ' btn-pri' : '') + '" onclick="plasiyerRapor.set(\'donem\',\'' + d[0] + '\')">' + d[1] + '</button>';
    });
    h += '<select onchange="plasiyerRapor.set(\'yil\',this.value)" style="margin-left:6px">' +
      years.map(function (y) { return '<option value="' + y + '"' + (S.yil === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') +
      '</select>';
    if (S.donem === 'ay') {
      h += '<select onchange="plasiyerRapor.set(\'ay\',this.value)">';
      for (var mi = 1; mi <= 12; mi++) {
        var ym = S.yil + '-' + String(mi).padStart(2, '0');
        h += '<option value="' + ym + '"' + (S.ay === ym ? ' selected' : '') + '>' + (g().AYLAR_TR[mi - 1] || mi) + '</option>';
      }
      h += '</select>';
    }
    h += '<select onchange="plasiyerRapor.set(\'plasId\',this.value)" title="Plasiyer" style="min-width:160px"><option value="">Tüm plasiyerler</option>';
    (g().DB.plasiyerler || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); }).forEach(function (p) {
      h += '<option value="' + esc(p.id) + '"' + (S.plasId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    h += '</select>';
    h += '<span style="margin-left:auto;font-size:12px;font-weight:600;color:var(--blue-800)">' + esc(D.P.label) + '</span>';
    h += '</div>';

    /* ay şeridi (yıllık / çok aylı) */
    if (S.donem !== 'ay') {
      h += '<div class="pr-myil">';
      for (var m = 1; m <= 12; m++) {
        var ym2 = S.yil + '-' + String(m).padStart(2, '0');
        var b = D.byAy[ym2];
        var inScope = D.P.months.indexOf(ym2) >= 0;
        var cls = !inScope ? 'dis' : (b && b.siparis ? 'dolu' : 'off');
        if (S.ay === ym2 && S.donem === 'ay') cls = 'on';
        var small = b && b.siparis ? fmtTon(b.tonaj) + ' t' : '—';
        h += '<div class="pr-myil-c ' + cls + '"' + (inScope && b && b.siparis ? ' onclick="plasiyerRapor.set(\'donem\',\'ay\');plasiyerRapor.set(\'ay\',\'' + ym2 + '\')"' : '') + '>' +
          (g().AY_KISA[m - 1] || m) + '<small>' + small + '</small></div>';
      }
      h += '</div>';
      h += '<div class="pr-help">Şeritteki dolu aylara tıklayınca <b>Aylık</b> görünüme geçilir. Ortalamalar dönemin ay sayısına (' + D.P.months.length + ') bölünür.</div>';
    }

    /* KPI */
    var T = D.tot;
    var nAy = D.P.months.length || 1;
    h += '<div class="kpis">';
    h += '<div class="kpi"><div class="kl">Toplam Tonaj</div><div class="kv" style="font-size:18px">' + fmtTon(T.tonaj) + ' t</div><div class="ks">aylık ort. ' + fmtTon(T.tonaj / nAy) + ' t</div></div>';
    h += '<div class="kpi g"><div class="kl">Toplam Ciro</div><div class="kv" style="font-size:18px">' + fmtTL(T.ciro) + '</div><div class="ks">canlı sipariş · tarihsel hariç</div></div>';
    h += '<div class="kpi p"><div class="kl">Sipariş</div><div class="kv">' + fmtN(T.siparis) + '</div><div class="ks">' + fmtN(T.cuval) + ' çuval</div></div>';
    h += '<div class="kpi a"><div class="kl">Aktif Müşteri</div><div class="kv">' + fmtN(T.musteri) + '</div><div class="ks">yeni ' + fmtN(T.yeni) + ' · çeşit ' + fmtN(T.urun) + '</div></div>';
    h += '<div class="kpi s"><div class="kl">Kanal</div><div class="kv" style="font-size:16px">' + fmtN(T.direkt) + ' / ' + fmtN(T.bayiAracili) + '</div><div class="ks">direkt · bayi aracılı</div></div>';
    h += '<div class="kpi r"><div class="kl">Plasiyer</div><div class="kv">' + fmtN(D.list.length) + '</div><div class="ks">dönemde satışı olan</div></div>';
    h += '</div>';

    /* seyir */
    h += '<div class="card"><div class="card-hd"><h3>Performans Seyri · ' + esc(D.P.label) + '</h3><div style="display:flex;gap:6px;flex-wrap:wrap">';
    METRIK.forEach(function (m) {
      h += '<button class="btn btn-sm' + (S.metrik === m.k ? ' btn-pri' : '') + '" onclick="plasiyerRapor.set(\'metrik\',\'' + m.k + '\')">' + m.l + '</button>';
    });
    h += '<button class="btn btn-sm' + (S.grafMod === 'ay' ? ' btn-pri' : '') + '" style="margin-left:8px" onclick="plasiyerRapor.set(\'grafMod\',\'ay\')">Aylık</button>';
    h += '<button class="btn btn-sm' + (S.grafMod === 'kum' ? ' btn-pri' : '') + '" onclick="plasiyerRapor.set(\'grafMod\',\'kum\')">Kümülatif</button>';
    h += '</div></div><div style="padding:8px 12px 0">' + svgSeyir(D) + '</div>';
    h += '<div class="pr-lej"><span><i style="background:#1E3E90"></i> ' + esc(tip.l) + (S.grafMod === 'kum' ? ' (kümülatif)' : '') + '</span></div>';

    /* aylık tablo */
    h += '<div class="card-bd" style="overflow-x:auto;padding-top:0"><table class="tbl"><thead><tr>';
    h += '<th>Ay</th><th class="num">Tonaj</th><th class="num">Ciro</th><th class="num">Sipariş</th><th class="num">Çuval</th><th class="num">Müşteri</th><th class="num">Ürün</th><th class="num">Yeni Müş.</th><th class="num">Ort. Sip. Ton</th><th class="num">Δ Tonaj</th></tr></thead><tbody>';
    var onceki = null;
    D.P.months.forEach(function (ym) {
      var b = D.byAy[ym] || emptyBucket();
      var ort = b.siparis ? b.tonaj / b.siparis : 0;
      var dlt = onceki != null && onceki > 0 ? ((b.tonaj - onceki) / onceki * 100) : null;
      h += '<tr><td><b>' + esc(ayAd(ym)) + '</b></td>';
      h += '<td class="num">' + fmtTon(b.tonaj) + ' t</td>';
      h += '<td class="num">' + fmtTL(b.ciro) + '</td>';
      h += '<td class="num">' + fmtN(b.siparis) + '</td>';
      h += '<td class="num">' + fmtN(b.cuval) + '</td>';
      h += '<td class="num">' + fmtN(countKeys(b.musteri)) + '</td>';
      h += '<td class="num">' + fmtN(countKeys(b.urun)) + '</td>';
      h += '<td class="num">' + fmtN(countKeys(b.yeni)) + '</td>';
      h += '<td class="num">' + fmtTon(ort) + ' t</td>';
      h += '<td class="num">' + (dlt == null ? '<span class="pr-mc n">—</span>' : '<span class="pr-mc ' + (dlt > 0 ? 'a' : dlt < 0 ? 'd' : 'n') + '">' + (dlt > 0 ? '▲' : dlt < 0 ? '▼' : '') + ' %' + fmtN(Math.abs(Math.round(dlt))) + '</span>') + '</td></tr>';
      onceki = b.tonaj;
    });
    h += '<tr class="pr-tot" style="background:#6E0A16;color:#fff;font-weight:700"><td>DÖNEM TOPLAMI (' + nAy + ' ay)</td>';
    h += '<td class="num" style="color:#fff">' + fmtTon(T.tonaj) + ' t</td>';
    h += '<td class="num" style="color:#fff">' + fmtTL(T.ciro) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtN(T.siparis) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtN(T.cuval) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtN(T.musteri) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtN(T.urun) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtN(T.yeni) + '</td>';
    h += '<td class="num" style="color:#fff">' + fmtTon(T.siparis ? T.tonaj / T.siparis : 0) + ' t</td><td class="num">—</td></tr>';
    h += '<tr style="background:var(--slate-50);font-weight:600"><td>AYLIK ORTALAMA (n=' + nAy + ')</td>';
    h += '<td class="num">' + fmtTon(T.tonaj / nAy) + ' t</td>';
    h += '<td class="num">' + fmtTL(T.ciro / nAy) + '</td>';
    h += '<td class="num">' + fmtN(Math.round(T.siparis / nAy * 10) / 10) + '</td>';
    h += '<td class="num">' + fmtN(Math.round(T.cuval / nAy)) + '</td>';
    h += '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>';
    h += '</tbody></table></div></div>';

    /* skor / prim karar tablosu */
    h += '<div class="card" style="margin-top:16px"><div class="card-hd"><h3>Aktüerya Skoru & Prim Önerisi</h3>';
    h += '<span style="font-size:11px;color:var(--slate-400)">göreli sıralama + mutlak kalite · kayıtlı oran kararınızdır</span></div>';
    h += '<div class="card-bd" style="overflow-x:auto"><table class="tbl"><thead><tr>';
    h += '<th>Plasiyer</th><th class="num">Tonaj</th><th class="num">Ciro</th><th class="num">Sipariş</th><th class="num">Müşteri</th><th class="num">Yeni</th><th class="num">Ürün</th><th class="num">Ort. Ton</th><th class="num">Teslim %</th><th class="num">Skor</th><th>Öneri Bandı</th><th class="num">Kayıtlı Prim %</th></tr></thead><tbody>';
    if (!D.list.length) {
      h += '<tr><td colspan="12" class="tbl-empty">Bu dönemde plasiyer satışı yok</td></tr>';
    } else {
      D.list.forEach(function (r) {
        h += '<tr>';
        h += '<td><b>' + esc(r.plas.name) + '</b>' + (r.plas.city ? '<div style="font-size:10px;color:var(--slate-400)">' + esc(r.plas.city) + '</div>' : '') + '</td>';
        h += '<td class="num">' + fmtTon(r.tonaj) + ' t</td>';
        h += '<td class="num">' + fmtTL(r.ciro) + '</td>';
        h += '<td class="num">' + fmtN(r.siparis) + '</td>';
        h += '<td class="num">' + fmtN(r.musteri) + '</td>';
        h += '<td class="num">' + fmtN(r.yeni) + '</td>';
        h += '<td class="num">' + fmtN(r.urun) + '</td>';
        h += '<td class="num">' + fmtTon(r.ortSipTon) + ' t</td>';
        h += '<td class="num">%' + fmtN(Math.round(r.teslimOran * 100)) + '</td>';
        h += '<td class="num"><span class="pr-skor ' + skorSinif(r.skor) + '">' + r.skor + '</span></td>';
        h += '<td><b>%' + esc(r.primOneri) + '</b><div style="font-size:10px;color:var(--slate-400)">' + esc(r.band.ad) + '</div></td>';
        h += '<td class="num"><input type="number" min="0" max="20" step="0.05" value="' + (r.primKayit != null ? r.primKayit : '') + '" placeholder="—" style="width:72px;padding:5px 7px;border:1px solid var(--slate-300);border-radius:6px;text-align:right" onchange="plasiyerRapor.savePrim(\'' + r.id + '\',this.value)" title="Ciro üzerinden kararlaştırılan prim %"></td>';
        h += '</tr>';
      });
    }
    h += '</tbody></table></div>';
    h += '<div style="padding:10px 16px;font-size:11.5px;color:var(--slate-500);line-height:1.55">Skor ağırlıkları: Tonaj %25 · Ciro %20 · Müşteri %15 · Yeni müşteri %10 · Ürün çeşitliliği %10 · Sipariş sıklığı %10 · Teslim oranı %5 · Ort. sipariş tonajı %5. Göreli sıralama (plasiyerler arası yüzdelik dilim) kullanılır; tek plasiyerde skor orta bandda kalır.</div></div>';

    /* heatmap plasiyer × ay */
    h += matrisHtml(D, tip);

    /* detay sekmeleri */
    h += '<div class="card" style="margin-top:16px"><div class="card-hd"><h3>Kırılım Detayı</h3><div style="display:flex;gap:6px">';
    [['ozet', 'Özet'], ['urun', 'Ürün Bazlı'], ['musteri', 'Müşteri Bazlı']].forEach(function (d) {
      h += '<button class="btn btn-sm' + (S.detay === d[0] ? ' btn-pri' : '') + '" onclick="plasiyerRapor.set(\'detay\',\'' + d[0] + '\')">' + d[1] + '</button>';
    });
    h += '</div></div><div class="card-bd" style="overflow-x:auto">';
    if (S.detay === 'urun') h += urunTablo(D);
    else if (S.detay === 'musteri') h += musteriTablo(D);
    else h += ozetKırılım(D);
    h += '</div></div>';

    /* yöntem */
    h += '<div class="card" style="margin-top:16px"><div class="card-hd"><h3>Yöntem Notu</h3></div><div class="card-bd" style="padding:16px;font-size:12.5px;color:var(--slate-600);line-height:1.75">';
    h += '<b>1.</b> Satış = <b>teslim</b> edilen sipariş; tarih = fiili teslim tarihi (yoksa teslim/sipariş tarihi).<br>';
    h += '<b>2.</b> Plasiyer eşlemesi: sipariş damgası → <code>bayiPlasiyerId</code> → müşteri.plasiyerId → <b>müşterinin bayisinin plasiyeri</b> (Saha ataması) → Alıcı:Bayi.<br>';
    h += '<b>3.</b> Ciro yalnız canlı siparişlerden; tarihsel arşiv tonaj/çuvala girer, ciroya girmez.<br>';
    h += '<b>4.</b> Yeni müşteri = dönem içinde ilk teslimini yapan müşteri.<br>';
    h += '<b>5.</b> Önerilen prim bandı ciro üzerinden % aralığıdır — bağlayıcı değildir. Kararınızı <b>Kayıtlı Prim %</b> alanına yazın.<br>';
    h += '<b>6.</b> Otomatik prim hakediş/ödeme bu rapordan sonra ayrı bağlanabilir (danışman priminden bağımsız).';
    h += '</div></div>';

    return h;
  }

  function matrisHtml(D, tip) {
    var months = D.P.months;
    var max = 0;
    D.list.forEach(function (r) {
      months.forEach(function (ym) {
        var v = metrikDeg(r.ay[ym], tip.k);
        if (v > max) max = v;
      });
    });
    var h = '<div class="card" style="margin-top:16px"><div class="card-hd"><h3>Plasiyer × Ay Kıyaslaması</h3><div style="display:flex;gap:6px;flex-wrap:wrap">';
    METRIK.forEach(function (m) {
      h += '<button class="btn btn-sm' + (S.metrik === m.k ? ' btn-pri' : '') + '" onclick="plasiyerRapor.set(\'metrik\',\'' + m.k + '\')">' + m.l + '</button>';
    });
    h += '</div></div><div class="card-bd" style="overflow-x:auto"><table class="tbl pr-isi"><thead><tr><th>Plasiyer</th>';
    months.forEach(function (ym) { h += '<th class="num">' + esc(ay3(ym)) + '</th>'; });
    h += '<th class="num">TOPLAM</th><th class="num">Ort./Ay</th></tr></thead><tbody>';
    if (!D.list.length) {
      h += '<tr><td colspan="' + (months.length + 3) + '" class="tbl-empty">Veri yok</td></tr>';
    } else {
      D.list.forEach(function (r) {
        var rowTot = tip.k === 'musteri' || tip.k === 'urun'
          ? (tip.k === 'musteri' ? r.musteri : r.urun)
          : (tip.k === 'tonaj' ? r.tonaj : tip.k === 'ciro' ? r.ciro : r.siparis);
        h += '<tr><td><b>' + esc(r.plas.name) + '</b></td>';
        months.forEach(function (ym) {
          var v = metrikDeg(r.ay[ym], tip.k);
          var bg = isiRenk(v, max);
          var fg = (v / (max || 1)) > 0.55 ? '#fff' : 'var(--slate-800)';
          h += '<td class="num pr-h" style="background:' + bg + ';color:' + fg + '">' + (v ? bicim(v, tip.tip) : '—') + '</td>';
        });
        h += '<td class="num"><b>' + bicim(rowTot, tip.tip) + '</b></td>';
        h += '<td class="num">' + ((tip.k === 'musteri' || tip.k === 'urun') ? '—' : bicim(rowTot / (months.length || 1), tip.tip)) + '</td></tr>';
      });
      /* genel */
      h += '<tr style="background:#E8F1FB;font-weight:700"><td>GENEL</td>';
      months.forEach(function (ym) {
        var v = metrikDeg(D.byAy[ym], tip.k);
        h += '<td class="num">' + (v ? bicim(v, tip.tip) : '—') + '</td>';
      });
      var gTot = tip.k === 'tonaj' ? D.tot.tonaj : tip.k === 'ciro' ? D.tot.ciro : tip.k === 'siparis' ? D.tot.siparis : tip.k === 'musteri' ? D.tot.musteri : D.tot.urun;
      h += '<td class="num">' + bicim(gTot, tip.tip) + '</td>';
      h += '<td class="num">' + ((tip.k === 'musteri' || tip.k === 'urun') ? '—' : bicim(gTot / (months.length || 1), tip.tip)) + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<div style="padding:8px 16px;font-size:11.5px;color:var(--slate-500)">Isı haritası seçili metrikte dönemin en yüksek hücresine göre boyanır. Müşteri/ürün sütun toplamları benzersiz sayıdır; ayların toplamı değildir.</div></div>';
    return h;
  }

  function urunTablo(D) {
    var rows = Object.keys(D.byUrun).map(function (c) {
      var u = D.byUrun[c];
      var p = g().prodByCode(c);
      return {
        code: c, ad: (p && p.name) || c,
        tonaj: u.tonaj, cuval: u.cuval, ciro: u.ciro, siparis: u.siparis, musteri: countKeys(u.musteri)
      };
    }).sort(function (a, b) { return b.tonaj - a.tonaj; });
    if (!rows.length) return '<div class="tbl-empty">Ürün satışı yok</div>';
    var h = '<table class="tbl"><thead><tr><th>Ürün</th><th class="num">Tonaj</th><th class="num">Çuval</th><th class="num">Ciro</th><th class="num">Sipariş</th><th class="num">Müşteri</th><th class="num">Pay (ton)</th></tr></thead><tbody>';
    var tonSum = rows.reduce(function (s, r) { return s + r.tonaj; }, 0) || 1;
    rows.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.code) + '</b><div style="font-size:10px;color:var(--slate-400)">' + esc(r.ad) + '</div></td>';
      h += '<td class="num">' + fmtTon(r.tonaj) + ' t</td><td class="num">' + fmtN(r.cuval) + '</td><td class="num">' + fmtTL(r.ciro) + '</td>';
      h += '<td class="num">' + fmtN(r.siparis) + '</td><td class="num">' + fmtN(r.musteri) + '</td>';
      h += '<td class="num">%' + fmtN(Math.round(r.tonaj / tonSum * 1000) / 10) + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  function musteriTablo(D) {
    var rows = Object.keys(D.byMusteri).map(function (k) { return D.byMusteri[k]; })
      .sort(function (a, b) { return b.tonaj - a.tonaj; });
    if (!rows.length) return '<div class="tbl-empty">Müşteri satışı yok</div>';
    var h = '<table class="tbl"><thead><tr><th>Müşteri</th><th>Plasiyer</th><th class="num">Tonaj</th><th class="num">Ciro</th><th class="num">Sipariş</th><th class="num">Ürün Çeşidi</th><th class="num">Ort. Sip.</th></tr></thead><tbody>';
    rows.slice(0, 200).forEach(function (r) {
      var pl = g().plasById(r.plasId);
      h += '<tr><td><b>' + esc(r.ad) + '</b></td><td style="font-size:11.5px">' + esc(pl ? pl.name : '—') + '</td>';
      h += '<td class="num">' + fmtTon(r.tonaj) + ' t</td><td class="num">' + fmtTL(r.ciro) + '</td>';
      h += '<td class="num">' + fmtN(r.siparis) + '</td><td class="num">' + fmtN(countKeys(r.urun)) + '</td>';
      h += '<td class="num">' + fmtTL(r.siparis ? r.ciro / r.siparis : 0) + '</td></tr>';
    });
    h += '</tbody></table>';
    if (rows.length > 200) h += '<div style="padding:8px 0;font-size:11px;color:var(--slate-400)">İlk 200 müşteri gösteriliyor (tonaj sırası).</div>';
    return h;
  }

  function ozetKırılım(D) {
    var h = '<table class="tbl"><thead><tr><th>Plasiyer</th><th class="num">Direkt</th><th class="num">Bayi Aracılı</th><th class="num">Açık Sip.</th><th class="num">İptal</th><th class="num">Çuval</th><th class="num">Ciro/Ton</th></tr></thead><tbody>';
    if (!D.list.length) return '<div class="tbl-empty">Veri yok</div>';
    D.list.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.plas.name) + '</b></td>';
      h += '<td class="num">' + fmtN(r.direkt) + '</td><td class="num">' + fmtN(r.bayiAracili) + '</td>';
      h += '<td class="num">' + fmtN(r.acik) + '</td><td class="num">' + fmtN(r.iptal) + '</td>';
      h += '<td class="num">' + fmtN(r.cuval) + '</td>';
      h += '<td class="num">' + (r.tonaj ? fmtTL(r.ciro / r.tonaj) + '/t' : '—') + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  global.plasiyerRapor = {
    state: S,
    set: set,
    html: html,
    build: build,
    savePrim: savePrim
  };
})(typeof window !== 'undefined' ? window : globalThis);
