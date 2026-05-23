# Rota Yem · Yönetim Sistemleri

Rota SMI Tarım için geliştirilen kurumsal web uygulamaları.

## Uygulamalar

| Uygulama | Klasör | Açıklama |
|----------|--------|----------|
| 📋 Haftalık Yönetim Toplantısı | `haftalik-toplanti/` | Toplantı checklist, üretim istatistikleri, fabrika inşaatı, yönetim kurulu raporu |
| 📦 Sipariş Takip Sistemi | `siparis-takip/` | Sipariş yönetimi, müşteri/bayi, komisyon, stok, raporlar |

## Yayın (GitHub Pages)

Repo `Settings → Pages → Branch: main / root` ile yayınlanır.

- Portal: `https://<kullanici>.github.io/rota-yem-sistem/`
- Toplantı: `https://<kullanici>.github.io/rota-yem-sistem/haftalik-toplanti/`
- Sipariş: `https://<kullanici>.github.io/rota-yem-sistem/siparis-takip/`

## Veri (Firebase Firestore)

Veriler Firebase Firestore'da tutulur — cihazlar arası otomatik senkron. İlk açılışta tarayıcıdaki localStorage verileri Firestore'a taşınır.

- Firebase projesi: `rota-yem`
- Sipariş verisi: `apps/siparis` belgesi
- Toplantı verisi: `meetings/*` koleksiyonu + `apps/toplanti_arsiv`

## Teknik

- Saf HTML/CSS/JS, tek dosya (Chart.js gömülü)
- Harici bağımlılık yok (Firebase SDK CDN'den yüklenir)
- Türkçe arayüz

---
Pentanova · Kurumsal Çözümler
