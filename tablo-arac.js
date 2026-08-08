/* Rota Yem — tablo araçları: arama kutusu, Excel tipi sütun filtresi, sütun genişletme */
(function (global) {
  'use strict';
  var PREFIX = 'rota_ta_';
  var openPop = null;

  function injectCss() {
    if (document.getElementById('ta-css')) return;
    var s = document.createElement('style');
    s.id = 'ta-css';
    s.textContent = [
      '.ta-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px;padding:0 2px}',
      '.ta-search{flex:1;min-width:160px;padding:7px 11px 7px 32px;border:1px solid var(--slate-300,#D0D5DA);border-radius:6px;font-size:12.5px;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'15\' height=\'15\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239CA2AA\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'/%3E%3Cpath d=\'m21 21-4.3-4.3\'/%3E%3C/svg%3E") 10px center no-repeat;color:var(--slate-700,#3D4450)}',
      '.ta-search:focus{outline:none;border-color:var(--blue-600,#1E3E90);box-shadow:0 0 0 3px rgba(30,62,144,.14)}',
      '.ta-meta{font-size:11px;color:var(--slate-400,#9CA2AA);white-space:nowrap;font-weight:600}',
      '.ta-clear{font-size:11px;padding:5px 9px;border:1px solid var(--slate-300,#D0D5DA);border-radius:6px;background:#fff;color:var(--slate-600,#535A65);cursor:pointer;font-weight:600}',
      '.ta-clear:hover{background:var(--slate-50,#FAFBFD)}',
      'table.tbl.ta-on{table-layout:fixed}',
      'table.tbl.ta-on th{position:sticky;top:0;z-index:3;overflow:visible}',
      '.ta-th{display:flex;align-items:center;gap:4px;min-width:0;position:relative;padding-right:8px}',
      '.ta-th-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.ta-filt{flex:none;width:18px;height:18px;border:none;background:transparent;border-radius:4px;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--slate-400,#9CA2AA)}',
      '.ta-filt:hover,.ta-filt.on{background:var(--blue-50,#F4F7FB);color:var(--blue-700,#182F73)}',
      '.ta-filt.active{color:#B45309;background:#FEF3C7}',
      '.ta-filt svg{width:12px;height:12px;display:block}',
      '.ta-handle{position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:4}',
      '.ta-handle:hover,.ta-handle.drag{background:rgba(30,62,144,.18)}',
      '.ta-pop{position:fixed;z-index:10050;min-width:200px;max-width:280px;max-height:320px;background:#fff;border:1px solid var(--slate-200,#E5E8EC);border-radius:8px;box-shadow:0 8px 28px rgba(13,24,48,.16);display:flex;flex-direction:column;font-size:12px}',
      '.ta-pop-hd{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--slate-100,#F3F5F7)}',
      '.ta-pop-hd input{flex:1;padding:5px 8px;border:1px solid var(--slate-300,#D0D5DA);border-radius:5px;font-size:12px}',
      '.ta-pop-bd{overflow:auto;padding:6px 0;flex:1}',
      '.ta-pop-bd label{display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;user-select:none}',
      '.ta-pop-bd label:hover{background:var(--slate-50,#FAFBFD)}',
      '.ta-pop-bd label span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ta-pop-ft{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--slate-100,#F3F5F7)}',
      '.ta-pop-ft button{flex:1;padding:5px 8px;border:1px solid var(--slate-300,#D0D5DA);border-radius:5px;background:#fff;font-size:11px;font-weight:600;cursor:pointer;color:var(--slate-700,#3D4450)}',
      '.ta-pop-ft button:hover{background:var(--slate-50,#FAFBFD)}',
      'tr.ta-hide{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();
  }

  function cellText(td) {
    if (!td) return '';
    return (td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function thLabel(th) {
    var lab = th.querySelector('.ta-th-label');
    if (lab) return (lab.textContent || '').trim();
    return (th.textContent || '').trim();
  }

  function isActionCol(th, colIdx, rows) {
    var label = thLabel(th);
    if (!label || label === '—' || label === '#') return true;
    if (!rows.length) return false;
    var btnish = 0, sample = Math.min(rows.length, 12);
    for (var i = 0; i < sample; i++) {
      var td = rows[i].cells[colIdx];
      if (!td) continue;
      if (td.querySelector('button,a.btn,.btn,.kom-actions,.btn-ic')) btnish++;
      else if (!cellText(td) || cellText(td) === '—') btnish += 0.3;
    }
    return btnish >= sample * 0.7;
  }

  function storageKey(table, view) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
      return thLabel(th) || '';
    }).join('|').slice(0, 80);
    return PREFIX + (view || 'x') + '_' + heads.length + '_' + norm(heads).replace(/\s+/g, '_').slice(0, 60);
  }

  function dataRows(table) {
    var tb = table.tBodies[0];
    if (!tb) return [];
    return Array.prototype.filter.call(tb.rows, function (tr) {
      if (tr.querySelector('.tbl-empty,.bos')) return false;
      return tr.cells.length > 1;
    });
  }

  function closePop() {
    if (openPop && openPop.parentNode) openPop.parentNode.removeChild(openPop);
    openPop = null;
    document.querySelectorAll('.ta-filt.on').forEach(function (b) { b.classList.remove('on'); });
  }

  function applyFilters(st) {
    var q = norm(st.search || '');
    var rows = dataRows(st.table);
    var shown = 0;
    rows.forEach(function (tr) {
      var ok = true;
      if (q) {
        ok = norm(tr.innerText || '').indexOf(q) >= 0;
      }
      if (ok) {
        Object.keys(st.colFilters).forEach(function (ci) {
          var set = st.colFilters[ci];
          if (!set) return;
          var val = cellText(tr.cells[+ci]) || '(boş)';
          if (!set[val]) ok = false;
        });
      }
      tr.classList.toggle('ta-hide', !ok);
      if (ok) shown++;
    });
    if (st.meta) st.meta.textContent = shown + ' / ' + rows.length;
    Object.keys(st.filtBtns).forEach(function (ci) {
      st.filtBtns[ci].classList.toggle('active', !!st.colFilters[ci]);
    });
    if (st.clearBtn) st.clearBtn.style.display = (q || Object.keys(st.colFilters).length) ? '' : 'none';
  }

  function uniqueValues(rows, colIdx) {
    var map = {}, out = [];
    rows.forEach(function (tr) {
      var v = cellText(tr.cells[colIdx]) || '(boş)';
      if (!map[v]) { map[v] = 1; out.push(v); }
    });
    out.sort(function (a, b) { return a.localeCompare(b, 'tr', { sensitivity: 'base' }); });
    return out.slice(0, 250);
  }

  function openFilter(st, colIdx, btn) {
    closePop();
    var rows = dataRows(st.table);
    var vals = uniqueValues(rows, colIdx);
    var selected = st.colFilters[colIdx] ? Object.assign({}, st.colFilters[colIdx]) : null;
    var allOn = !selected;

    var pop = document.createElement('div');
    pop.className = 'ta-pop';
    pop.innerHTML =
      '<div class="ta-pop-hd"><input type="search" placeholder="Değer ara…"></div>' +
      '<div class="ta-pop-bd"></div>' +
      '<div class="ta-pop-ft"><button type="button" data-a="all">Tümü</button><button type="button" data-a="none">Hiçbiri</button><button type="button" data-a="ok">Uygula</button></div>';
    document.body.appendChild(pop);
    openPop = pop;
    btn.classList.add('on');

    var bd = pop.querySelector('.ta-pop-bd');
    var qIn = pop.querySelector('input');
    var checks = {};

    function paint(filterQ) {
      var nq = norm(filterQ || '');
      bd.innerHTML = '';
      vals.forEach(function (v) {
        if (nq && norm(v).indexOf(nq) < 0) return;
        var lab = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = allOn ? true : !!(selected && selected[v]);
        checks[v] = cb;
        var sp = document.createElement('span');
        sp.textContent = v;
        sp.title = v;
        lab.appendChild(cb);
        lab.appendChild(sp);
        bd.appendChild(lab);
      });
      if (!bd.children.length) {
        bd.innerHTML = '<div style="padding:12px;color:#9CA2AA;text-align:center">Eşleşme yok</div>';
      }
    }
    paint('');
    qIn.addEventListener('input', function () { paint(qIn.value); });

    pop.querySelector('[data-a="all"]').onclick = function () {
      allOn = true; selected = null;
      Object.keys(checks).forEach(function (v) { checks[v].checked = true; });
    };
    pop.querySelector('[data-a="none"]').onclick = function () {
      allOn = false; selected = {};
      Object.keys(checks).forEach(function (v) { checks[v].checked = false; });
    };
    pop.querySelector('[data-a="ok"]').onclick = function () {
      var map = {}, n = 0, tot = 0;
      vals.forEach(function (v) {
        tot++;
        var cb = checks[v];
        var on = cb ? cb.checked : (allOn || (selected && selected[v]));
        if (on) { map[v] = 1; n++; }
      });
      if (n === 0) {
        /* hiçbiri = tüm satırlar gizlensin diye boş set */
        st.colFilters[colIdx] = {};
      } else if (n === tot) {
        delete st.colFilters[colIdx];
      } else {
        st.colFilters[colIdx] = map;
      }
      closePop();
      applyFilters(st);
    };

    var r = btn.getBoundingClientRect();
    var left = Math.min(r.left, window.innerWidth - 290);
    var top = r.bottom + 4;
    if (top + 320 > window.innerHeight) top = Math.max(8, r.top - 324);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = top + 'px';

    setTimeout(function () {
      function out(e) {
        if (pop.contains(e.target) || btn.contains(e.target)) return;
        closePop();
        document.removeEventListener('mousedown', out, true);
      }
      document.addEventListener('mousedown', out, true);
    }, 0);
    qIn.focus();
  }

  function enableResize(st, th, colIdx) {
    var handle = document.createElement('div');
    handle.className = 'ta-handle';
    handle.title = 'Sütun genişliğini sürükle';
    th.style.position = 'relative';
    th.appendChild(handle);
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('drag');
      var startX = e.clientX;
      var startW = th.offsetWidth;
      var table = st.table;
      table.classList.add('ta-on');
      /* sabit layout için tüm sütunlara mevcut genişliği bas */
      var heads = table.querySelectorAll('thead th');
      for (var i = 0; i < heads.length; i++) {
        if (!heads[i].style.width) heads[i].style.width = heads[i].offsetWidth + 'px';
      }
      function move(ev) {
        var w = Math.max(48, startW + (ev.clientX - startX));
        th.style.width = w + 'px';
        th.style.minWidth = w + 'px';
      }
      function up() {
        handle.classList.remove('drag');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        try {
          var widths = [];
          for (var i = 0; i < heads.length; i++) widths.push(parseInt(heads[i].style.width, 10) || heads[i].offsetWidth);
          localStorage.setItem(st.key + '_w', JSON.stringify(widths));
        } catch (err) { /* ignore */ }
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function restoreWidths(st) {
    try {
      var raw = localStorage.getItem(st.key + '_w');
      if (!raw) return;
      var widths = JSON.parse(raw);
      if (!Array.isArray(widths)) return;
      var heads = st.table.querySelectorAll('thead th');
      if (widths.length !== heads.length) return;
      st.table.classList.add('ta-on');
      for (var i = 0; i < heads.length; i++) {
        if (widths[i] > 0) {
          heads[i].style.width = widths[i] + 'px';
          heads[i].style.minWidth = widths[i] + 'px';
        }
      }
    } catch (e) { /* ignore */ }
  }

  function needsSearchBar(table) {
    var card = table.closest('.card');
    var scope = card || table.parentElement;
    if (!scope) return true;
    if (scope.querySelector('.fsearch, .ta-search')) return false;
    var prev = scope.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains('filters') && prev.querySelector('.fsearch')) return false;
    var filtersInCard = (card || document).querySelector('.filters .fsearch');
    if (card && card.parentElement) {
      var sib = card.parentElement.querySelector(':scope > .filters .fsearch');
      if (sib) return false;
    }
    if (filtersInCard && card && card.contains(filtersInCard)) return false;
    /* content-level filters just above */
    var content = document.getElementById('content');
    if (content) {
      var firstFilters = content.querySelector(':scope > .filters');
      if (firstFilters && firstFilters.querySelector('.fsearch')) {
        /* siparişler gibi üst filtre — yine de tablo üstü arama ekleme (çift kutu) */
        var tables = content.querySelectorAll('table.tbl');
        if (tables[0] === table) return false;
      }
    }
    return true;
  }

  function enhance(table, view) {
    if (!table || !table.tHead) return;
    if (table.closest('.modal-bd, .modal, #modal, .line-tbl')) return;
    if (table.classList.contains('line-tbl')) return;
    if (table.dataset.taBound === '1') return;
    var rows = dataRows(table);
    if (!rows.length) return;
    table.dataset.taBound = '1';
    table.classList.add('ta-on');

    var st = {
      table: table,
      key: storageKey(table, view),
      search: '',
      colFilters: {},
      filtBtns: {},
      meta: null,
      clearBtn: null
    };

    /* toolbar */
    if (needsSearchBar(table)) {
      var bar = document.createElement('div');
      bar.className = 'ta-bar';
      var inp = document.createElement('input');
      inp.type = 'search';
      inp.className = 'ta-search';
      inp.placeholder = 'Tabloda ara…';
      inp.setAttribute('autocomplete', 'off');
      var meta = document.createElement('span');
      meta.className = 'ta-meta';
      var clr = document.createElement('button');
      clr.type = 'button';
      clr.className = 'ta-clear';
      clr.textContent = 'Filtreleri temizle';
      clr.style.display = 'none';
      bar.appendChild(inp);
      bar.appendChild(meta);
      bar.appendChild(clr);
      var host = table.parentElement;
      if (host) host.insertBefore(bar, table);
      st.meta = meta;
      st.clearBtn = clr;
      inp.addEventListener('input', function () {
        st.search = inp.value;
        applyFilters(st);
      });
      clr.addEventListener('click', function () {
        st.search = '';
        inp.value = '';
        st.colFilters = {};
        applyFilters(st);
      });
    } else {
      /* yine de temizle + meta için ince bar */
      var bar2 = document.createElement('div');
      bar2.className = 'ta-bar';
      var meta2 = document.createElement('span');
      meta2.className = 'ta-meta';
      var clr2 = document.createElement('button');
      clr2.type = 'button';
      clr2.className = 'ta-clear';
      clr2.textContent = 'Sütun filtrelerini temizle';
      clr2.style.display = 'none';
      bar2.appendChild(meta2);
      bar2.appendChild(clr2);
      if (table.parentElement) table.parentElement.insertBefore(bar2, table);
      st.meta = meta2;
      st.clearBtn = clr2;
      clr2.addEventListener('click', function () {
        st.colFilters = {};
        applyFilters(st);
      });
    }

    var heads = table.tHead.rows[0] ? table.tHead.rows[0].cells : [];
    for (var ci = 0; ci < heads.length; ci++) {
      (function (colIdx, th) {
        var label = thLabel(th);
        var wrap = document.createElement('div');
        wrap.className = 'ta-th';
        var lab = document.createElement('span');
        lab.className = 'ta-th-label';
        lab.textContent = label;
        /* orijinal th içeriğini temizle ama class/num koru */
        th.textContent = '';
        wrap.appendChild(lab);
        th.appendChild(wrap);

        if (!isActionCol(th, colIdx, rows)) {
          var fb = document.createElement('button');
          fb.type = 'button';
          fb.className = 'ta-filt';
          fb.title = 'Sütun filtresi';
          fb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
          fb.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (fb.classList.contains('on')) closePop();
            else openFilter(st, colIdx, fb);
          });
          wrap.appendChild(fb);
          st.filtBtns[colIdx] = fb;
        }
        enableResize(st, th, colIdx);
      })(ci, heads[ci]);
    }

    restoreWidths(st);
    applyFilters(st);
  }

  function bagla(root, opts) {
    injectCss();
    closePop();
    opts = opts || {};
    var view = opts.view || (global.VIEW || 'x');
    root = root || document.getElementById('content') || document.body;
    var tables = root.querySelectorAll('table.tbl');
    for (var i = 0; i < tables.length; i++) enhance(tables[i], view);
  }

  global.tabloArac = { bagla: bagla, closePop: closePop };
})(typeof window !== 'undefined' ? window : globalThis);
