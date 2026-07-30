/* ============================================================
 * Şifre Göster/Gizle — sistemdeki TÜM type="password" alanlarına
 * otomatik "Göster/Gizle" seçeneği ekler (kullanıcı şifresini doğru
 * girdi mi kontrol edebilsin). Kurumsal tercih: İKON YOK, düz metin.
 *
 * Kullanım: sayfaya  <script defer src="/sifre-goster.js"></script>  ekle.
 * - Dinamik açılan modallerdeki alanları MutationObserver yakalar.
 * - İdempotent (aynı alana iki kez eklemez).
 * - Hariç tutmak için input'a  data-nosg  ekle.
 * ============================================================ */
(function () {
  function kur(inp) {
    if (!inp || inp.dataset.sg || inp.hasAttribute("data-nosg")) return;
    var p = inp.parentNode; if (!p) return;
    inp.dataset.sg = "1";
    // Sarmalayıcı: block alanlar için block, satır-içi (dar) alanlar için inline-block → buton her zaman input'un sağında durur.
    var disp = String(getComputedStyle(inp).display || "");
    var wrap = document.createElement("span");
    wrap.style.cssText = "position:relative;" + (disp.indexOf("inline") === 0 ? "display:inline-block" : "display:block");
    p.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.style.paddingRight = "60px";   // metin butonun altına girmesin

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Göster";
    btn.tabIndex = -1;                  // tab sırasını bozma (şifreden butona değil, gönder'e geçilsin)
    btn.setAttribute("aria-label", "Şifreyi göster");
    btn.style.cssText = "position:absolute;top:50%;right:7px;transform:translateY(-50%);background:transparent;border:0;" +
      "color:#64748b;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:4px 5px;line-height:1;z-index:3";
    btn.onclick = function () {
      var gizli = inp.type === "password";
      inp.type = gizli ? "text" : "password";
      btn.textContent = gizli ? "Gizle" : "Göster";
      btn.setAttribute("aria-label", gizli ? "Şifreyi gizle" : "Şifreyi göster");
      try { inp.focus(); } catch (e) {}
    };
    wrap.appendChild(btn);
  }

  function tara(kok) {
    try { (kok || document).querySelectorAll('input[type="password"]').forEach(kur); } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { tara(); });
  else tara();

  // Dinamik eklenen alanlar (giriş / şifre değiştir modalleri vb.)
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var eklenen = muts[i].addedNodes;
        for (var j = 0; j < eklenen.length; j++) {
          var n = eklenen[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('input[type="password"]')) kur(n);
          tara(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
