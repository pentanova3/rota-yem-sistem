# Rota SMI Tarım — Kurumsal Operasyon Portalı

## Register
product

## Product Purpose
Balıkesir merkezli bir yem fabrikasının (Rota SMI Tarım ve Hayvancılık) tüm operasyonunu yöneten iç portal: TMR ve Yem sipariş takibi, müşteri/bayi/danışman/plasiyer yönetimi, iskonto-komisyon hesapları, tonaj raporları, muhasebe-finans, İK, saha ve bakım modülleri. Tek statik HTML+JS + Firebase; ofiste ve sahada (telefon/tablet) kullanılır.

## Users
- **Firma sahibi / üst yönetici (İsmail Bey, İbrahim Bey)**: raporlara ve panele bakar; detaycıdır, sayının doğruluğuna ve ciddiyetine önem verir. Programı dışarıya (ortaklara, ziyaretçilere) gösterdiğinde gurur duymak ister.
- **Sipariş personeli (Gülseren Hanım, Hüseyin)**: gün boyu sipariş girer; hız ve okunabilirlik ister; fiyat/iskonto detaylarının bir kısmını göremez.
- **Plasiyerler (Mustafa vb.)**: sahada telefonla girer; yalnız kendi müşteri/bayilerini görür; büyük dokunma hedefleri ve net durum renkleri gerekir.
- **Sevkiyat**: teslimat planına ve sipariş durumlarına bakar.

## Brand & Tone
- Kurumsal, güvenilir, "fabrika ciddiyeti" + modern yazılım kalitesi. Oyuncak değil, finansal araç hissi.
- Marka rengi: parlement mavisi (#1E3E90 / koyu lacivert #0C2340 sidebar). Logo: beyaz plakada ROTA SMI.
- Dil: Türkçe, resmi-samimi arası; kısaltma ve jargon az.
- Slogan: "Yemdeki Rotamız".

## Anti-references
- Renkli oyuncak dashboard'lar (rastgele gradyanlar, neon, glassmorphism).
- Bootstrap-vari jenerik admin şablonu görünümü.
- ABD SaaS klişesi hero-metrik kartları; anlamsız süs ikonlar.
- Karanlık tema zorlaması: kullanıcılar gündüz aydınlık ofiste ve dış sahada kullanıyor.

## Strategic Principles
1. Sayı okunur olmalı: tablolar yoğun ama nefes alır; tabular-nums; hizalama kusursuz.
2. Durum bir bakışta: sipariş durumları/onaylar renk+etiketle anında ayrışır.
3. Roller görsel olarak tutarlı: danışman=mor, bayi=amber, plasiyer=camgöbeği — modüller arasında değişmez.
4. Para-kritik alanlarda süs yok: iskonto/komisyon ekranları sade ve denetlenebilir.
5. Tek dosyalık statik mimari korunur: tasarım = CSS katmanı; iş mantığına dokunulmaz.
