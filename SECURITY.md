# Güvenlik Standardı

> Bu belge **Pentanova güvenlik standardını** bu depoya uygular. Aynı standardın taşınabilir metodolojisi `/guvenlik` skill'indedir (`~/.claude/skills/guvenlik/`).
> **Başka bir firmaya kopyalarken:** yalnızca "Bu Projede" bölümünü güncelle; gerisi (14 ilke, checklist, rollout, acil müdahale) firmadan bağımsızdır ve aynı kalır.

---

## Bu Projede (proje-özel — kopyalarken bu bölümü değiştir)
- **Yığın:** Statik HTML/CSS/JS + Firebase (Firestore, Auth, Cloud Functions, Hosting, Storage).
- **Dış kullanıcı türleri:** bayi, danışman (Auth hesabı, tüm iç claim 'yok' + rol + kapsam-id); müşteri (token-linki, anonim).
- **Yazım ucu:** tüm veri-blob yazımı `functions/index.js → yaz` (Admin SDK); kurallarda `apps/{belge}` client yazımı `if false`.
- **Dış besleme uçları:** `bayi`, `danisman` (sahip-kapsamlı, beyaz-liste); `musteri` (token-scoped).
- **Durum:** dış dünyaya açılışa hazır — Faz 0–3 + iki düşmanca denetim mühürlendi. Kill switch canlı.

---

## Altın kural
Dış kullanıcıya açmadan ÖNCE kanıtla:
> **"Tüm iç modül yetkisi 'yok' olan bir hesap; iç veriyi OKUYAMAZ + YAZAMAZ + SİLEMEZ + yetki YÜKSELTEMEZ + IDOR yapamaz."**

## 14 ilke (bu depoda durum)
- [x] **1. Sunucu-aracılı yazım** — istemci doğrudan yazamaz; `yaz` fonksiyonu + kural default-deny.
- [x] **2. Claim-tabanlı okuma izolasyonu** — `icKullanici()`; dış hesap iç veri okuyamaz; PII (ik/saha) dar claim'de.
- [x] **3. Dış veri sunucudan beslenir** — kapsam token'dan, beyaz-liste alan, fiyat sunucuda.
- [x] **4. Sırlar sunucuda** — Telegram token Secret Manager'da; istemci/DB'de düz metin yok.
- [x] **5. Hız sınırı** — `rateLimit()` tüm dış uçlarda (musteri/bayi/danisman/tgGonder…).
- [x] **6. Denetim izi** — `denetimVer()` → silinemez `denetim` koleksiyonu + Telegram uyarısı.
- [x] **7. Yedek + geri-yükleme provası** — gece 03:00, iki depo, self-verify; `yedekYonet` prova.
- [x] **8. Toptan-silme koruması** — `yaz` %70+ kayıp → 409; force yalnız yönetici.
- [x] **9. Tek-yazıcı hassas veri** — komisyon/fiyat yalnız `komisyoncuYonet`; blob push koruyor.
- [x] **10. Hesap yaşam döngüsü** — disable + `revokeRefreshTokens`; zorunlu şifre kurulumu + politika.
- [x] **11. Acil durum şalteri** — `apps/portal.disKilit` → tüm dış uçlar 503; panelden tek tuş.
- [x] **12. Firebase kural tuzakları** — OR-mantığı no-op'ları kapatıldı; path değil string eşleşmesi.
- [x] **13. Düşmanca denetim + sızma provası** — iki kez; `sizma-provasi/` N/N engellendi.
- [x] **14. Acil müdahale planı** — kart + kill switch (aşağıda özet).

## Açılış-öncesi kontrol listesi
- [ ] İstemci doğrudan DB yazamıyor (kural default-deny + fonksiyon arkası)
- [ ] Dış hesap tüm iç claim 'yok'; iç veriyi okuyamıyor (kurallarda kanıtlı)
- [ ] Dış veri sunucudan beslenir (beyaz-liste + kapsam token'dan + fiyat sunucuda)
- [ ] Sırlar Secret Manager'da
- [ ] Rate limit + toptan-silme koruması
- [ ] Denetim izi + kritik-olay uyarısı
- [ ] Gece yedeği + geri-yükleme provası bir kez başarılı
- [ ] Hesap kapatma = disable + token iptali; şifre politikası
- [ ] Acil durum şalteri test edildi
- [ ] Düşmanca denetim + sızma provası (hepsi engellendi)
- [ ] Onay/çift-imza listeleri DOLU (fail-open bootstrap kapalı)

## Rollout sırası (KRİTİK)
Fonksiyon deploy → istemci geçir + hosting → **gerçek-giriş testi** → **kural kilidi** (EN SON).
Kuralları önce kilitlersen canlı yazımı kırarsın.

## Acil müdahale (hızlı)
**Durdur → Tespit et → Kurtar → Sağlamlaştır.**
1. **Durdur:** kendi hesabından şüpheliysen önce şifreni değiştir → **Acil Durum Şalteri** ile tüm dış erişimi tek tuşla kes (Erişim Yönetimi panelinin üstünde) → belirli hesap: panelden kapat / Firebase Console → Disable.
2. **Tespit:** Denetim İzi (silinemez) + Hesap Durumu (son giriş). Not al, panikle silme.
3. **Kurtar:** Yedek & Geri Yükleme Provası ile sağlam yedeği doğrula; canlı geri-yükleme deliberate (tek-tuş değil).
4. **Sağlamlaştır:** şifreleri sıfırla; bot karıştıysa token yenile; olay zaman çizelgesini yaz.
> Otomatik savunmalar zaten çalışır ve yöneticiye Telegram'dan haber verir: toptan-silme guard, rate-limit uyarısı, "GÜVENLİK OLAYI", yedek-bozulma uyarısı.

## Bu standardı sürdürmek
- Güvenlik işi geldiğinde `/guvenlik` skill'ini çağır (14 ilkeyi + denetimi uygular).
- Her yeni DIŞ özellikten sonra sızma provasını tekrar çalıştır.
- Kurallara/yetkilere dokunan her değişiklikten sonra düşmanca denetim yap.
- `.env` ve Firebase config'e dokunma.
