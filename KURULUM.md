# Kurulum Adımları — Rota Yem Online

## A) GitHub'a Yükleme (Hosting)

### En kolay yöntem: GitHub Desktop
1. **GitHub hesabı** yoksa: github.com → Sign up
2. **GitHub Desktop** indir/kur: desktop.github.com
3. GitHub Desktop'ta giriş yap
4. **File → Add local repository** → klasörü seç: `C:\Users\ismai\Downloads\rota-yem-sistem`
5. **Publish repository** → ad: `rota-yem-sistem` → "Keep this code private" işaretini KALDIR (Pages için public olmalı) → Publish

### GitHub Pages'i aç (yayına alma)
1. github.com → `rota-yem-sistem` reposu → **Settings** → sol menü **Pages**
2. **Source: Deploy from a branch** → **Branch: main** → **/ (root)** → **Save**
3. 1-2 dakika bekle → yayın adresi:
   - Portal: `https://KULLANICI.github.io/rota-yem-sistem/`
   - Toplantı: `.../rota-yem-sistem/haftalik-toplanti/`
   - Sipariş: `.../rota-yem-sistem/siparis-takip/`

---

## B) Firebase Projesi (Veri Senkronu)

### Proje oluştur
1. **console.firebase.google.com** → Google hesabıyla giriş
2. **Proje ekle** → ad: `rota-yem` → (Analytics: Hayır/kapalı yeterli) → **Proje oluştur**

### Firestore veritabanı aç
1. Sol menü → **Build → Firestore Database** → **Veritabanı oluştur**
2. Konum: `eur3 (europe-west)` → İleri
3. Başlangıç modu: **Test modunda başlat** → Etkinleştir
   (Sonra güvenlik kurallarını birlikte sıkılaştırırız)

### Web uygulaması ekle ve config al
1. Proje ana sayfası → **Web** ikonu **`</>`**
2. Uygulama takma adı: `rota-yem-web` → **Uygulamayı kaydet**
3. Çıkan **firebaseConfig** bloğunu KOPYALA — şuna benzer:
```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "rota-yem.firebaseapp.com",
  projectId: "rota-yem",
  storageBucket: "rota-yem.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234:web:abcd..."
};
```
4. **Bu config'i bana (Claude'a) gönder** → uygulamalara senkron katmanını ekleyeceğim.

---

## Sırada ne var?
- Sen A ve B'yi yap, **firebaseConfig'i** getir.
- Ben her iki uygulamaya Firebase senkronunu eklerim (localStorage → Firestore otomatik taşıma).
- İkinci bilgisayarda test ederiz.
