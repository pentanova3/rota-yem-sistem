# Rota SMI — Tasarım Sistemi v2 (TMR + Yem)

Tek kaynak: her iki modülün `<style>` bloğu aynı çekirdekten üretilir
(`siparis-takip/index.html` ve `yem/index.html` — 62 KB, birebir aynı).
Değişiklik yaparken: çekirdeği bir dosyada düzenle, diğerine aynen kopyala.
İş mantığına (JS) dokunulmaz; tasarım = CSS katmanı.

## Renk

- Nötrler lacivert-tint: `--slate-50:#FAFBFD` … `--slate-900:#151C28`.
  Saf `#000`/`#fff` metin-zemin ekseninde kullanılmaz (kart zemini `#fff` kalır).
- Marka: `--blue-600:#1E3E90` (parlement mavisi), sidebar `#0C2340` tabanlı katmanlı gradyan.
- Gölgeler lacivert bazlı: `rgba(13,24,48,…)` → `--shadow-card / --shadow-pop / --shadow-modal`.
- Rol renkleri modüller arası DEĞİŞMEZ:
  danışman = mor (`#6D28D9`), bayi = amber (`#B45309` / zemin `#FFFBEB`),
  plasiyer = camgöbeği (`#0E7490`). Sınıflar: `.kom-chip.kom-danisman/.kom-bayi/.kom-plasiyer`,
  `.tip-chip.tip-danisman/.tip-bayi`, `.row-bayi` (amber satır tinti).
- Firma çipleri: `.firma-SMI` mor, `.firma-ROTA` teal — yalnız firma için, rol için kullanma.

## Tipografi

- Inter; `--font-serif` Inter alias'ıdır (gerçek serif reddedildi — tabular hiza şart).
- Sayılar her yerde `font-variant-numeric: tabular-nums lining-nums`.
- Başlık ölçeği: topbar 17/600 −0.01em; KPI değeri 24/600 −0.015em; etiketler
  10.5px uppercase +0.08em.

## İmzalar (bunları bozma)

- **Kantar-defteri KPI şeridi**: `.kpis` tek bant — `gap:1px` + `background:slate-200`
  ayraç; her `.kpi` başında 8×2px accent tiresi (`--kpi-accent`). ≤640px'te bant
  ayrık kartlara çözülür (`background:transparent`, kutulara kenarlık) ve tek kalan
  kutu satırı doldurur (`:last-child:nth-child(odd){grid-column:1/-1}`).
- **Rota noktası**: `.tb-title::after` — başlık yanındaki marka noktası; panelde bugün
  kartında da nokta.
- **Login ufuk çizgisi**: lacivert gökyüzü gradyanı + koyu zemin bandı; kart ufkun üstünde.
- **Katmanlı sidebar**: `#0C2340` üstü gradyan katmanı; aktif nav "basılı tuş"
  (iç gölge + açık zemin).
- **Rozet/çip ikili dili**: durum rozeti = köşeli (4px) + `::before` currentColor nokta;
  kişi çipi = pill (999px) + kenarlık. `st-*` rozetleri, `kom-chip` çipleri.
- `::selection` navy; `sub-hd` bölüm başlıkları tire işaretli; `day-ord` nokta (şerit değil).

## Hareket

- Tokenlar: `--ease` (ease-out expo eğrisi), `--dur-1/2/3` (hızlı→yavaş).
- Modal: `mbg` (backdrop fade) + `mup` (scale .98 + 8px yukarı); combo `cpop`.
- `prefers-reduced-motion` desteklenir. Layout property animasyonu yasak.

## Yerleşim guard'ları (gerileme yaşama)

- `.app` grid'inde `.main`, `.content` ve `.report-grid>*` mutlaka `min-width:0` —
  yoksa Chart.js canvas'ları ilk çizimde konteyneri şişirir ve sayfa yatay taşar.
- Geniş tablolar kendi konteynerinde kayar (`.card-bd{overflow-x:auto}` mobil/tablet).
- `.chart-cv` yükseklikleri ve print mantığı (`@media print`) DOKUNULMAZ.
- Durum sınıfları JS sözleşmesidir: `.on .open .active .show .hidden` adları değişmez.

## Yasaklar

- border-left/right renkli kalın şerit (side-stripe) yok — nokta/tam kenarlık kullan.
- Gradyan metin, glassmorphism, hero-metrik şablonu, jenerik admin görünümü yok.
- Para-kritik ekranlarda (iskonto/komisyon) süs yok; sade ve denetlenebilir.
