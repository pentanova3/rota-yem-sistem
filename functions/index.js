// Rota SMI — Telegram sipariş onay webhook'u (Cloud Functions v2)
// Telegram'daki "Siparişi Onayla" butonunu işler: teyit → kim onayladı kaydı.
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Telegram webhook gizli anahtarı (setWebhook ile aynı olmalı). Kaynak herkese açık değil.
const SECRET = "rota_tg_wh_8s2n4q7x";

// GÜVENLİK (Faz 0.1): Bot token'ı ve grup chat'i artık istemciye inen Firestore blob'unda DEĞİL,
// yalnızca sunucu secret'lerinde tutulur. Kurulum: firebase functions:secrets:set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
const TG_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TG_CHAT = defineSecret("TELEGRAM_CHAT_ID");
const TG_CHAT_YONETIM = defineSecret("TELEGRAM_CHAT_YONETIM");   // yalnız üst yönetici grubu ("Rota Rapor")
function tgToken() { try { return TG_TOKEN.value() || null; } catch (e) { return null; } }
function tgChat() { try { return TG_CHAT.value() || null; } catch (e) { return null; } }
function tgChatYonetim() { try { return TG_CHAT_YONETIM.value() || null; } catch (e) { return null; } }
// YÖNETİM HATTI: yalnız üst yöneticinin olduğu ayrı gruba bildirim gönderir. İç grup (tgChat)
// akışından tamamen AYRIDIR; hangi olayların buraya gideceği çağıran taraflarca belirlenir.
// Secret bağlı değilse (grup henüz kurulmadıysa) sessizce atlar — mevcut akışı bozmaz.
async function sendYonetim(token, text, buttons) {
  try {
    const chat = tgChatYonetim();
    if (!token || !chat) return false;
    const params = {chat_id: chat, text, disable_web_page_preview: true};
    if (buttons) params.reply_markup = {inline_keyboard: buttons};
    await tg(token, "sendMessage", params);
    return true;
  } catch (e) { console.error("sendYonetim", e); return false; }
}

async function loadDB() {
  const snap = await db.doc("apps/siparis").get();
  const data = snap.exists ? snap.data().data : null;
  if (!data) return null;
  try { return JSON.parse(data["rota_so_v1"] || "null"); } catch (e) { return null; }
}
// Yem modülü verisi (apps/yem → rota_yem_v1). Portal yem siparişleri için katalog + kendi siparişlerini okumada kullanılır.
async function loadYemDB() {
  const snap = await db.doc("apps/yem").get();
  const data = snap.exists ? snap.data().data : null;
  if (!data) return null;
  try { return JSON.parse(data["rota_yem_v1"] || "null"); } catch (e) { return null; }
}

// ============================================================
// HIZ SINIRI (Faz 2.3) — Firestore-destekli sabit pencere sayacı. key başına windowSec içinde en fazla max istek.
// Amaç: kaba-kuvvet (müşteri token tahmini) + DoS (uçları saniyede yüzlerce çağırma). Global (tüm Cloud Run örnekleri
// aynı sayacı paylaşır). rate/* koleksiyonu firestore.rules catch-all ile istemciye KAPALI; yalnız Admin SDK yazar.
// Limiter hatasında fail-OPEN (isteği engelleme) — iç aracın erişilebilirliği, katı sınırdan önce gelir.
// ============================================================
const RL_ETIKET = {yaz: "Veri kaydetme", musteri: "Müşteri onay linki", bayi: "Bayi portalı", danisman: "Danışman portalı", tgGonder: "Telegram gönderim", yemOnayKaydet: "Yem onayı", yonetim: "Erişim yönetimi", bayiYonetim: "Bayi/danışman hesap yönetimi", sifreDegistir: "Şifre değiştirme", yedekYonet: "Yedek yönetimi"};
async function rateLimit(key, max, windowSec) {
  const id = String(key).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 200);
  const ref = db.doc("rate/" + id);
  const now = Date.now(), pencere = windowSec * 1000;
  try {
    let izin = true, ilkUyari = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : null;
      if (d && typeof d.reset === "number" && d.reset > now) {
        if ((d.count || 0) >= max) { izin = false; if (!d.uyarildi) { ilkUyari = true; tx.set(ref, {uyarildi: true}, {merge: true}); } return; }   // limit aşıldı; pencere başına EN FAZLA 1 uyarı
        tx.set(ref, {count: (d.count || 0) + 1, reset: d.reset}, {merge: true});
      } else {
        tx.set(ref, {count: 1, reset: now + pencere});          // yeni pencere
      }
    });
    if (ilkUyari) {   // 3.2 ANORMALLİK UYARISI: hız sınırına ilk takılma → olası kaba-kuvvet/kötüye kullanım (Telegram secret bağlı fonksiyonlarda gider)
      try {
        const token = tgToken(), chat = tgChat();
        if (token && chat) {
          const parca = String(key).split(":"), pre = parca[0], kimlik = parca.slice(1).join(":");
          const et = RL_ETIKET[pre] || pre;
          let kim;
          if (pre === "musteri") { kim = "Ziyaretçi IP: " + kimlik + "\n(Kimliği doğrulanmamış — gerçek müşteri onay linkini bu sıklıkta AÇMAZ; büyük olasılıkla token deneyen bot/saldırgan. İsim yok çünkü giriş yapılmıyor.)"; }
          else { try { const u = await admin.auth().getUser(kimlik); const un = String(u.email || "").replace(EPOSTA_SON, "") || kimlik; kim = "Kullanıcı: " + un + ((u.customClaims && u.customClaims.rol) ? " (" + u.customClaims.rol + ")" : " (iç personel)"); } catch (e) { kim = "Kullanıcı id: " + kimlik; } }
          await tg(token, "sendMessage", {chat_id: chat, text: "⚠️ HIZ SINIRI AŞILDI — " + et + "\n" + kim + "\nÇok sık istek attı; otomatik engellendi."});
        }
      } catch (e) { /* yut */ }
    }
    return izin;
  } catch (e) { console.error("rateLimit", e); return true; }   // fail-open
}
function istekIp(req) { return (req.get("x-forwarded-for") || "").split(",")[0].trim() || req.ip || "yok"; }

// ============================================================
// DENETİM İZİ (Faz 2.2) — tamper-DİRENÇLİ, yalnız-sunucu-yazılır append-only kayıt.
// 'denetim' koleksiyonu firestore.rules ile istemciye yazıma KAPALI (yalnız Admin SDK); okuma yalnız portalYonetici.
// Kritik güvenlik olayları (yetki değişimi, hesap açma/kapatma, şifre sıfırlama, toptan-silme denemesi) buraya işlenir.
// Hata ana işlemi ENGELLEMEZ (audit best-effort).
// ============================================================
// 3.2: gerçekten ANORMAL/riskli olaylar → Telegram (rutin sifre-kullanici-degisti/yedek-* HARİÇ; geri-yükleme kendi mesajını yollar)
// Yetki alanlarının okunur adları — Telegram güvenlik uyarısında ham anahtar ("siparisSil") yerine
// anlaşılır metin ("SİPARİŞ SİLME") görünsün diye.
const YETKI_AD = {
  portalYonetici: "Portal Yöneticisi", fiyatGor: "Fiyat Görme", siparisSil: "SİPARİŞ SİLME",
  siparis: "Sipariş Takip (TMR)", yem: "Yem Sipariş", muhasebe: "Muhasebe",
  ik: "İnsan Kaynakları", saha: "Saha", bakim: "Makine Envanter", toplanti: "Haftalık Toplantı",
};
// Boolean yetki alanları. Karşılaştırmada claim'de HİÇ yoksa false sayılır (aşağıdaki yetkiNorm) —
// aksi halde YENİ bir alan eklendiği ilk senkronda herkes "değişti" görünüp kullanıcı başına
// SAHTE Telegram uyarısı giderdi.
const YETKI_BOOL = new Set(["portalYonetici", "fiyatGor", "siparisSil"]);
const yetkiNorm = (k, v) => YETKI_BOOL.has(k) ? String(v === true) : String(v == null ? "" : v);
const DENETIM_UYAR = new Set(["toptan-silme-engellendi", "yetki-degisti", "hesap-acildi", "giris-kapatildi", "sifre-admin-degisti", "portal-hesap-acildi", "portal-sifre-sifirlandi", "portal-hesap-kapatildi", "dis-erisim-KESILDI", "dis-erisim-acildi"]);
// Sert denetim: dış aktör (bayi/danışman) tek başına apps/siparis|apps/yem blob'unu 1MB'a şişirip TÜM sipariş sistemini
// kilitleyemesin — her aktör için AÇIK (teslim/iptal olmayan) portal siparişi tavanı. Dakikalık hız sınırıyla (90/dk) birlikte
// çalışır: hız sınırı ani spam'i, bu tavan biriken açık-sipariş ayak izini bağlar. Normal bayide bu sayıya ulaşmak imkânsız.
const PORTAL_SIP_TAVAN = 200;
async function denetimVer(islem, aktor, detay) {
  try {
    await db.collection("denetim").add({ts: new Date().toISOString(), islem: String(islem), aktor: String(aktor || "?"), detay: detay || {}});
  } catch (e) { console.error("denetimVer", e); }
  if (DENETIM_UYAR.has(String(islem))) {   // ANORMALLİK UYARISI (Telegram secret bağlı fonksiyonlarda gider)
    try {
      const token = tgToken(), chat = tgChat();
      if (token && chat) {
        const d = detay || {};
        await tg(token, "sendMessage", {chat_id: chat, text: "🔔 GÜVENLİK OLAYI — " + islem + "\nYapan: " + (aktor || "?") +
          (d.kullanici ? "\nHedef: " + d.kullanici : "") + (d.app ? "\nModül: " + d.app : "") + (d.degisen ? "\nDeğişen: " + (Array.isArray(d.degisen) ? d.degisen.join(", ") : d.degisen) : "") +
          "\n(Bu işlemi siz yapmadıysanız derhal kontrol edin.)"});
      }
    } catch (e) { /* yut */ }
  }
}
function getToken() { return tgToken(); }   // eski isim korunur; kaynak artık secret
// Yem üretim onaycıları (apps/portal → P.yemOnay.alicilar[{username,chatId,ad}]). Webhook, onaylayan cq.from.id'yi bununla doğrular.
async function getYemOnaycilar() {
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    return (P && P.yemOnay && Array.isArray(P.yemOnay.alicilar)) ? P.yemOnay.alicilar : [];
  } catch (e) { return []; }
}
async function getMuhasebeOnaycilar() {
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    return (P && P.muhasebeOnay && Array.isArray(P.muhasebeOnay.alicilar)) ? P.muhasebeOnay.alicilar : [];
  } catch (e) { return []; }
}
// Muhasebe SİPARİŞ onaycıları (apps/portal → P.muhasebeSiparisOnay.alicilar[{username,chatId,ad}]).
// DİKKAT: muhasebeOnay (giriş/login çift-onayı) İLE FARKLI kavram — bu, sipariş akışının ilk kapısıdır.
async function getMuhasebeSiparisOnaycilar() {
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    return (P && P.muhasebeSiparisOnay && Array.isArray(P.muhasebeSiparisOnay.alicilar)) ? P.muhasebeSiparisOnay.alicilar : [];
  } catch (e) { return []; }
}
// NAKLİYE KDV ORANI (%). yem/index.html'deki NAKLIYE_KDV_ORAN ile AYNI OLMALI — test bunu doğrular.
// Nakliye hizmet bedelidir; birim fiyat KDV hariç girilir, faturaya KDV dahil tutar yazılır.
const NAKLIYE_KDV_ORAN_FN = 20;
// Sipariş dış bir portaldan mı geldi (bayi/danışman)? İç siparişten ayırmanın TEK yeri burasıdır.
const PORTAL_KAYNAK = (k) => k === "bayi-portal" || k === "danisman-portal";
// YEM BİLGİ HATTI (firma kararı 29.07): Yem modülünde açılan ve TMR'den çapraz düşen YEM siparişleri
// artık ONAYA SUNULMAZ — Telegram'a yalnız BİLGİ olarak düşer, muhasebe/üretim kapısı yoktur.
// İSTİSNA: bayi/danışman PORTALINDAN gelen yem siparişleri. Onlar dışarıdan ve FİYATSIZ gelir;
// muhasebe onayı o siparişlerin tek finansal kontrol noktasıdır → eski akışta bırakılır.
// app burada blob adıdır ("yem" | "siparis"); TMR (siparis) hattı bu fonksiyondan HİÇ etkilenmez.
function yemBilgiHatti(app, o) { return app === "yem" && !PORTAL_KAYNAK(o && o.kaynak); }
// KATI SIRA sunucu-kilidi: yeni-akış siparişi, GÜVENİLİR apps/muhasebeonay'da onay olmadan üretim onayı YAZILAMAZ.
// (Aksi halde kimlik-doğrulamasız confirm: forge'u muhasebe kapısını atlardı.) Okuma hatasında true → mevcut akışı bozma.
async function muhasebeOnayVarMi(oid) {
  try { const s = await db.doc("apps/muhasebeonay").get(); const d = s.exists ? (s.data() || {}) : {}; return !!(d[oid] && d[oid].by); } catch (e) { return true; }
}
// Siparişi hattına göre (t=TMR/apps/siparis, y=Yem/apps/yem) yükle — muhasebe onayı sonrası üretim mesajı için özet/no lazım.
async function orderYukle(mod, oid) {
  try {
    if (mod === "y") { const YB = await loadYemDB(); return YB && Array.isArray(YB.orders) ? YB.orders.find((o) => o.id === oid) : null; }
    const DB = await loadDB(); return DB && Array.isArray(DB.orders) ? DB.orders.find((o) => o.id === oid) : null;
  } catch (e) { return null; }
}
// Muhasebe onayı VERİLDİKTEN SONRA üretim onay mesajını (mevcut approve:/yoapprove: altyapısı) İÇ gruba yollar.
async function uretimOnayMesajiGonder(token, chat, mod, oid, order) {
  const o = order || {};
  const urunler = Array.isArray(o.lines) ? o.lines.filter((l) => l && l.code).map((l) => "• " + l.code + (l.qty ? (" × " + l.qty) : "")).join("\n") : "";
  const noEt = mod === "y" ? ("#Y" + (o.no || "")) : ("#" + (o.no || ""));
  const bas = mod === "y" ? "🌾 YEM SİPARİŞİ — ÜRETİM ONAYI BEKLİYOR" : "🏭 SİPARİŞ — ÜRETİM ONAYI BEKLİYOR";
  const text = bas + "\n(Muhasebe onayı verildi ✅)\n\n" +
    "Sipariş: " + noEt + "\nMüşteri: " + (o.customer || o.aliciMusteri || "—") + "\n" +
    (o.teslimTarihi ? ("Teslim: " + o.teslimTarihi + "\n") : "") +
    (urunler ? ("\nÜrünler:\n" + urunler) : "") +
    "\n\nÜretime başlamak için onaylayın 👇";
  const cb = mod === "y" ? ("yoapprove:" + oid) : ("approve:" + oid);
  const btn = mod === "y" ? "✅ Üretimi Onayla" : "✅ Siparişi Onayla";
  await tg(token, "sendMessage", {chat_id: chat, text, reply_markup: {inline_keyboard: [[{text: btn, callback_data: cb}]]}});
}
async function tg(token, method, params) {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(params),
  });
}
function whoName(from) {
  const n = ((from.first_name || "") + " " + (from.last_name || "")).trim();
  return n || (from.username ? "@" + from.username : ("Kullanıcı " + from.id));
}
// username → portal'daki görünen ad. Bulunamazsa "" döner (çağıran yedeğe düşsün).
async function portalAd(username) {
  const u0 = String(username || "");
  if (!u0) return "";
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    const u = P && (P.users || []).find((x) => String(x.username || "").toLowerCase() === u0.toLowerCase());
    return (u && u.name) ? String(u.name) : "";
  } catch (e) { return ""; }
}
// Telegram kimliğinden GÖRÜNEN AD çöz: portal kullanıcısının adı (küratörlü) > Telegram profil adı (ham).
// NOT: onaycı kayıtlarındaki `ad` alanı da ham Telegram adıdır (portal.js aday'dan kopyalar) → asıl kaynak users[].name.
// Zincir: chatId → onaycı kaydı → username → apps/portal users[].name. Bulunamazsa Telegram profil adına düşer.
async function cozAd(from) {
  const ham = whoName(from);
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    if (!P) return ham;
    const cid = String(from.id);
    const listeler = [
      (P.yemOnay && P.yemOnay.alicilar) || [],
      (P.muhasebeSiparisOnay && P.muhasebeSiparisOnay.alicilar) || [],
      (P.muhasebeOnay && P.muhasebeOnay.alicilar) || [],
    ];
    let uname = "";
    for (const L of listeler) {
      const e = L.find((a) => String(a.chatId) === cid);
      if (e && e.username) { uname = String(e.username); break; }
    }
    // Onaycı listesinde yoksa (ör. TMR üretim onayı — kimlik listesi yok) Telegram @adıyla portal kullanıcısını dene.
    if (!uname && from.username) uname = String(from.username);
    if (uname) {
      const u = (P.users || []).find((x) => String(x.username || "").toLowerCase() === uname.toLowerCase());
      if (u && u.name) return String(u.name);
    }
    return ham;
  } catch (e) { return ham; }
}
function stripConfirm(t) { return String(t || "").replace(/\n\n⚠️[\s\S]*$/, ""); }

exports.telegramWebhook = onRequest({region: "us-central1", secrets: [TG_TOKEN]}, async (req, res) => {
  try {
    if (req.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) { res.status(403).send("forbidden"); return; }
    // GRUP KİMLİK NUMARASI (chat_id) yakalama: yeni bir gruba bot eklenince, gruba /chatid (veya /id)
    // yazılınca bot grubun numarasını söyler. Yeni bildirim hatları (ör. yönetim grubu) kurarken lazım.
    const gmsg = (req.body || {}).message;
    if (gmsg && gmsg.chat && (gmsg.chat.type === "group" || gmsg.chat.type === "supergroup") && /^\/(chatid|id)\b/.test(gmsg.text || "")) {
      const token0 = await getToken();
      if (token0) await tg(token0, "sendMessage", {chat_id: gmsg.chat.id,
        text: "Bu grubun kimlik numarası (chat_id):\n`" + gmsg.chat.id + "`\n\nGrup adı: " + (gmsg.chat.title || "—") + "\n\nBu numarayı fabrika yazılımına ileten kişiye verin.", parse_mode: "Markdown"});
      res.status(200).send("ok"); return;
    }
    // Özel mesaj /start → muhasebe onay alıcısı ADAYI olarak kaydet (chat_id yakalama)
    const msg = (req.body || {}).message;
    if (msg && msg.chat && msg.chat.type === "private" && /^\/start/.test(msg.text || "")) {
      const token0 = await getToken();
      const ad = whoName(msg.from);
      try {
        const snap = await db.doc("apps/portal").get();
        const data = snap.exists ? snap.data().data : null;
        const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
        if (P) {
          P.adaylar = P.adaylar || [];
          if (!P.adaylar.some((a) => String(a.chatId) === String(msg.chat.id))) {
            P.adaylar.push({chatId: String(msg.chat.id), ad, ts: new Date().toISOString()});
            await db.doc("apps/portal").set({data: {rota_portal_v1: JSON.stringify(P)}}, {merge: true});
          }
        }
      } catch (e) { console.error("aday kaydı", e); }
      if (token0) await tg(token0, "sendMessage", {chat_id: msg.chat.id,
        text: "Merhaba " + ad + ", kaydınız alındı.\n\nYönetici sizi Portal → Erişim Yönetimi ekranından muhasebe giriş onayı alıcısı olarak ekleyebilir."});
      res.status(200).send("ok"); return;
    }

    const cq = (req.body || {}).callback_query;
    if (!cq || !cq.message) { res.status(200).send("ok"); return; }
    const token = await getToken();
    if (!token) { res.status(200).send("no-token"); return; }

    const data = cq.data || "";
    const chatId = cq.message.chat.id;
    const msgId = cq.message.message_id;
    const name = await cozAd(cq.from);   // ham Telegram adı yerine portal'daki gerçek ad
    const text = cq.message.text || "";

    if (data.startsWith("approve:")) {
      const oid = data.slice(8);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text) + "\n\n⚠️ Bu siparişin üretimini ONAYLIYORSUNUZ.\nOnaylıyor musunuz?",
        reply_markup: {inline_keyboard: [[
          {text: "✅ Evet, Onayla", callback_data: "confirm:" + oid},
          {text: "✖️ Vazgeç", callback_data: "cancel:" + oid},
        ]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id});
    } else if (data.startsWith("confirm:")) {
      const oid = data.slice(8);
      const DB = await loadDB();
      const order = DB && (DB.orders || []).find((o) => o.id === oid);
      // KATI SIRA: yeni-akış siparişi muhasebe onayından geçmeden üretim onayı yazılamaz (confirm: kimlik-doğrulamasız olduğundan sunucu-kilidi).
      if (order && order.muhasebeOnayGerek === true && !(await muhasebeOnayVarMi(oid))) {
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Önce muhasebe onayı gerekli — bu sipariş henüz muhasebe onayından geçmedi.", show_alert: true});
        res.status(200).send("ok"); return;
      }
      const ts = new Date().toISOString();
      await db.doc("apps/fabrikaonay").set({[oid]: {
        by: name, ts, tgUserId: cq.from.id, tgUsername: cq.from.username || "", no: order ? order.no : "",
      }}, {merge: true});
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text) + "\n\n✅ ONAYLANDI — " + name + "\n🏭 Üretime başlanabilir.",
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Onaylandı ✅"});
    } else if (data.startsWith("cancel:")) {
      const oid = data.slice(7);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text),
        reply_markup: {inline_keyboard: [[{text: "✅ Siparişi Onayla", callback_data: "approve:" + oid}]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "İptal edildi"});
    } else if (data.startsWith("yoapprove:")) {
      // Yem üretim onayı — teyit iste
      const oid = data.slice(10);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text) + "\n\n⚠️ Bu yem siparişinin üretimini ONAYLIYORSUNUZ.\nOnaylıyor musunuz?",
        reply_markup: {inline_keyboard: [[
          {text: "✅ Evet, Onayla", callback_data: "yoconfirm:" + oid},
          {text: "✖️ Vazgeç", callback_data: "yocancel:" + oid},
        ]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id});
    } else if (data.startsWith("yoconfirm:")) {
      // Yem üretim onayı — KİMLİK DOĞRULAMALI: yalnız yem onaycıları (Gülseren + yedek) onaylayabilir
      const oid = data.slice(10);
      const onaycilar = await getYemOnaycilar();
      const yetkili = onaycilar.length === 0 || onaycilar.some((a) => String(a.chatId) === String(cq.from.id));
      if (!yetkili) {
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Bu siparişi yalnız yetkili üretim onaycısı onaylayabilir.", show_alert: true});
      } else {
        // KATI SIRA (savunma-derinliği): yeni-akış yem siparişi muhasebe onayından geçmeden üretim onayı yazılamaz.
        const yb = await loadYemDB();
        const yo = yb && Array.isArray(yb.orders) ? yb.orders.find((o) => o.id === oid) : null;
        if (yo && yo.muhasebeOnayGerek === true && !(await muhasebeOnayVarMi(oid))) {
          await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Önce muhasebe onayı gerekli — bu sipariş henüz muhasebe onayından geçmedi.", show_alert: true});
          res.status(200).send("ok"); return;
        }
        const ts = new Date().toISOString();
        await db.doc("apps/yemonay").set({[oid]: {by: name, ts, tgUserId: cq.from.id}}, {merge: true});
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: msgId,
          text: stripConfirm(text) + "\n\n✅ ONAYLANDI — " + name + "\n🏭 Üretime başlanabilir.",
        });
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Onaylandı ✅"});
      }
    } else if (data.startsWith("yocancel:")) {
      const oid = data.slice(9);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text),
        reply_markup: {inline_keyboard: [[{text: "✅ Üretimi Onayla", callback_data: "yoapprove:" + oid}]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "İptal edildi"});
    } else if (data.startsWith("mg:")) {
      // Muhasebe giriş onayı: mg:ok:REQID | mg:no:REQID
      // KİMLİK DOĞRULAMALI (sert denetim): yalnız YAPILANDIRILMIŞ muhasebe onaycıları (chatId) karar verebilir.
      // Aksi halde iç kullanıcı tgGonder ile kendi chat'ine 'mg:ok' butonu forge edip 2 sahte 'ok_' ile çift onayı baypaslar.
      const parts = data.split(":");
      const karar = parts[1], reqId = parts[2];
      const ts = new Date().toISOString();
      const mOnay = await getMuhasebeOnaycilar();
      const mYetkili = mOnay.length === 0 || mOnay.some((a) => String(a.chatId) === String(cq.from.id));
      if (!mYetkili) {
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Bu onayı yalnız yetkili muhasebe onaycısı verebilir.", show_alert: true});
      } else if (karar === "ok") {
        await db.doc("apps/muhasebeGiris").set({[reqId]: {["ok_" + cq.from.id]: name, ts}}, {merge: true});
        await tg(token, "editMessageText", {chat_id: chatId, message_id: msgId,
          text: stripConfirm(text) + "\n\nONAYLANDI — " + name});
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Giriş onaylandı"});
      } else {
        await db.doc("apps/muhasebeGiris").set({[reqId]: {red: name, ts}}, {merge: true});
        await tg(token, "editMessageText", {chat_id: chatId, message_id: msgId,
          text: stripConfirm(text) + "\n\nREDDEDİLDİ — " + name});
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Giriş reddedildi"});
      }
    } else if (data.startsWith("moapprove:")) {
      // Muhasebe SİPARİŞ onayı (sipariş akışının 1. kapısı) — teyit iste. callback: moapprove:<mod>:<oid>
      const rest = data.slice(10);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text) + "\n\n⚠️ Bu siparişe MUHASEBE onayı veriyorsunuz.\nOnaylıyor musunuz?",
        reply_markup: {inline_keyboard: [[
          {text: "✅ Evet, Onayla", callback_data: "moconfirm:" + rest},
          {text: "✖️ Vazgeç", callback_data: "mocancel:" + rest},
        ]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id});
    } else if (data.startsWith("moconfirm:")) {
      // KİMLİK DOĞRULAMALI: yalnız yapılandırılmış muhasebe sipariş onaycıları (chatId). Aksi halde iç kullanıcı
      // tgGonder ile kendi chat'ine sahte 'moconfirm' forge edip muhasebe kapısını baypaslardı (mg: deseniyle aynı gerekçe).
      // callback: moconfirm:<mod>:<oid>[:<imzaHash>]  — sipariş id'si ASLA ':' içermez (uid tabanı base36)
      // → split güvenli. imzaHash yalnız DEĞİŞİKLİK mesajlarında bulunur (eski mesajlarda yok → kontrol atlanır).
      const _p = data.slice(10).split(":");
      // SAVUNMA: geçerli biçimler "oid" | "mod:oid" | "mod:oid:hash". Fazlası bozuk/uydurma çağrıdır —
      // sessizce yanlış siparişe onay yazmaktansa REDDET. (Sipariş id'si tasarımca ':' içermez.)
      if (_p.length > 3) {
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, show_alert: true, text: "Geçersiz onay bağlantısı. Sipariş ekranından yeniden gönderin."});
        res.status(200).send("ok"); return;
      }
      const mod = _p.length > 1 ? _p[0] : "t";
      const oid = _p.length > 1 ? _p[1] : _p[0];
      const beklenenH = _p.length > 2 ? _p[2] : null;
      const onaycilar = await getMuhasebeSiparisOnaycilar();
      const yetkili = onaycilar.length === 0 || onaycilar.some((a) => String(a.chatId) === String(cq.from.id));
      if (!yetkili) {
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Bu onayı yalnız yetkili muhasebe onaycısı verebilir.", show_alert: true});
      } else {
        const ts = new Date().toISOString();
        const order = await orderYukle(mod, oid);
        const suanImza = order ? siparisImza(order) : "";
        // BAYAT ONAY KORUMASI: mesaj gönderildikten SONRA sipariş yeniden değiştiyse bu butonla onaylamak,
        // onaycının EKRANDA GÖRMEDİĞİ bir içeriği onaylaması olurdu. Reddet — yeni mesajın butonu kullanılmalı.
        // İPTAL EDİLMİŞ SİPARİŞE ONAY VERİLEMEZ (imza statü içermez → bayat buton koruması yakalamıyordu)
        if (order && String(order.status || "") === "iptal") {
          await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, show_alert: true,
            text: "Bu sipariş İPTAL EDİLMİŞ. Onay verilemez."});
          res.status(200).send("ok"); return;
        }
        if (beklenenH && order && imzaHash(suanImza) !== beklenenH) {
          await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, show_alert: true,
            text: "Bu sipariş mesaj gönderildikten sonra TEKRAR değişti. Lütfen en son değişiklik mesajındaki onay butonunu kullanın."});
          res.status(200).send("ok"); return;
        }
        // Onay durumu yalnız-sunucu-yazılabilir apps/muhasebeonay'a yazılır (blob'a DEĞİL → forge edilemez).
        // imza: onayın HANGİ içeriğe verildiği (denetim izi; yaz() değişimi zaten kendi karşılaştırmasıyla yakalar).
        await db.doc("apps/muhasebeonay").set({[oid]: {by: name, ts, tgUserId: cq.from.id, tgUsername: cq.from.username || "", mod, no: order ? order.no : "", imza: imzaHash(suanImza)}}, {merge: true});
        // HAT KURALI (firma kararı): YEM hattı TEK KAPILIDIR — muhasebe onayı yeterlidir, ayrıca üretim
        // onayı İSTENMEZ. TMR hattı (Yem'den gelen çapraz siparişler dahil) İKİ KAPILIDIR.
        const uretimGerek = mod !== "y";
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: msgId,
          text: stripConfirm(text) + "\n\n✅ MUHASEBE ONAYLANDI — " + name +
            (uretimGerek ? "\n➡️ Üretim onayına gönderildi." : "\n🌾 Yem hattı — ayrıca üretim onayı gerekmiyor. Sipariş üretime geçti."),
        });
        await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "Muhasebe onayı verildi ✅"});
        try { await denetimVer("muhasebe-siparis-onaylandi", name, {oid, mod, no: order ? order.no : ""}); } catch (e) {}
        // KATI SIRA: muhasebe onayı verilince üretim onay mesajı (approve:) ancak ŞİMDİ gider — yalnız TMR hattında.
        if (uretimGerek) {
          try { await uretimOnayMesajiGonder(token, chatId, mod, oid, order); } catch (e) { console.error("üretim mesajı", e); }
        }
      }
    } else if (data.startsWith("mocancel:")) {
      const rest = data.slice(9);
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: msgId,
        text: stripConfirm(text),
        reply_markup: {inline_keyboard: [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:" + rest}]]},
      });
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id, text: "İptal edildi"});
    } else {
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id});
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error("webhook error", e);
    res.status(200).send("err"); // Telegram'ın yeniden denememesi için 200
  }
});

// ============================================================
// TELEGRAM GÖNDERİM UCU (Faz 0.1) — istemci artık bot token'ını görmez.
// İç personel (geçerli oturum + en az bir modül yetkisi) "şu mesajı gönder" der;
// sunucu token'ı secret'ten alıp Telegram'a yollar. Dış (bayi/müşteri) hesaplar reddedilir.
// ============================================================
exports.tgGonder = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    const roller = ["siparis", "yem", "muhasebe", "ik", "saha", "bakim", "toplanti"];
    const icKullanici = dec.portalYonetici === true || roller.some((r) => dec[r] && dec[r] !== "yok");
    if (!icKullanici) { res.status(403).json({hata: "yetkisiz"}); return; }   // dış hesaplar (tüm yetki 'yok') gönderemez
    if (!(await rateLimit("tgGonder:" + dec.uid, 60, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }

    const token = tgToken();
    if (!token) { res.status(500).json({hata: "token yapılandırılmadı"}); return; }
    const b = req.body || {};
    const text = String(b.text || "").slice(0, 4000);
    if (!text) { res.status(400).json({hata: "mesaj boş"}); return; }
    // Alıcı chat: varsayılan iç grup. b.chatId (muhasebe onayı gibi) YALNIZ KAYITLI portal chat'lerine izinli
    // (adaylar + muhasebe/yem onaycıları). Böylece iç kullanıcı şirket botunu rastgele bir Telegram chat'ine mesaj attıramaz.
    let chat = tgChat();
    if (b.chatId) {
      const istenen = String(b.chatId);
      const P = await portalOku();
      const kayitli = new Set();
      const ekle = (arr) => (Array.isArray(arr) ? arr : []).forEach((x) => { if (x && x.chatId != null) kayitli.add(String(x.chatId)); });
      if (P) { ekle(P.adaylar); ekle(P.muhasebeOnay && P.muhasebeOnay.alicilar); ekle(P.yemOnay && P.yemOnay.alicilar); ekle(P.muhasebeSiparisOnay && P.muhasebeSiparisOnay.alicilar); }
      if (chat) kayitli.add(String(chat));
      if (!kayitli.has(istenen)) { res.status(403).json({hata: "izinsiz alıcı"}); return; }
      chat = istenen;
    }
    if (!chat) { res.status(500).json({hata: "chat yapılandırılmadı"}); return; }

    const params = {chat_id: chat, text};
    if (b.buttons && Array.isArray(b.buttons)) {
      params.reply_markup = {inline_keyboard: b.buttons.map((row) => (row || []).map((btn) => {
        const o = {text: String(btn.text || "")};
        if (btn.url) o.url = String(btn.url);
        else if (btn.cb) o.callback_data = String(btn.cb).slice(0, 64);
        return o;
      }))};
    }
    await tg(token, "sendMessage", params);
    res.json({ok: true});
  } catch (e) {
    console.error("tgGonder", e);
    res.status(500).json({hata: "gönderilemedi"});
  }
});

// ============================================================
// YEM ÜRETİM ONAYI — OTOMATİK KAYIT (güvenlik: kilitli kaynak-doğruluk)
// Onaycı (Gülseren/yedek) yem siparişini KENDİ girince Telegram turu yoktur.
// Bu uç, çağıranın kimliğini SUNUCUDA doğrular (istemcinin __YEM_ONAY globaline GÜVENMEZ)
// ve onayı yalnız-sunucu-yazılabilir apps/yemonay belgesine işler. Böylece fabrikanın
// gördüğü "Onaylı" durumu, istemcinin ezebildiği apps/yem blob'undan DEĞİL, forge
// edilemeyen bu belgeden okunur. (EPOSTA_SON aşağıda tanımlı; istek anında hazır.)
// ============================================================
exports.yemOnayKaydet = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    const username = String(dec.email || "").replace(EPOSTA_SON, "").toLowerCase();
    const onaycilar = await getYemOnaycilar();
    const eslesen = onaycilar.find((a) => String(a.username || "").toLowerCase() === username);
    if (!eslesen) { res.status(403).json({hata: "yalnız yem onaycısı otomatik onaylayabilir"}); return; }
    if (!(await rateLimit("yemOnayKaydet:" + dec.uid, 30, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const oid = String((req.body && req.body.oid) || "").slice(0, 64);
    if (!oid) { res.status(400).json({hata: "sipariş kimliği yok"}); return; }
    const ts = new Date().toISOString();
    const adGoster = (await portalAd(eslesen.username || username)) || eslesen.ad || eslesen.username;   // portal adı > Telegram adı > username
    await db.doc("apps/yemonay").set({[oid]: {by: adGoster, ts, uid: dec.uid, otomatik: true}}, {merge: true});
    res.json({ok: true});
  } catch (e) {
    console.error("yemOnayKaydet", e);
    res.status(500).json({hata: "kaydedilemedi"});
  }
});

// ============================================================
// PANELDEN ONAY VERME (31.07) — Telegram'a bağımlı olmadan, sipariş kartından onay.
// GEREKÇE: muhasebe/üretim personeli Telegram butonuna her zaman ulaşamıyor, sipariş
// "teslim"e ilerleyemiyordu. Artık kart üzerinden de onaylanabilir.
//
// GÜVENLİK — onay kaydı DAİMA sunucuda üretilir; istemci "onaylandı" diyemez:
//   • Onay yalnız-sunucu-yazılabilir belgelere gider (apps/muhasebeonay · fabrikaonay · yemonay).
//     Bloba yazılan o.muhasebeOnay forge edilebilir; rozet/kapı bu belgeleri okur.
//   • "by" alanı İSTEMCİDEN ALINMAZ — jetondaki kimlikten portalAd() ile çözülür.
//   • Telegram akışındaki KORUMALARIN TAMAMI burada da uygulanır: iptal edilmiş sipariş,
//     bayat imza (onaycı EKRANDA GÖRMEDİĞİ içeriği onaylayamaz) ve KATI SIRA
//     (muhasebe onayı olmadan üretim onayı yazılamaz).
//
// YETKİ (FAZ 1): şimdilik modül claim'i yeterli — siparis/yem modülüne erişimi olan iç
// kullanıcı onaylayabilir. "Kim hangi onayı verebilir" rol politikası FAZ 2'de buraya
// eklenecek (tek nokta). Arayüzde düğmeyi gizlemek GÜVENLİK DEĞİLDİR: kapı burasıdır.
// ============================================================
const ONAY_HEDEF = {   // (mod, tur) → yalnız-sunucu-yazılabilir belge
  "t:muhasebe": "apps/muhasebeonay", "y:muhasebe": "apps/muhasebeonay",
  "t:uretim": "apps/fabrikaonay", "y:uretim": "apps/yemonay",
};
// TMR ÜRETİM onaycıları (apps/portal → P.fabrikaOnay.alicilar[{username,chatId,ad}]).
// Telegram'daki 'confirm:' akışında liste YOKTU (gruptaki herkes basabiliyordu); panelden
// onay için kimin yetkili olduğunu tanımlamak gerekti — muhasebe/yem listeleriyle aynı şekil.
async function getFabrikaOnaycilar() {
  try {
    const snap = await db.doc("apps/portal").get();
    const data = snap.exists ? snap.data().data : null;
    const P = data && data.rota_portal_v1 ? JSON.parse(data.rota_portal_v1) : null;
    return (P && P.fabrikaOnay && Array.isArray(P.fabrikaOnay.alicilar)) ? P.fabrikaOnay.alicilar : [];
  } catch (e) { return []; }
}
// PANELDEN ONAY YETKİSİ (firma kararı 31.07): Telegram için tanımlı onaycı listeleri panelde de
// geçerlidir — TEK KAYNAK. Kullanıcı adı (e-postanın @ öncesi) listeyle eşleşmeli.
// LİSTE BOŞSA: sessizce kilitlemek yerine AÇIK hata döneriz. Sessiz kilit, tam da bu özelliğin
// çözmeye çalıştığı "sipariş ilerleyemiyor" durumunu yeniden üretirdi; kullanıcı nedenini bilmeli.
const ONAY_LISTE_AD = {"t:muhasebe": "Muhasebe", "y:muhasebe": "Muhasebe", "t:uretim": "TMR Üretim", "y:uretim": "Yem Üretim"};
async function onayYetkisi(dec, mod, tur) {
  const anahtar = mod + ":" + tur;
  let liste = [];
  if (tur === "muhasebe") liste = await getMuhasebeSiparisOnaycilar();
  else liste = (mod === "y") ? await getYemOnaycilar() : await getFabrikaOnaycilar();
  const ad = ONAY_LISTE_AD[anahtar] || "Onay";
  if (!liste.length) {
    return {izin: false, kod: "onayci_tanimsiz",
      mesaj: ad + " onaycısı tanımlı değil. Portal → çark → Onaycılar bölümünden en az bir kişi ekleyin."};
  }
  const uname = String(dec.email || "").replace(EPOSTA_SON, "").toLowerCase();
  const var_ = liste.some((a) => String(a.username || "").toLowerCase() === uname);
  return var_ ? {izin: true} : {izin: false, kod: "yetki_yok", mesaj: ad + " onayını yalnız tanımlı onaycılar verebilir."};
}
exports.onayVer = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (!(await rateLimit("onayVer:" + dec.uid, 40, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }

    const b = req.body || {};
    const mod = String(b.mod || "") === "y" ? "y" : (String(b.mod || "") === "t" ? "t" : "");
    const tur = ["muhasebe", "uretim"].indexOf(String(b.tur || "")) >= 0 ? String(b.tur) : "";
    const oid = String(b.oid || "").slice(0, 64);
    const imza = String(b.imza || "").slice(0, 16);

    // KAPI 1 — MODÜL ERİŞİMİ: dış portal hesapları (bayi/danışman) ASLA onaylayamaz.
    const icKullanici = dec.rol !== "bayi" && dec.rol !== "danisman";
    const modErisim = (m) => {
      const app = m === "y" ? "yem" : "siparis";
      return icKullanici && (dec.portalYonetici === true || (dec[app] && dec[app] !== "yok"));
    };

    // SORGU MODU: hiçbir şey yazmaz — "ben hangi onayı verebilirim" sorusunu yanıtlar.
    // Arayüz düğmeyi buna göre gizler. GÜVENLİK DEĞİL, yalnız gösterim: gerçek kapı aşağıda.
    if (b.sorgu === true) {
      const y = {};
      for (const m of ["t", "y"]) {
        for (const t of ["muhasebe", "uretim"]) {
          y[m + ":" + t] = modErisim(m) ? (await onayYetkisi(dec, m, t)).izin : false;
        }
      }
      res.json({ok: true, yetkiler: y}); return;
    }

    if (!mod || !tur || !oid) { res.status(400).json({hata: "eksik parametre"}); return; }
    if (!modErisim(mod)) { res.status(403).json({hata: "bu modülde onay yetkiniz yok"}); return; }
    // KAPI 2 — ONAYCI LİSTESİ (firma kararı): Telegram için tanımlı liste panelde de geçerli.
    const yet = await onayYetkisi(dec, mod, tur);
    if (!yet.izin) { res.status(403).json({hata: yet.kod, mesaj: yet.mesaj}); return; }

    const order = await orderYukle(mod, oid);
    if (!order) { res.status(404).json({hata: "sipariş bulunamadı"}); return; }
    if (String(order.status || "") === "iptal") { res.status(409).json({hata: "iptal_edilmis", mesaj: "Bu sipariş İPTAL EDİLMİŞ — onay verilemez."}); return; }
    // BAYAT İMZA: ekranda görülen içerik ile sunucudaki kayıt ayrıştıysa onay geçersizdir.
    if (imza && imzaHash(siparisImza(order)) !== imza) {
      res.status(409).json({hata: "icerik_degisti", mesaj: "Sipariş siz ekranı açtıktan sonra değişti. Sayfayı yenileyip güncel içeriği görerek onaylayın."}); return;
    }
    // KATI SIRA: üretim onayı, muhasebe onayı olmadan YAZILAMAZ (Telegram yolundaki kuralın aynısı).
    if (tur === "uretim" && order.muhasebeOnayGerek === true && !(await muhasebeOnayVarMi(oid))) {
      res.status(409).json({hata: "once_muhasebe", mesaj: "Önce muhasebe onayı gerekli — bu sipariş henüz muhasebe onayından geçmedi."}); return;
    }

    const yol = ONAY_HEDEF[mod + ":" + tur];
    // MÜKERRER ONAY: zaten onaylıysa üzerine YAZMA — ilk onaylayanın adı ve saati korunur.
    try {
      const s = await db.doc(yol).get();
      const v = s.exists ? (s.data() || {})[oid] : null;
      if (v && v.by) { res.json({ok: true, zaten: true, by: v.by, ts: v.ts || ""}); return; }
    } catch (e) { /* okunamadıysa yazmayı dene */ }

    const uname = String(dec.email || "").replace(EPOSTA_SON, "").toLowerCase() || dec.uid;
    const ad = String((await portalAd(uname)) || uname).replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
    const ts = new Date().toISOString();
    await db.doc(yol).set({[oid]: {
      by: ad, ts, uid: dec.uid, kaynak: "panel", mod, no: order.no || "",
      imza: imzaHash(siparisImza(order)),   // NEYİN onaylandığının izi
    }}, {merge: true});
    try { await denetimVer("onay-panelden", uname, {mod, tur, oid, no: order.no || ""}); } catch (e) {}

    // TELEGRAM BİLGİSİ — yazma yolunu ASLA bloklamaz (silme bildirimi dersi): hata yutulur.
    // NOT: `tek()` burada KULLANILAMAZ — o, yaz() içinde YEREL bir sabit (modül düzeyinde yok).
    // Çağrılsaydı mesaj gönderiminde ReferenceError olurdu (bkz. kayitSayisi vakası, 30.07).
    const kirp = (s, n) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
    (async () => {
      const token = tgToken(), chat = tgChat();
      if (!token || !chat) return;
      const modAd = mod === "y" ? "Yem Sipariş" : "Sipariş Takip (TMR)";
      const turAd = tur === "muhasebe" ? "MUHASEBE" : "ÜRETİM";
      await tg(token, "sendMessage", {chat_id: chat, text:
        ("✅ " + turAd + " ONAYI VERİLDİ (panelden)\n" + modAd +
         "\n\nSipariş: #" + kirp(order.no || "?", 20) + "\nMüşteri: " + kirp(order.customer || order.aliciMusteri || "—", 40) +
         "\nOnaylayan: " + ad).slice(0, 3900)});
    })().catch((e) => console.error("onayVer/telegram", e));

    res.json({ok: true, by: ad, ts});
  } catch (e) {
    console.error("onayVer", e);
    res.status(500).json({hata: "kaydedilemedi"});
  }
});

// ============================================================
// SİLİNEN SİPARİŞLER (31.07) — "kim, ne zaman, neyi sildi" sipariş ekranından görünsün.
// NEDEN AYRI UÇ: denetim koleksiyonu firestore.rules'ta YALNIZ portalYönetici'ye açık ve
// içinde güvenlik olayları, kullanıcı yönetimi, İK izleri de var. Kuralı gevşetmek bunların
// tamamını sipariş personeline açardı. Bunun yerine sunucu YALNIZ 'siparis-silindi'
// kayıtlarını süzer ve modül claim'i olana döner — koleksiyona istemci hiç dokunmaz.
// NOT: silinen siparişin İÇERİĞİ (kalemler, fiyatlar) blob'dan gitmiştir; burada yalnız
// silme anında alınan özet vardır (no, müşteri, tutar, tarih). Tam kayıt için gece yedeği.
// ============================================================
exports.silinenler = onRequest({region: "us-central1", cors: true}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (!(await rateLimit("silinenler:" + dec.uid, 30, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const b = req.body || {};
    const app = ["siparis", "yem"].indexOf(String(b.app || "")) >= 0 ? String(b.app) : "siparis";
    // Dış portal hesapları (bayi/danışman) ASLA göremez; iç modül claim'i şart.
    const icKullanici = dec.rol !== "bayi" && dec.rol !== "danisman";
    if (!icKullanici || !(dec.portalYonetici === true || (dec[app] && dec[app] !== "yok"))) {
      res.status(403).json({hata: "bu modülde yetkiniz yok"}); return;
    }
    // orderBy KULLANILMIYOR: (islem, ts) bileşik indeksi gerektirirdi ve indeks yokken uç 500 döner.
    // Tek alan eşitliği varsayılan indeksle çalışır; sıralama bellekte yapılır.
    const snap = await db.collection("denetim").where("islem", "==", "siparis-silindi").limit(500).get();
    const ham = [];
    snap.forEach((d) => { const v = d.data() || {}; if (!v.detay || v.detay.app === app) ham.push(v); });
    ham.sort((a, b2) => String(b2.ts || "").localeCompare(String(a.ts || "")));
    const kesit = ham.slice(0, 200);
    // aktör kullanıcı adı → portaldaki görünen ad (tekrarlı çözümü önlemek için önbellek)
    const adOnbellek = {};
    const kayitlar = [];
    for (const k of kesit) {
      const u = String(k.aktor || "?");
      if (!(u in adOnbellek)) adOnbellek[u] = String((await portalAd(u)) || u).slice(0, 40);
      kayitlar.push({ts: k.ts || "", kim: adOnbellek[u], kullanici: u,
        siparisler: Array.isArray(k.detay && k.detay.siparisler) ? k.detay.siparisler : [],
        adet: (k.detay && k.detay.adet) || 0});
    }
    res.json({ok: true, kayitlar});
  } catch (e) {
    console.error("silinenler", e);
    res.status(500).json({hata: "okunamadı"});
  }
});

// ============================================================
// ÇAPRAZ SİPARİŞ BİLDİRİMİ (SUNUCU-TETİKLİ) — hedef modül KAPALI olsa bile çalışır.
// Eskiden Telegram onay mesajını hedef istemci processCrossQueue'da gönderiyordu →
// mesajın düşmesi için hedef panelin (TMR/Yem) açık olması gerekiyordu (mesai dışı sorun).
// Artık çapraz sipariş apps/cross kuyruğuna düştüğü AN, sunucu (her zaman açık) mesajı yollar.
// Onay anahtarı = kaynağın önceden ürettiği rec.targetId (hedef siparişin kesin id'si);
// böylece onay mevcut apps/yemonay (yoconfirm) / apps/fabrikaonay (confirm) altyapısına düşer,
// hedef panel açılıp siparişi targetId ile oluşturunca bekleyen onay otomatik yansır.
// bildirimGonderildi bayrağı tekrar-göndermeyi (ve tetik döngüsünü) engeller.
// ============================================================
exports.caprazBildir = onDocumentWritten({document: "apps/cross", region: "us-central1", secrets: [TG_TOKEN, TG_CHAT]}, async (event) => {
  const after = (event.data && event.data.after && event.data.after.exists) ? event.data.after.data() : null;
  const q = after && after.q ? after.q : null;
  if (!q) return;
  const token = tgToken(), chat = tgChat();
  if (!token || !chat) { console.log("caprazBildir: telegram secret yok"); return; }
  const gonderilen = {};
  for (const qid of Object.keys(q)) {
    const r = q[qid];
    if (!r || typeof r !== "object") continue;
    if (r.processed || r.bildirimGonderildi || !r.targetId) continue;   // işlenmiş / zaten bildirilmiş / eski kayıt (targetId yok) → atla
    const lines = Array.isArray(r.lines) ? r.lines.filter((l) => l && l.code && +l.qty > 0) : [];
    if (!lines.length) continue;
    const m = r.musteri || {};
    const urunler = lines.map((l) => "• " + l.code + ": " + l.qty + " çuval").join("\n");
    const ortak = "👤 Müşteri: " + (m.name || "—") + "\n" +
      "📞 Telefon: " + (m.phone || "—") + "\n" +
      "🧑‍💼 Sipariş alan: " + (r.by || "—") + "\n" +
      "📅 Teslim: " + (r.teslim || "—") + "\n\n" +
      "Ürünler:\n" + urunler + (r.not ? "\n\nNot: " + r.not : "");
    let text; let buttons;
    if (r.to === "yem") {
      // BİLGİ HATTI: yem siparişi onaya sunulmaz (firma kararı 29.07) → buton YOK.
      // TMR hedefli çapraz (aşağıdaki dal) TMR ürünüdür ve iki kapılı akışta KALIR.
      text = "🌾 YEM SİPARİŞİ (TMR'den çapraz)\n\n" + ortak +
        "\n\n(Bilgi amaçlıdır — onay gerekmez, sipariş doğrudan üretim listesine girer.)";
      buttons = null;
    } else if (r.to === "tmr") {
      text = "🆕 YENİ SİPARİŞ — MUHASEBE ONAYI BEKLİYOR (Yem'den çapraz)\n\n" + ortak +
        "\n\nÖnce muhasebe, ardından üretim onayı alınır 👇";
      // İMZASIZ buton (denetim 12.08.2026): r apps/cross KUYRUK kaydıdır — gerçek sipariş
      // istemci kuyruğu işlediğinde AYRI şekille oluşur (customerId/teslimTarihi dolu, "teslim"
      // alanı yok). Kuyruk imzası sipariş imzasıyla YAPISAL olarak asla tutmaz: buton, sipariş
      // oluştuğu anda "içerik değişti" diye ölüyordu (tam tersi: sipariş henüz YOKKEN geçiyordu).
      // İmza boş → moconfirm bayat-kontrolünü atlar; içerik denetimini yaz() değişiklik mesajları
      // ve iptal kontrolü zaten yapar.
      buttons = [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:t:" + r.targetId}]];
    } else { continue; }
    try {
      // buttons null olabilir (yem bilgi hattı) → reply_markup HİÇ konmaz.
      // {inline_keyboard: null} gönderilirse Telegram 400 döner ve bildirim HİÇ gitmez.
      const paket = {chat_id: chat, text};
      if (buttons) paket.reply_markup = {inline_keyboard: buttons};
      await tg(token, "sendMessage", paket);
      gonderilen[qid] = {bildirimGonderildi: true, bildirimTs: new Date().toISOString()};
    } catch (e) { console.error("caprazBildir gönderim", qid, e); }
  }
  if (Object.keys(gonderilen).length) {
    await db.doc("apps/cross").set({q: gonderilen}, {merge: true});
  }
});

// ============================================================
// YAZMA KİLİDİ (Faz 0.4) — veri-blob modüllerinin yazımı buradan geçer.
// Amaç: girişli-ama-yetkisiz (dış: tüm claim'i 'yok') hesaplar bir modülün TÜM
// DB blob'unu ezip silemesin. Kimlik + MODÜL CLAIM'i sunucuda doğrulanır; kurallar
// bu belgelerin doğrudan client yazımına kapatılır (firestore.rules write-exclusion).
// Kapsam: siparis, yem, saha, bakim, ik, toplanti. (muhasebe zaten kuralla kilitli;
// cross Faz 0.7.) 'updated' istemciden AYNEN yazılır — istemci onSnapshot self-suppression
// (updated===lastUpdated) bozulmasın diye sunucu kendi timestamp'ini ÜRETMEZ.
// ============================================================
// Blob içindeki toplam kayıt (tüm üst-düzey dizilerin uzunluğu). Parse edilemezse -1.
// Modül başına İZİNLİ localStorage anahtar önekleri — istemcideki isSyncKey() ile BİREBİR aynı olmalı.
// (toplanti bilerek çok önekli; yanlış daraltma o modülün kaydetmesini kırar.)
// Yabancı anahtar reddedilir: aksi halde blob'a dolgu anahtar eklenip toptan-silme guard'ı şişirilebiliyordu.
const APP_ONEK = {
  siparis: ["rota_so_"],
  yem: ["rota_yem_"],
  ik: ["rota_ik"],
  saha: ["rota_saha"],
  bakim: ["rota_bakim"],
  toplanti: ["rota_meeting_", "rota_arc", "rota_plasiyer_", "rota_monthly_", "rota_orders_"],
};
// Blob'daki her üst-düzey dizinin uzunluğu: {"rota_so_v1.orders": 500, "rota_so_v1.customers": 200, ...}
// TOPLAM sayı yerine DİZİ BAŞINA bakılır; toplam sayaç şu saldırıyla atlatılabiliyordu:
// bir diziyi şişirip (ya da dolu bırakıp) diğerlerini boşaltmak → toplam yüksek kalır, guard susar,
// müşteriler/ürünler/log sessizce silinirdi. Dizi başına bakınca her dizi kendi başına korunur.
// YEDEK/GERİ-YÜKLEME ÖZETLERİNDEKİ "kayıt" SAYISI = blob içindeki tüm dizilerin (orders,
// customers, products…) uzunluk toplamı. Tabanı diziUzunluk ile AYNI ki toptan-silme koruması
// ile yedek raporu aynı sayıyı konuşsun.
// ASLA İSTİSNA FIRLATMAZ: bu fonksiyon GERİ YÜKLEME yolunda, canlı veri EZİLDİKTEN SONRA
// çağrılıyor. Orada fırlayan hata 500'e dönüşüp operatöre "geri yükleme başarısız" yalanını
// söyler (oysa veri yazılmıştır) — 30.07 gecesi yedek alarmının kökü tam olarak buydu.
function kayitSayisi(blob) {
  try {
    const d = diziUzunluk(blob || {});
    return Object.keys(d).reduce((s, k) => s + (+d[k] || 0), 0);
  } catch (e) { console.error("kayitSayisi", e); return 0; }
}
function diziUzunluk(blob) {
  const out = {};
  for (const key of Object.keys(blob || {})) {
    let o = null;
    try { o = JSON.parse(blob[key] || "{}"); } catch (e) { continue; }
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const k in o) if (Array.isArray(o[k])) out[key + "." + k] = o[k].length;
    }
  }
  return out;
}
// ============================================================
// SİPARİŞ İÇERİK DEĞİŞİKLİĞİ / İPTAL TESPİTİ  (yaz() içinde, SUNUCU TARAFLI)
// Silme bildirimiyle AYNI mimari: istemci bu yolu ATLAYAMAZ — her kayıt yaz()'dan geçer.
// ------------------------------------------------------------
// İÇERİK = faturayı/üretimi etkileyen alanlar. Sevkiyat (plaka/şoför/hareket), durum, not,
// onay bayrakları ve TÜREVLER (total, imeceOran/imeceFark, dbsOran, brutListe, cuval, brut...)
// KASITEN DIŞARIDA: bunlar değişince müşteriden yeniden onay istemek gereksiz gürültü olur.
const ICERIK_ALAN = ["customerId", "bayiId", "aliciBayi", "aliciMusteri", "portalMusteri",
  "teslimTarihi", "fiyatKademe", "priceListId", "nakliye", "faturaManuel",
  "imeceSecili", "imeceAy", "imeceKartTutar", "odeme", "vade", "nakliyeBirim", "nakliyeTipi", "hammaliyeBirim",
  "iskontoOran", "iskontoTL", "ozelListeId", "araciId", "araciKomisyon"];
function siparisImza(o) {
  if (!o) return "";
  const L = (Array.isArray(o.lines) ? o.lines : []).filter((l) => l && l.code)
    .map((l) => String(l.code) + "|" + (+l.qty || 0) + "|" + (l.price === "" || l.price == null ? "" : (+l.price || 0)))
    .sort().join(";");
  const F = ICERIK_ALAN.map((k) => {
    const v = o[k];
    if (v == null || v === "") return "";
    if (typeof v === "boolean") return v ? "1" : "0";
    // GÜVENLİ ÇEVİRİM: blob istemciden gelir; {toString:null} gibi bir nesne String(v)'de TypeError atar
    // ve tüm tespit bloğunu düşürürdü (sevk kilidi + onay düşürme baypası).
    if (typeof v === "object") { try { return JSON.stringify(v); } catch (e) { return "[nesne]"; } }
    return String(v);
  }).join("~");
  return F + "~~" + L;
}
// Kısa imza damgası (callback_data 64 bayt sınırına sığar). Onay butonuna eklenir; onaylanırken
// sipariş yeniden değişmişse eski mesajın butonu REDDEDİLİR (bayat onay engellenir).
function imzaHash(s) {
  let h = 5381;
  const t = String(s || "");
  for (let i = 0; i < t.length; i++) { h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0; }
  return h.toString(36).slice(0, 7);
}
// İki sipariş sürümü arasındaki farkı OKUNUR satırlara çevirir. Alanlar kullanıcı verisidir →
// tek() ile satır sonu temizlenir (Telegram mesajına sahte satır enjekte edilmesin) + kırpılır.
function siparisFark(eski, yeni, adCoz) {
  const tek = (s, n) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, n || 40);
  const say = (n) => (+n || 0).toLocaleString("tr-TR", {maximumFractionDigits: 2});
  const out = [];
  // ürün satırları: kod → {qty, price}
  const harita = (o) => { const m = {}; (Array.isArray(o.lines) ? o.lines : []).forEach((l) => { if (l && l.code) m[String(l.code)] = {q: +l.qty || 0, p: (l.price === "" || l.price == null) ? null : (+l.price || 0)}; }); return m; };
  const A = harita(eski), B = harita(yeni);
  Object.keys(B).forEach((k) => {
    if (!A[k]) { out.push("➕ Ürün eklendi: " + tek(k, 24) + " — " + say(B[k].q) + " çuval"); return; }
    if (A[k].q !== B[k].q) out.push("🔄 " + tek(k, 24) + ": " + say(A[k].q) + " → " + say(B[k].q) + " çuval");
    if (A[k].p !== B[k].p) out.push("💠 " + tek(k, 24) + " birim fiyat: " + (A[k].p == null ? "—" : say(A[k].p)) + " → " + (B[k].p == null ? "—" : say(B[k].p)));
  });
  Object.keys(A).forEach((k) => { if (!B[k]) out.push("➖ Ürün çıkarıldı: " + tek(k, 24) + " — " + say(A[k].q) + " çuval"); });
  // alan değişimleri
  const ETIKET = {teslimTarihi: "Teslim tarihi", fiyatKademe: "Fiyat kademesi", nakliye: "Nakliye",
    faturaManuel: "Manuel fatura tutarı", imeceAy: "İMECE vade (ay)",
    imeceKartTutar: "İMECE karta işlenecek tutar", odeme: "Ödeme", vade: "Vade",
    nakliyeBirim: "Nakliye birim", nakliyeTipi: "Nakliye tipi", hammaliyeBirim: "Hammaliye birim",
    iskontoOran: "İskonto oranı", iskontoTL: "İskonto (TL)", araciKomisyon: "Aracı komisyonu",
    aliciBayi: "Bayiye satış", bayiId: "Bayi kaydı", araciId: "Aracı kaydı",
    priceListId: "Fiyat listesi", ozelListeId: "Özel liste", aliciMusteri: "Alıcı müşteri", portalMusteri: "Portal müşterisi"};
  Object.keys(ETIKET).forEach((k) => {
    const a = eski[k] == null || eski[k] === "" ? "—" : String(eski[k]);
    const b = yeni[k] == null || yeni[k] === "" ? "—" : String(yeni[k]);
    if (a !== b) out.push("• " + ETIKET[k] + ": " + tek(a, 30) + " → " + tek(b, 30));
  });
  // alıcı değişimi (ad çözülerek)
  const alici = (o) => adCoz(o);
  if (alici(eski) !== alici(yeni)) out.push("👤 Alıcı: " + tek(alici(eski), 40) + " → " + tek(alici(yeni), 40));
  if (!!eski.imeceSecili !== !!yeni.imeceSecili) out.push("• Ödeme yöntemi: " + (eski.imeceSecili ? "İMECE kart" : "normal") + " → " + (yeni.imeceSecili ? "İMECE kart" : "normal"));
  return out;
}
exports.yaz = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    const IZINLI = ["siparis", "yem", "saha", "bakim", "ik", "toplanti"];
    const app = String((req.body && req.body.app) || "");
    if (!IZINLI.includes(app)) { res.status(400).json({hata: "geçersiz modül"}); return; }   // exact-match allowlist — db.doc'tan ÖNCE (path injection + Admin-SDK bypass kapalı)
    if (!(dec.portalYonetici === true || (dec[app] && dec[app] !== "yok"))) { res.status(403).json({hata: "bu modülü yazma yetkiniz yok"}); return; }   // dec[app] && şart: provision edilmemiş hesapta claim undefined → sızıntı olmasın
    // HIZ SINIRI (modül BAŞINA ayrı bütçe) — KAÇAK DÖNGÜ emniyet supabı, meşru kullanımı kesmemeli:
    // istemci 900 ms debounce ile push eder → tek sekme ~66/dk; 3-4 sekme açık kullanıcı da 300'ü aşmaz.
    // Bilinçli olarak GENİŞ: bu bir KAYDETME yolu, 429 = kullanıcının verisi kaydedilmedi demektir.
    // Asıl selleme riski (bildirim) aşağıda AYRI ve dar bir sınırla kısılır — yazma yolu değil, mesaj kısılır.
    // rateLimit fail-open'dır (Firestore arızasında kaydetmeyi ENGELLEMEZ).
    if (!(await rateLimit("yaz:" + app + ":" + dec.uid, 300, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const b = req.body || {};
    if (!b.data || typeof b.data !== "object") { res.status(400).json({hata: "veri yok"}); return; }
    // ANAHTAR BEYAZ-LİSTESİ: blob yalnız BU modülün kendi anahtarlarını taşıyabilir.
    // Yabancı anahtar = dolgu saldırısı (guard'ı şişirip toptan silme) veya modül karıştırma → REDDET.
    // Sessizce ayıklamak YERİNE reddediyoruz: sessiz ayıklama meşru veriyi fark ettirmeden düşürebilirdi.
    {
      const onekler = APP_ONEK[app] || [];
      const yabanci = Object.keys(b.data).filter((k) => !onekler.some((p) => String(k).indexOf(p) === 0));
      if (yabanci.length) { console.warn("yaz yabancı anahtar", {app, uid: dec.uid, yabanci: yabanci.slice(0, 5)}); res.status(400).json({hata: "gecersiz_anahtar", anahtar: yabanci.slice(0, 5)}); return; }
      // Her değer GEÇERLİ JSON metni olmalı. Aksi halde bozuk tek bir değerle koruma sayımı susturulup
      // (ayrıştırılamayan blob "bilinmiyor" sayılır) tüm modül sessizce boşaltılabiliyordu.
      for (const k of Object.keys(b.data)) {
        const v = b.data[k];
        if (typeof v !== "string") { res.status(400).json({hata: "gecersiz_veri", anahtar: k}); return; }
        try { JSON.parse(v); } catch (e) { res.status(400).json({hata: "bozuk_json", anahtar: k}); return; }
      }
    }
    const updated0 = (typeof b.updated === "number") ? b.updated : Date.now();
    // SİLME YETKİSİ (sunucu ucu) — arayüzdeki canDelete() ile AYNI kural: portalYönetici | modül admin | siparisSil.
    // Not: claim'i bayat token'da eksikse istemci 403'te getIdToken(true) ile tazeleyip BİR KEZ yeniden dener → meşru silen takılmaz.
    const silmeHakki = (dec.portalYonetici === true) || (dec[app] === "admin") || (dec.siparisSil === true);
    // ATOMİK OKU-KORU-YAZ (tek transaction). 'bayi'/'danisman' fonksiyonları apps/siparis & apps/yem'e portal
    // siparişini TRANSACTION ile ekler. Koruma+nihai yazım transaction DIŞINDA olursa, o portal transaction'ı
    // yaz'ın okuması ile yazması ARASINDA commit ederse blind set() onu KALICI ezer (optimistic-lock'a katılmaz).
    // Bu yüzden koruma (son 10 dk portal kayıtlarını geri ekle) + toptan-silme guard'ı + nihai yazım TEK transaction'da:
    // portal transaction'ı ile aynı kilit havuzunda yarışır → çakışırsa yaz yeniden dener, kayıp olmaz.
    let wipe = null, silinen = null, silinenMusteri = null, yetkisizSilme = false, degisen = null, iptalEdilen = null, sevkKilidi = null, fiyatKorundu = null;
    try {
      await db.runTransaction(async (tx) => {
        wipe = null; silinen = null; silinenMusteri = null; yetkisizSilme = false; degisen = null; iptalEdilen = null; sevkKilidi = null; fiyatKorundu = null;   // transaction YENİDEN DENENEBİLİR → her denemede sıfırla (yoksa mükerrer bildirim)
        const cur = await tx.get(db.doc("apps/" + app));
        const curBlob = cur.exists ? (cur.data().data || null) : null;
        // TARİHÇE: "eksikleri geri ekle" ilk denemede TOPLAM sayaçlı guard ile birlikte KRİTİK açık doğurmuştu
        // (geri eklenenler sayacı şişirip blob'un geri kalanını sessizce sildiriyordu). Guard DİZİ BAŞINA
        // çevrildikten sonra (bkz. diziUzunluk) bu sınıf hata kapandı ve koruma aşağıda güvenle uygulanıyor.
        let outData = b.data, outUpdated = updated0, korundu = false;
        // KAYIT KORUMASI (siparis + yem, aynı desen): gelen blob'da id'si OLMAYAN yeni (son 10 dk, beklemede) portal
        // sipariş/müşterilerini TAZE okunan mevcut veriden geri ekle. 10 dk sonra kendiliğinden söner → meşru silmeyi engellemez.
        if ((app === "siparis" || app === "yem") && curBlob) {
          const KEY = app === "siparis" ? "rota_so_v1" : "rota_yem_v1";
          let curDB = null; try { curDB = JSON.parse(curBlob[KEY] || "null"); } catch (e) { curDB = null; }
          let inDB = null; try { inDB = JSON.parse((b.data && b.data[KEY]) || "null"); } catch (e) { inDB = null; }
          if (curDB && inDB) {
            const now = Date.now(), taze = (t) => t && (now - Date.parse(t) < 10 * 60 * 1000);
            const portalKaynak = (k) => k === "bayi-portal" || k === "danisman-portal";
            if (Array.isArray(curDB.orders) && Array.isArray(inDB.orders)) {
              const gelen = new Set(inDB.orders.map((o) => o && o.id));
              const korO = curDB.orders.filter((o) => o && portalKaynak(o.kaynak) && o.status === "beklemede" && !gelen.has(o.id) && taze(o.createdAt));
              if (korO.length) { inDB.orders = inDB.orders.concat(korO); korundu = true; console.log("yaz: " + korO.length + " portal siparişi korundu (" + app + ")"); }
            }
            // ===== EŞZAMANLI DÜZENLEME KORUMASI (kayıp-güncelleme) =====
            // Whole-blob senkronda "kayıt blob'ta yok" = "silindi" varsayımı, başkasının ARADA eklediği
            // kaydı sessizce yok ediyordu. Artık silme AÇIK: istemci sildiği id'leri b.sil ile bildirir.
            // Bildirilmeyen eksikler GERİ EKLENİR. Bildirmeyen (eski/kötü niyetli) istemci hiçbir şey silemez.
            // force+portalYönetici (sıfırlama aracı) muaftır — kasıtlı toplu silme oradan yapılır.
            const _muaf = (b.force === true && dec.portalYonetici === true);
            const _silSeti = (ad) => {
              const L = (b.sil && typeof b.sil === "object" && Array.isArray(b.sil[ad])) ? b.sil[ad] : [];
              return new Set(L.slice(0, 5000).map(String));
            };
            if (!_muaf) {
              [["orders", curDB.orders, "sipariş"], ["customers", curDB.customers, "müşteri"],
                ["preOrders", curDB.preOrders, "ön sipariş"]].forEach(function (t) {
                const ad = t[0], curArr = t[1], etiket = t[2];
                if (!Array.isArray(curArr) || !Array.isArray(inDB[ad])) return;
                const sil = _silSeti(ad);
                // 1) AÇIK silme HER HÂLDE uygulanır — kayıt gelen blob'ta hâlâ DURUYOR olsa bile.
                //    (Silme ile push arasında başkasının snapshot'ı gelip yerel kaydı geri koyabiliyor;
                //     silme niyeti listede olduğu için yine de silinir, sessizce kaybolmaz.)
                if (sil.size) {
                  const oncekiN = inDB[ad].length;
                  inDB[ad] = inDB[ad].filter((x) => !(x && sil.has(String(x.id))));
                  if (inDB[ad].length !== oncekiN) korundu = true;
                }
                // 2) Bildirilmemiş eksikler GERİ EKLENİR (başkasının eşzamanlı eklediği kayıt kaybolmasın).
                const gelenId = new Set(inDB[ad].map((x) => x && x.id));
                const geri = curArr.filter((x) => x && x.id && !gelenId.has(x.id) && !sil.has(String(x.id)));
                if (geri.length) {
                  inDB[ad] = inDB[ad].concat(geri); korundu = true;
                  console.log("yaz: eşzamanlı koruma — " + geri.length + " " + etiket + " geri eklendi (" + app + ")");
                }
              });
            }
            // SİPARİŞ SİLME TESPİTİ: sunucuda olup gelen blob'da OLMAYAN siparişler (yukarıdaki korumadan SONRA,
            // yani yalnız AÇIKÇA bildirilmiş gerçek silmeler kalır). Yalnız TESPİT edilir;
            // Telegram bildirimi transaction DIŞINDA gönderilir (tx yeniden denenebilir → mükerrer mesaj olurdu).
            // Koruma birleşmesinden SONRA hesaplanır ki geri eklenen portal siparişi "silinmiş" sayılmasın.
            // İstemciye güvenmez: silen kişi bildirimi atlayamaz, her silme buradan geçer.
            if (Array.isArray(curDB.orders) && Array.isArray(inDB.orders)) {
              const kalan = new Set(inDB.orders.map((o) => o && o.id));
              // Alanlar KULLANICI verisidir: satır sonu temizlenir (mesaja sahte satır enjekte edilmesin) ve
              // uzunluk kırpılır (Telegram 4096 sınırı + denetim kaydının şişmesi).
              const tek = (s, n) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
              const musAd = (o) => {
                const c = (curDB.customers || []).find((x) => x && x.id === o.customerId);
                return tek((c && c.name) || o.customer || o.aliciMusteri || o.musteri || "—", 40);   // portal/çapraz siparişte customerId boş olabilir
              };
              const gitti = curDB.orders.filter((o) => o && o.id && !kalan.has(o.id));
              if (gitti.length) {
                silinen = gitti.map((o) => ({no: tek(o.no || "?", 20), ad: musAd(o), tutar: (typeof o.total === "number" ? o.total : null), tarih: tek(o.date || "", 10)}));
              }
              // ===== İÇERİK DEĞİŞİKLİĞİ + İPTAL TESPİTİ (silme ile aynı yol: istemci atlayamaz) =====
              // Aynı id'nin ESKİ ve YENİ sürümü karşılaştırılır. İçerik imzası değişmişse müşteri/üretim
              // için anlamlı bir değişiklik olmuştur → muhasebe onayı DÜŞER ve yeniden istenir.
              // İptal ayrı ele alınır (onay düşürmeye gerek yok, sipariş zaten iptal).
              const eskiHar = new Map();
              curDB.orders.forEach((o) => { if (o && o.id) eskiHar.set(o.id, o); });
              const adCoz = (o) => {
                if (!o) return "—";
                const c = (curDB.customers || []).find((x) => x && x.id === o.customerId);
                return tek((c && c.name) || o.customer || o.aliciMusteri || o.musteri || "—", 40);
              };
              const _deg = [], _ipt = [], _kilitli = [];
              // Modül yöneticisi mi (silme hakkıyla AYNI ölçüt): portalYönetici | modül admin
              const yoneticiMi = (dec.portalYonetici === true) || (dec[app] === "admin");
              // İZOLASYON: SİPARİŞ BAŞINA try/catch (aşağıda). Tek try tüm döngüyü sarsaydı, bir kaydın
              // bozuk alanı DİĞER siparişlerin kilit/onay denetimini de düşürürdü (denetimde bulunan baypas).
              // ONAYI DÜŞÜR (blob tarafı): aynı transaction'da yazılır → kayıt ile bayrak ayrışmaz.
              // apps/muhasebeonay + fabrikaonay/yemonay (güvenilir kaynak) tx DIŞINDA temizlenir.
              const onayDusur = (yo, idx) => {
                const kopya = Object.assign({}, yo);
                delete kopya.muhasebeOnay; delete kopya.fabrikaOnay; delete kopya.yemOnay;
                // BİLGİ HATTI: onay hiç istenmiyor → bayrağı DİRİLTME. Diriltilseydi ekranda sonsuza
                // kadar "Muhasebe Onayı — Bekliyor" kutusu kalırdı (kimse onaylamayacağı için).
                kopya.muhasebeOnayGerek = !yemBilgiHatti(app, yo);
                inDB.orders[idx] = kopya; korundu = true;
              };
              inDB.orders.forEach((yo, idx) => {
                try {
                if (!yo || !yo.id) return;
                const eo = eskiHar.get(yo.id);
                if (!eo) return;                                            // yeni sipariş — kendi mesajı zaten gider
                // GEÇMİŞ (Excel/sessiz mod) KAYIT MUAFİYETİ: bu kayıtlar onay zincirinden geçmez;
                // düzeltmeleri grubu "yeniden onay" mesajıyla doldurmamalı ve kaydı kilitlememeli.
                // MUAFİYET YALNIZ SUNUCUDAKİ KAYDA GÖRE: gecmisKayit istemciden gelen bir bayraktır;
                // yo.gecmisKayit'e bakılırsa kullanıcı bayrağı gönderip sevk kilidini ve onay düşürmeyi
                // tek alanla kapatabilirdi. Sunucuda zaten geçmiş kayıt olanlar muaftır.
                if (eo.gecmisKayit === true) return;
                const eskiIptal = String(eo.status || "") === "iptal";
                const yeniIptal = String(yo.status || "") === "iptal";
                const eImza = siparisImza(eo), yImza = siparisImza(yo);
                const imzaDegisti = eImza !== yImza;
                // --- 1) İPTAL EDİLDİ ---
                if (!eskiIptal && yeniIptal) {
                  _ipt.push({id: yo.id, tur: "iptal", no: tek(yo.no || "?", 20), ad: adCoz(yo), tutar: (typeof eo.total === "number" ? eo.total : null),
                    tarih: tek(yo.date || "", 10), teslim: tek(yo.teslimTarihi || "", 10),
                    urun: (Array.isArray(eo.lines) ? eo.lines : []).filter((l) => l && l.code).slice(0, 6).map((l) => tek(l.code, 24) + " × " + (+l.qty || 0)).join(", ")});
                  onayDusur(yo, idx);                                        // iptal edilen siparişin onayı da düşer (geri açılırsa yeniden onaylansın)
                  return;
                }
                // --- 2) İPTALDEN GERİ ALINDI --- (KAPI BYPASS'I: iptalliyken içerik değiştirilip geri açılabiliyordu)
                // İçerik değişmemiş olsa bile onay KOŞULSUZ düşer: iptal edilmiş bir sipariş yeniden
                // üretime giriyorsa muhasebe bunu görmeli.
                if (eskiIptal && !yeniIptal) {
                  const farklar = siparisFark(eo, yo, adCoz);
                  _deg.push({id: yo.id, tur: "geriAlindi", no: tek(yo.no || "?", 20), ad: adCoz(yo),
                    farklar: farklar.length ? farklar : ["• Sipariş iptalden geri alındı (içerik aynı)"],
                    teslim: tek(yo.teslimTarihi || "", 10), imzaH: imzaHash(yImza),
                    onayliydi: !!(eo.muhasebeOnay && eo.muhasebeOnay.by),
                    urun: (Array.isArray(yo.lines) ? yo.lines : []).filter((l) => l && l.code).slice(0, 8).map((l) => tek(l.code, 24) + ": " + (+l.qty || 0) + " çuval")});
                  onayDusur(yo, idx);
                  return;
                }
                // --- 3) İKİSİ DE İPTAL --- içerik değiştiyse onayı yine düşür (geri açıldığında diri kalmasın),
                // ama Telegram'a mesaj GÖNDERME (iptal sipariş, gürültü olur).
                if (eskiIptal && yeniIptal) { if (imzaDegisti) onayDusur(yo, idx); return; }
                // --- 4) NORMAL İÇERİK DEĞİŞİKLİĞİ ---
                if (!imzaDegisti) return;
                // SEVK SONRASI İÇERİK KİLİDİ (sunucu ucu — arayüz kilidi konsoldan atlatılabilir).
                // Mal çıkmış siparişin içeriğini YALNIZ yönetici değiştirebilir. Yetkisizse yazım İPTAL,
                // 403 döner (silme yetkisi kapısıyla aynı desen). Sevkiyat alanları içerik DEĞİLDİR → serbest.
                if (["sevk", "teslim"].indexOf(String(eo.status || "")) >= 0 && !yoneticiMi) {
                  _kilitli.push({no: tek(yo.no || "?", 20), ad: adCoz(yo)});
                  return;
                }
                const farklar = siparisFark(eo, yo, adCoz);
                // ÖNEMLİ: onay düşürme ASLA "okunur fark üretilebildi mi"ye bağlanmaz. ICERIK_ALAN'ın bir
                // kısmının (bayiId, araciId, priceListId, aynı adlı customerId...) metin karşılığı yok;
                // erken return konulursa o alanlarda özellik hiç çalışmaz (denetimde bulunan kritik hata).
                _deg.push({id: yo.id, tur: "degisti", no: tek(yo.no || "?", 20), ad: adCoz(yo),
                  farklar: farklar.length ? farklar : ["• Sipariş içeriği değişti (ayrıntı çözülemedi — kaydı karşılaştırın)"],
                  teslim: tek(yo.teslimTarihi || "", 10), imzaH: imzaHash(yImza),
                  bilgi: yemBilgiHatti(app, yo),   // true → Telegram mesajı BİLGİ olur, onay butonu konmaz
                  onayliydi: !!(eo.muhasebeOnay && eo.muhasebeOnay.by),
                  urun: (Array.isArray(yo.lines) ? yo.lines : []).filter((l) => l && l.code).slice(0, 8).map((l) => tek(l.code, 24) + ": " + (+l.qty || 0) + " çuval")});
                onayDusur(yo, idx);
                } catch (e) {
                  // SİPARİŞ BAŞINA İZOLASYON: bir kaydın bozuk alanı DİĞER siparişlerin kilit/onay
                  // denetimini düşürmemeli (tek try/catch tüm döngüyü susturuyordu → sevk kilidi baypası).
                  // Çözemediğimiz kayıtta MUHAFAZAKÂR davran: sevk edilmişse yönetici değilse REDDET.
                  console.error("degisiklik tespiti (sipariş atlandı)", yo && yo.id, e);
                  try {
                    const _eo = eskiHar.get(yo && yo.id);
                    if (_eo && ["sevk", "teslim"].indexOf(String(_eo.status || "")) >= 0 && !yoneticiMi) _kilitli.push({no: tek(yo.no || "?", 20), ad: "(çözümlenemedi)"});
                  } catch (e2) {}
                }
              });
              if (_deg.length) degisen = _deg;
              if (_ipt.length) iptalEdilen = _ipt;
              if (_kilitli.length) { sevkKilidi = _kilitli; return; }   // transaction İPTAL — yazım yapılmaz
            }
            // MÜŞTERİ SİLME de yetki kapısına girer: aksi halde yazma izni olan herkes (plasiyer dahil)
            // müşteri kaydını kalıcı silebiliyordu — ne bildirim ne denetim izi kalıyordu.
            if (Array.isArray(curDB.customers) && Array.isArray(inDB.customers)) {
              const kalanM = new Set(inDB.customers.map((c) => c && c.id));
              silinenMusteri = curDB.customers.filter((c) => c && c.id && !kalanM.has(c.id))
                .map((c) => ({ad: tek(c.name || "—", 40)}));
            }
            if (app === "siparis" && Array.isArray(curDB.customers) && Array.isArray(inDB.customers)) {
              const gc = new Set(inDB.customers.map((c) => c && c.id));
              const korC = curDB.customers.filter((c) => c && portalKaynak(c.kaynak) && !gc.has(c.id) && taze(c.createdAt));
              if (korC.length) { inDB.customers = inDB.customers.concat(korC); korundu = true; console.log("yaz: " + korC.length + " portal müşterisi korundu"); }
            }
            // KOMİSYONCULAR (bayi/danışman) TEK KAYNAK = komisyoncuYonet ucu. yaz (tam-blob push) komisyoncular'ı DEĞİŞTİREMEZ:
            // gelen blob ne olursa olsun SUNUCUDAKİ komisyoncular korunur. Böylece düşük-yetkili siparis kullanıcısı (plasiyer)
            // komisyon oranı/atamalarını ezerek komisyoncuYonet'in saha-yönetici yetki kapısını baypaslayamaz.
            if (app === "siparis" && Array.isArray(curDB.komisyoncular)) {
              if (JSON.stringify(inDB.komisyoncular || null) !== JSON.stringify(curDB.komisyoncular)) {
                inDB.komisyoncular = curDB.komisyoncular; korundu = true; console.log("yaz: komisyoncular sunucu sürümü korundu (yalnız komisyoncuYonet yazar)");
              }
            }
            // FİYAT & TARİFE KAPISI: ürün fiyatları ve yayınlanmış tarifeler YALNIZ yöneticiyle değişir.
            // Arayüz zaten kilitli ama konsoldan atlanabilir; fiyat yayınlanan tarifeye, oradan HER siparişe yansır.
            // REDDETME DEĞİL SÜZME (komisyoncular deseniyle aynı): 403 dönseydi yetkisiz kullanıcının YEREL blobu
            // kirli kalır, aynı istek her seferinde reddedilir ve o sekme BİR DAHA hiç kaydedemezdi.
            // Sunucudaki sürüm korunur; istemci taze 'updated' ile doğrusunu geri alır.
            if (app === "siparis" || app === "yem") {
              const fyYonetici = (dec.portalYonetici === true) || (dec[app] === "admin");
              if (!fyYonetici) {
                // Ürün imzası SIRADAN BAĞIMSIZ (kart düzenlemesi diziyi kaydırırsa yanlış alarm olmasın),
                // tarife imzası ise birebir: tarife append-only, içeriği değişmemeli.
                const urunImza = (db) => JSON.stringify((Array.isArray(db.products) ? db.products : [])
                  .map((p) => p ? [String(p.code || ""), +p.fabrika || 0, +p.yakin || 0, +p.uzak || 0,
                    +p.danismanListe || 0, +p.krediKarti || 0, String(p.pkg || ""), p.active !== false] : null)
                  .sort((x, y) => String(x && x[0]).localeCompare(String(y && y[0]))));
                const tarifeImza = (db) => JSON.stringify(db.priceLists || null) + "|" +
                  String((db.meta && db.meta.activePriceListId) || "");
                const uD = urunImza(inDB) !== urunImza(curDB), tD = tarifeImza(inDB) !== tarifeImza(curDB);
                if (uD || tD) {
                  if (uD && Array.isArray(curDB.products)) inDB.products = curDB.products;
                  if (tD) {
                    if (curDB.priceLists !== undefined) inDB.priceLists = curDB.priceLists;
                    if (inDB.meta && curDB.meta) inDB.meta.activePriceListId = curDB.meta.activePriceListId;
                  }
                  korundu = true;
                  fiyatKorundu = {urun: uD, tarife: tD};
                  console.warn("yaz: yetkisiz fiyat/tarife değişimi süzüldü", {app, uid: dec.uid, urun: uD, tarife: tD});
                }
              }
            }
            // KORUMA blobu DEĞİŞTİRDİYSE taze 'updated' üret — yoksa istemci echo'yu görüp onSnapshot'ı self-suppress eder
            // (updated===lastUpdated) ve geri-eklenen kaydı hidratlamaz. Taze updated ile pushlayan istemci merge'i alır.
            if (korundu) { outData = Object.assign({}, b.data, {[KEY]: JSON.stringify(inDB)}); outUpdated = Date.now(); }
          }
        }
        // TOPTAN-SİLME KORUMASI: mevcut kayıt anlamlıysa (>=20) ve yeni blob %70+ kaybediyorsa REDDET.
        // force YALNIZ portalYönetici'de guard'ı atlar (sıradan yazıcı force gönderse bile guard uygulanır — yetkisiz wipe kapalı).
        if (!(b.force === true && dec.portalYonetici === true) && curBlob) {
          const eskiD = diziUzunluk(curBlob), yeniD = diziUzunluk(outData);
          for (const ad of Object.keys(eskiD)) {   // YALNIZ sunucuda VAR OLAN diziler ölçülür → uydurma dizi ekleyip sayaç şişirmek işe yaramaz
            if (eskiD[ad] >= 20 && (yeniD[ad] || 0) < eskiD[ad] * 0.3) { wipe = {dizi: ad, eski: eskiD[ad], yeni: (yeniD[ad] || 0)}; return; }
          }
        }
        // SİLME YETKİSİ KAPISI: silme tespit edildi ama kullanıcının hakkı yoksa yazımı İPTAL et.
        // (Önceden yalnız arayüzde engelleniyordu → modüle erişimi olan biri konsoldan ham fetch ile silebiliyordu.)
        if (((silinen && silinen.length) || (silinenMusteri && silinenMusteri.length)) && !silmeHakki) { yetkisizSilme = true; return; }
        tx.set(db.doc("apps/" + app), {data: outData, updated: outUpdated});   // merge YOK — tam-blob değişim
      });
    } catch (e) { console.error("yaz/tx", e); res.status(500).json({hata: "yazılamadı"}); return; }
    if (wipe) { const ak = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid; console.warn("yaz toptan-silme engellendi", {app, dizi: wipe.dizi, eski: wipe.eski, yeni: wipe.yeni, uid: dec.uid}); await denetimVer("toptan-silme-engellendi", ak, {app, dizi: wipe.dizi, eski: wipe.eski, yeni: wipe.yeni}); res.status(409).json({hata: "toptan_silme_korumasi", dizi: wipe.dizi, eski: wipe.eski, yeni: wipe.yeni}); return; }
    // Yetkisiz silme: yazım yapılmadı. 403 → istemci token'ı tazeleyip bir kez yeniden dener (bayat claim kurtarılır).
    // Denetime yazılır ama Telegram uyarısı GÖNDERİLMEZ: bayat token'lı meşru kullanıcı ilk denemede buraya düşebilir → yanlış alarm olmasın.
    // FİYAT KAPISI: yazım UYGULANDI ama fiyat/tarife alanları sunucudaki hâliyle korundu.
    // Sessiz kalmaz: sahibi kimin denediğini görsün diye denetime yazılır (Telegram'a taşınmaz — gürültü).
    if (fiyatKorundu) {
      const ak = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
      try { await denetimVer("fiyat-degisimi-engellendi", ak, {app, urun: fiyatKorundu.urun, tarife: fiyatKorundu.tarife}); } catch (e) {}
    }
    // SEVK KİLİDİ: yazım yapılmadı. Arayüz bunu zaten engelliyor; buraya yalnız kilidi atlatan istek düşer.
    if (sevkKilidi) {
      const ak = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
      console.warn("yaz sevk sonrası içerik değişimi engellendi", {app, uid: dec.uid, adet: sevkKilidi.length});
      try { await denetimVer("sevk-kilidi-engellendi", ak, {app, siparisler: sevkKilidi.slice(0, 10)}); } catch (e) {}
      res.status(403).json({hata: "sevk_sonrasi_kilit", siparisler: sevkKilidi.slice(0, 5)}); return;
    }
    if (yetkisizSilme) {
      const ak = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
      console.warn("yaz yetkisiz silme engellendi", {app, uid: dec.uid, adet: silinen ? silinen.length : 0, musteri: silinenMusteri ? silinenMusteri.length : 0});
      try { await denetimVer("silme-engellendi", ak, {app, adet: silinen ? silinen.length : 0, siparisler: (silinen || []).slice(0, 10), musteriler: (silinenMusteri || []).slice(0, 10)}); } catch (e) {}
      res.status(403).json({hata: "silme_yetkiniz_yok"}); return;
    }
    // SİPARİŞ SİLME BİLDİRİMİ — yalnız transaction GERÇEKTEN işlendiyse (wipe'ta yukarıda return edildi).
    // KRİTİK: veri bu noktada ZATEN commit oldu. Bildirim yanıtı BLOKLAMAMALI — Telegram yavaşlarsa
    // kullanıcı "kaydedilemedi" görür ve (sıfırlama akışında) veriyi duruyor sanıp yedekten geri yükler.
    // Bu yüzden en fazla BILDIRIM_TAVAN beklenir, sonra yanıt verilir; bildirim arka planda sürer.
    const BILDIRIM_TAVAN2 = 5000;   // TÜM bildirimlerin ORTAK tavanı — blok DIŞINDA tanımlı olmalı (aşağıda kullanılıyor)
    const bekleyenBildirim = [];
    if (silinen && silinen.length) {
      const bildirim = (async () => {
        const uname = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
        const kim = String((await portalAd(uname)) || uname).replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);   // ad da kullanıcı verisi: satır sonu temizlenir
        const modAd = app === "siparis" ? "Sipariş Takip (TMR)" : "Yem Sipariş";
        await denetimVer("siparis-silindi", uname, {app, adet: silinen.length, siparisler: silinen.slice(0, 20)});
        // BİLDİRİM SELİ FRENİ: denetim kaydı HER ZAMAN tutulur, yalnız Telegram mesajı kısılır.
        // Sil/geri-ekle döngüsüyle güvenlik grubunu boğup gerçek uyarıyı gözden kaçırtmayı engeller (uyarı yorgunluğu).
        const mesajHakki = await rateLimit("yazsil:" + dec.uid, 6, 60);
        const token = tgToken(), chat = tgChat();
        if (token && chat && mesajHakki) {
          const tl = (n) => (typeof n === "number" ? n.toLocaleString("tr-TR", {maximumFractionDigits: 0}) + " TL" : "");
          const satir = silinen.slice(0, 10).map((s) =>
            "• #" + s.no + " · " + s.ad + (s.tutar != null ? " · " + tl(s.tutar) : "") + (s.tarih ? " · " + s.tarih : "")).join("\n");
          const fazla = silinen.length > 10 ? "\n… ve " + (silinen.length - 10) + " sipariş daha" : "";
          const govde = "🔔 SİPARİŞ SİLİNDİ — " + modAd + "\nSilen: " + kim + "\nAdet: " + silinen.length + "\n\n" + satir + fazla +
            "\n\n(Bu işlem geri alınamaz. Bu silmeyi siz yapmadıysanız kontrol edin.)";
          await tg(token, "sendMessage", {chat_id: chat, text: govde.slice(0, 3900)});   // Telegram 4096 sınırı
        }
      })().catch((e) => console.error("silme bildirimi", e));   // .catch ŞART: yarışı kaybederse unhandled rejection olmasın
      bekleyenBildirim.push(bildirim);   // TEK tavanda beklenir (aşağıda) — iki blok ardışık beklenirse gecikme 2 katına çıkar
    }
    // ===== İÇERİK DEĞİŞİKLİĞİ / İPTAL BİLDİRİMİ =====
    // ONAY İPTALİ (Firestore, iç servis, hızlı) BEKLENİR — güvenlik açısından belirleyici olan bu.
    // TELEGRAM (dış servis) tavanlı arka planda — yazma yolunu ASLA bloklamaz (silme bildirimi dersi).
    if ((degisen && degisen.length) || (iptalEdilen && iptalEdilen.length)) {
      const mod = app === "siparis" ? "t" : "y";
      const modAd = app === "siparis" ? "Sipariş Takip (TMR)" : "Yem Sipariş";
      const uname = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
      // 1) ONAYLARI DÜŞÜR — yalnız-sunucu-yazılır belgelerden sil (istemci bunları yazamaz).
      // İPTAL EDİLENLER DE DAHİL: iptalli sipariş geri açılırsa eski onayla üretime dönmesin.
      // FAIL-OPEN KAPALI: hata yutulmaz — bir kez yeniden denenir, yine olmazsa denetime yazılır ve
      // gruba UYARI gider. (Sessiz başarısızlık = düştüğü sanılan onay diri kalır → en tehlikeli hâl.)
      const _dusurulecek = [].concat(degisen || [], iptalEdilen || []).map((d) => d.id).filter(Boolean);
      let onayIptalHatasi = null;
      if (_dusurulecek.length) {
        const sil = {};
        _dusurulecek.forEach((id) => { sil[id] = admin.firestore.FieldValue.delete(); });
        const hedefler = ["apps/muhasebeonay", app === "siparis" ? "apps/fabrikaonay" : "apps/yemonay"];
        const dene = async (yol) => {
          try { await db.doc(yol).set(sil, {merge: true}); return null; } catch (e1) {
            try { await db.doc(yol).set(sil, {merge: true}); return null; } catch (e2) { return yol + ": " + (e2 && e2.message || e2); }
          }
        };
        // BAĞIMSIZ: biri patlarsa diğeri yine denensin (ardışık await'te ilk hata ikinciyi hiç çalıştırmıyordu).
        const sonuc = await Promise.all(hedefler.map(dene));
        const hatalar = sonuc.filter(Boolean);
        if (hatalar.length) {
          onayIptalHatasi = hatalar.join(" | ");
          console.error("ONAY İPTALİ BAŞARISIZ", {app, uid: dec.uid, idler: _dusurulecek.slice(0, 10), hata: onayIptalHatasi});
        }
      }
      const bildirim2 = (async () => {
        // Ad da KULLANICI VERİSİDİR: satır sonu temizlenir + kırpılır (silme bildirimindeki kuralla aynı).
        const kim = String((await portalAd(uname)) || uname).replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
        if (onayIptalHatasi) {
          await denetimVer("onay-iptali-basarisiz", uname, {app, idler: _dusurulecek.slice(0, 10), hata: String(onayIptalHatasi).slice(0, 300)});
        }
        if (degisen && degisen.length) {
          await denetimVer("siparis-degisti", uname, {app, adet: degisen.length,
            siparisler: degisen.slice(0, 20).map((d) => ({no: d.no, ad: d.ad, fark: d.farklar.slice(0, 6)}))});
        }
        if (iptalEdilen && iptalEdilen.length) {
          await denetimVer("siparis-iptal", uname, {app, adet: iptalEdilen.length, siparisler: iptalEdilen.slice(0, 20)});
        }
        // BİLDİRİM SELİ FRENİ (denetim kaydı her zaman tutulur, yalnız Telegram kısılır)
        const mesajHakki = await rateLimit("yazdeg:" + dec.uid, 20, 60);
        const token = tgToken(), chat = tgChat();
        if (!token || !chat) return;
        // ONAY İPTALİ BAŞARISIZ = en tehlikeli hâl (düştü sanılan onay diri kalır). Hız sınırından MUAF.
        if (onayIptalHatasi) {
          await tg(token, "sendMessage", {chat_id: chat, text: ("‼️ DİKKAT — ONAY DÜŞÜRÜLEMEDİ (" + modAd + ")\n\n" +
            "Şu siparişlerin içeriği değişti ama muhasebe/üretim onay kaydı SİLİNEMEDİ:\n" +
            [].concat(degisen || [], iptalEdilen || []).slice(0, 10).map((d) => "• #" + d.no + " · " + d.ad).join("\n") +
            "\n\nBu siparişler EKRANDA HÂLÂ ONAYLI görünebilir. Üretime vermeden ÖNCE elle doğrulayın.\n(Teknik: " +
            String(onayIptalHatasi).slice(0, 200) + ")").slice(0, 3900)});
        }
        if (!mesajHakki) return;
        // --- İPTAL: bilgi mesajı, onay butonu YOK ---
        for (const c of (iptalEdilen || []).slice(0, 5)) {
          const govde = "🚫 SİPARİŞ İPTAL EDİLDİ — " + modAd +
            "\n\nSipariş: #" + c.no + "\nMüşteri: " + c.ad + "\nİptal eden: " + kim +
            (c.teslim ? "\nTeslim tarihi: " + c.teslim : "") +
            (c.urun ? "\n\nÜrünler: " + c.urun : "") +
            "\n\n(Bu sipariş artık üretim/sevkiyat listesinde YOKTUR.)";
          await tg(token, "sendMessage", {chat_id: chat, text: govde.slice(0, 3900)});
        }
        if (iptalEdilen && iptalEdilen.length > 5) {
          await tg(token, "sendMessage", {chat_id: chat, text: "🚫 " + iptalEdilen.length + " sipariş iptal edildi — " + modAd + "\nİptal eden: " + kim + "\n(İlk 5'i yukarıda ayrı ayrı bildirildi.)"});
        }
        // --- DEĞİŞİKLİK: fark dökümü + YENİDEN muhasebe onay butonu ---
        // 5'ten fazlaysa tek özet (toplu düzenleme/aktarım) → grup boğulmasın.
        if (degisen && degisen.length > 5) {
          const ozet = degisen.slice(0, 15).map((d) => "• #" + d.no + " · " + d.ad + " (" + d.farklar.length + " değişiklik)").join("\n");
          // KARIŞIK GRUP: bilgi hattı + onaylı hat aynı kaydetmede olabilir → kuyruk notu yalnız
          // onay isteyen sipariş VARSA yazılır, yoksa "yeniden gönderin" yanıltıcı olurdu.
          const onayliVar = degisen.some((d) => !d.bilgi);
          await tg(token, "sendMessage", {chat_id: chat, text: ("⚠️ " + degisen.length + " SİPARİŞ DEĞİŞTİRİLDİ — " + modAd +
            "\nDeğiştiren: " + kim + "\n\n" + ozet + (degisen.length > 15 ? "\n… ve " + (degisen.length - 15) + " sipariş daha" : "") +
            (onayliVar ? "\n\nOnay isteyen siparişlerin muhasebe onayı DÜŞTÜ — sipariş ekranından tek tek yeniden gönderin." :
              "\n\n(Bilgi amaçlıdır — bu siparişler onaya sunulmaz.)")).slice(0, 3900)});
        } else {
          for (const d of (degisen || [])) {
            // BİLGİ HATTI (yem, portal dışı): onay istenmiyor → başlık, kapanış ve buton farklı.
            const govde = (d.bilgi ? "✏️ SİPARİŞ DEĞİŞTİRİLDİ (bilgi)\n" : "⚠️ SİPARİŞ DEĞİŞTİRİLDİ — YENİDEN MUHASEBE ONAYI GEREKİYOR\n") + modAd +
              "\n\nSipariş: #" + d.no + "\nMüşteri: " + d.ad + "\nDeğiştiren: " + kim +
              (d.teslim ? "\nTeslim: " + d.teslim : "") +
              "\n\nYAPILAN DEĞİŞİKLİKLER:\n" + d.farklar.slice(0, 12).join("\n") +
              (d.farklar.length > 12 ? "\n… ve " + (d.farklar.length - 12) + " değişiklik daha" : "") +
              "\n\nSİPARİŞİN SON HÂLİ:\n" + (d.urun.length ? d.urun.map((u) => "• " + u).join("\n") : "• (ürün yok)") +
              (d.bilgi ? "\n\n(Bilgi amaçlıdır — onay gerekmez, sipariş akışı durmaz.)" :
                (d.onayliydi ? "\n\n❗ Bu sipariş DAHA ÖNCE ONAYLANMIŞTI — onay düşürüldü, yeniden onaylayın." :
                  "\n\n(Sipariş henüz onaylanmamıştı; güncel içerik yukarıdadır.)"));
            const gonder = {chat_id: chat, text: govde.slice(0, 3900)};
            if (!d.bilgi) gonder.reply_markup = {inline_keyboard: [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:" + mod + ":" + d.id + ":" + d.imzaH}]]};
            await tg(token, "sendMessage", gonder);
          }
        }
      })().catch((e) => console.error("değişiklik bildirimi", e));
      bekleyenBildirim.push(bildirim2);
    }
    // TEK TAVAN: tüm bildirimler birlikte en fazla BILDIRIM_TAVAN2 beklenir; sonra yanıt verilir,
    // gönderimler arka planda sürer. (Ardışık beklenirse gecikme katlanır → "kaydedilemedi" algısı.)
    if (bekleyenBildirim.length) {
      await Promise.race([Promise.all(bekleyenBildirim), new Promise((r) => setTimeout(r, BILDIRIM_TAVAN2))]);
    }
    res.json({ok: true});
  } catch (e) {
    console.error("yaz", e);
    res.status(500).json({hata: "yazılamadı"});
  }
});

// ============================================================
// TMR AYLIK TONAJ RAPORU — hafta içi her gün 10:00, YÖNETİM grubuna (Rota Rapor)
// Raporlar → Tonaj & Hedef ekranındaki "Aylık Tonaj" sayısını BİREBİR üretir.
// ------------------------------------------------------------
const AYLAR_TR_FN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_TR_FN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
// İSTEMCİYLE BİREBİR: pkg alanındaki "kg" sayısı; yoksa 25 (siparis-takip prodKg ile AYNI — sayı tutmalı).
function prodKgOf(products, code) {
  const p = (products || []).find((x) => x && x.code === code);
  const m = /([\d.,]+)\s*kg/i.exec((p && p.pkg) || "");
  const kg = m ? parseFloat(m[1].replace(",", ".")) : 25;
  return kg > 0 ? kg : 25;
}
const fmtTonFN = (t) => (+t || 0).toLocaleString("tr-TR", {minimumFractionDigits: 1, maximumFractionDigits: 1});
const escHTML = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Aylık tonajı ve kırılımı hesapla. now = İstanbul saatiyle Date. Ekran tonajData() ile aynı küme:
// o ayki FİİLEN ÇIKAN siparişler (sevk + teslim; bayi dahil); her satır qty × prodKg / 1000.
// Beklemede/onaylandı sipariş SAYILMAZ — bkz. cikanSiparisFN. Kural değişirse ekran da değişmeli.
function tmrTonajHesap(DB, now) {
  const Y = now.getFullYear(), M = String(now.getMonth() + 1).padStart(2, "0");
  const curYM = Y + "-" + M;
  const orders = (DB.orders || []).filter((o) => satisMiFN(o) && satisTarihiFN(o).slice(0, 7) === curYM);
  // İSTEMCİ tonajData() İLE BİREBİR: kodu olan HER satır sayılır (0 ton olsa da gün/ürün oluşur);
  // aktifGun = kodu olan satırı bulunan farklı gün sayısı. Aksi halde ekrandaki "18 satış günü" tutmaz.
  const prodTot = {}, gunler = {};
  let toplam = 0, siparis = 0;
  orders.forEach((o) => {
    let coded = false;
    (o.lines || []).forEach((l) => {
      if (!l || !l.code) return;
      const t = (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000;
      prodTot[l.code] = (prodTot[l.code] || 0) + t;
      toplam += t;
      coded = true;
    });
    if (coded) { gunler[satisTarihiFN(o).slice(8, 10)] = true; siparis++; }   // gün = FİİLEN teslim günü
  });
  const aktifGun = Object.keys(gunler).length;
  // BEKLEYEN: alınmış ama henüz çıkmamış mal. Rapor yalnız sevk edileni sayar (firma kararı 31.07) —
  // bu satır olmadan ayın başında "0,0 t · 0 sipariş" görünüyor ve bekleyen siparişler yönetimden
  // TAMAMEN gizleniyor. 04.08.2026 sabahı tam bu oldu: 4 sipariş vardı, rapor sıfır dedi.
  // prodTotAy: ürün kırılımının AY TOPLAMI tabanı (sevk + bekleyen). Kırılım yalnız sevk'ten
  // beslenirse ayın başında bomboş çıkar ve bekleyen 41 t ürün mesajda hiç görünmez (04.08 vakası).
  let bekTon = 0, bekAdet = 0;
  const prodTotAy = Object.assign({}, prodTot);
  (DB.orders || []).forEach((o) => {
    if (!o || o.status === "iptal" || satisMiFN(o)) return;
    if (String(o.teslimTarihi || o.date || "").slice(0, 7) !== curYM) return;   // bekleyen = PLANLANAN teslim ayı
    let coded = false;
    (o.lines || []).forEach((l) => {
      if (!l || !l.code) return;
      const t = (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000;
      bekTon += t;
      prodTotAy[l.code] = (prodTotAy[l.code] || 0) + t;
      coded = true;
    });
    if (coded) bekAdet++;
  });
  const hedef = (DB.meta && DB.meta.tonajHedef && +DB.meta.tonajHedef[curYM]) || 0;
  return {Y, M, curYM, toplam, aktifGun, siparis, prodTot, prodTotAy, hedef, bekTon, bekAdet};
}
// Telegram HTML mesajı — dikkat çekici başlık + hizalı <pre> tablolar.
function tmrTonajMesaj(D, now) {
  const trTarih = String(now.getDate()).padStart(2, "0") + "." + String(now.getMonth() + 1).padStart(2, "0") + "." + now.getFullYear();
  const gunAd = GUN_TR_FN[now.getDay()];
  const gunlukOrt = D.aktifGun ? D.toplam / D.aktifGun : 0;
  // özet tablosu (etiket sola, değer sağa hizalı — monospace <pre>)
  const sat = (lbl, val) => lbl.padEnd(17, " ") + String(val).padStart(11, " ");
  // SIRA FİRMA TARAFINDAN BELİRLENDİ (04.08.2026) — değiştirme:
  // 1 sevk edilen · 2 bekleyen · 3 toplam sipariş (sevk+bekleyen) · 4 satış günü · 5 günlük ort.
  // Beş satır HER ZAMAN yazılır (bekleyen 0 olsa da) — sabit biçim, gözle kıyas kolay olsun.
  const ozet = [
    sat("Teslim Edilen", fmtTonFN(D.toplam) + " t"),
    sat("Bekleyen", fmtTonFN(D.bekTon) + " t"),
    sat("Toplam Sipariş", (D.siparis + D.bekAdet) + " adet"),
    sat("Satış Günü", D.aktifGun + " gün"),
    sat("Günlük Ort.", fmtTonFN(gunlukOrt) + " t"),
  ].join("\n");
  let hedefBlok = "";
  if (D.hedef > 0) {
    const yuzde = D.toplam / D.hedef * 100;
    const kalan = Math.max(0, D.hedef - D.toplam);
    const dolu = Math.max(0, Math.min(10, Math.round(yuzde / 10)));
    const bar = "█".repeat(dolu) + "░".repeat(10 - dolu);
    const hedefTablo = [
      sat("Hedef", fmtTonFN(D.hedef) + " t"),
      sat("Gerçekleşen", "%" + yuzde.toLocaleString("tr-TR", {maximumFractionDigits: 1})),
      sat("Kalan", fmtTonFN(kalan) + " t"),
      bar,
    ].join("\n");
    hedefBlok = "\n🎯 <b>Hedef</b>\n<pre>" + escHTML(hedefTablo) + "</pre>";
  }
  // ürün kırılımı: en yüksek 6 ürün + kalanı "Diğer" (0,0 t görünen ürünler gizlenir — kozmetik)
  // Taban AY TOPLAMI (sevk + bekleyen): yalnız sevk'ten beslenirse ay başında bomboş çıkar
  // ve bekleyen siparişlerin ürünleri mesajda hiç görünmez (04.08 vakası).
  const arr = Object.entries(D.prodTotAy).filter(([, t]) => t >= 0.05).sort((a, b) => b[1] - a[1]);
  const N = 6;
  const gorunen = arr.slice(0, N);
  const kalanlar = arr.slice(N);
  const urunSat = gorunen.map(([code, t]) => escHTML(code).padEnd(16, " ") + (fmtTonFN(t) + " t").padStart(12, " "));
  if (kalanlar.length) {
    const digerTon = kalanlar.reduce((s, e) => s + e[1], 0);
    urunSat.push(("Diğer (" + kalanlar.length + ")").padEnd(16, " ") + (fmtTonFN(digerTon) + " t").padStart(12, " "));
  }
  const urunBlok = urunSat.length ? ("\n📦 <b>Ürün Kırılımı</b> — ay toplamı\n<pre>" + urunSat.join("\n") + "</pre>") : "";
  return "📊 <b>TMR TONAJ RAPORU</b>\n" +
    "🗓 <b>" + AYLAR_TR_FN[+D.M - 1] + " " + D.Y + "</b> · " + trTarih + " " + gunAd + "\n\n" +
    "<pre>" + escHTML(ozet) + "</pre>" +
    hedefBlok +
    urunBlok +
    "\n\n<i>Bekleyen = sipariş alındı, henüz sevk edilmedi. Ürün kırılımı ay toplamıdır (sevk + bekleyen). Hedef takibi teslim edilen üzerinden yürür.</i>" +
    "\n\n<i>Sipariş Yönetimi · TMR · her sabah 10:00</i>";
}
// ---- TARİHSEL SATIŞ ARŞİVİ (istemci siparis-takip/index.html YON_TARIHSEL AYNASI) ----
// Bu arşiv DONMUŞ geçmiştir (kg cinsinden ay→ürün). Firestore'da YOKTUR; geçen-yıl kıyası için
// sunucuya kopyalandı. İKİ KOPYA SAPMASIN: test/odeme.test.js istemcideki ile birebir eşliğini denetler.
// Dönüşüm istemciyle aynı: ton = kg/1000 (qty=kg/prodKg → ton=qty*prodKg/1000 sadeleşir).
const YON_TARIHSEL_FN={"2026-01":{"PG-04":575.0,"BK-PAN":1200.0,"10-35":3200.0,"BK-100":12225.0,"BK-300":69250.0,"RK-20":24550.0,"KY-S1":1600.0,"DG-10":6100.0,"10-40":44475.0,"35-65":2450.0,"BK-300 PLUS":425900.0},"2026-02":{"PG-04":1400.0,"10-35":9200.0,"BK-100":17125.0,"BK-300":51950.0,"RK-20":30850.0,"DG-10":11675.0,"10-40":49150.0,"BK-300 PLUS":456675.0},"2026-03":{"PG-04":1700.0,"Flushing":1175.0,"BK-PAN":800.0,"BK-100":17750.0,"BK-300":97875.0,"RK-20":37850.0,"DG-10":12850.0,"10-40":52600.0,"ÖZEL":25.0,"BK-300 PLUS":457150.0},"2026-04":{"PG-04":1125.0,"Flushing":800.0,"BK-PAN":800.0,"10-35":25075.0,"BK-100":6675.0,"BK-300":48775.0,"RK-20":23175.0,"DG-10":5225.0,"10-40":49675.0,"ÖZEL":1375.0,"BK-300 PLUS":459350.0},"2026-05":{"PG-04":750.0,"BK-PAN":1200.0,"BK-100":7350.0,"BK-300":45400.0,"RK-20":16975.0,"KY-S1":2000.0,"DG-10":6375.0,"10-40":53125.0,"BK-300 PLUS":291675.0},"2026-06":{"PG-04":2525.0,"BK-100":18225.0,"BK-300":67000.0,"RK-20":38450.0,"DG-10":14200.0,"10-40":53825.0,"BK-300 PLUS":298275.0},"2025-01":{"PG-04":1000.0,"Flushing":275.0,"45-55 (eski)":18950.0,"DG-45 (eski)":7250.0,"BK-100":17475.0,"BK-300":155725.0,"RK-20":60700.0,"DG-10":12100.0,"10-40":19100.0,"35-65":13925.0,"BK-300 PLUS":475075.0},"2025-02":{"PG-04":1500.0,"Flushing":250.0,"45-55 (eski)":11450.0,"DG-45 (eski)":3225.0,"BK-100":8200.0,"BK-300":106100.0,"RK-20":41725.0,"KY-S1":750.0,"DG-10":4500.0,"10-40":36750.0,"35-65":9475.0,"BK-300 PLUS":495050.0},"2025-03":{"PG-04":1475.0,"Flushing":250.0,"45-55 (eski)":10425.0,"DG-45 (eski)":4000.0,"BK-100":10650.0,"BK-300":93125.0,"RK-20":47075.0,"KY-S1":750.0,"DG-10":9250.0,"10-40":31250.0,"35-65":5475.0,"BK-300 PLUS":390225.0},"2025-04":{"PG-04":1025.0,"Flushing":400.0,"45-55 (eski)":5025.0,"BK-100":20025.0,"BK-300":73250.0,"RK-20":52500.0,"DG-10":12050.0,"10-40":27625.0,"35-65":7500.0,"BK-300 PLUS":377900.0},"2025-05":{"PG-04":725.0,"Flushing":500.0,"45-55 (eski)":5000.0,"BK-100":13425.0,"BK-300":76775.0,"RK-20":25225.0,"DG-10":5475.0,"10-40":28900.0,"35-65":3000.0,"BK-300 PLUS":434425.0},"2025-06":{"PG-04":250.0,"BK-100":11625.0,"BK-300":67925.0,"RK-20":32150.0,"KY-S1":500.0,"DG-10":2550.0,"10-40":33425.0,"35-65":2500.0,"BK-300 PLUS":279325.0},"2025-07":{"PG-04":275.0,"BK-100":8550.0,"BK-300":48650.0,"RK-20":16275.0,"DG-10":7100.0,"10-40":23800.0,"ÖZEL":562.276,"35-65":1450.0,"BK-300 PLUS":222625.0},"2025-08":{"PG-04":250.0,"10-35":800.0,"BK-100":12250.0,"BK-300":77200.0,"RK-20":37575.0,"DG-10":4125.0,"10-40":35000.0,"BK-300 PLUS":301175.0},"2025-09":{"PG-04":2700.0,"BK-100":7600.0,"BK-300":68125.0,"RK-20":32650.0,"KY-S1":400.0,"DG-10":6600.0,"10-40":37325.0,"35-65":3000.0,"BK-300 PLUS":283325.0},"2025-10":{"PG-04":1850.0,"10-35":8425.0,"BK-100":12900.0,"BK-300":58650.0,"RK-20":47625.0,"KY-S1":925.0,"DG-10":5700.0,"10-40":55200.0,"BK-300 PLUS":301525.0},"2025-11":{"PG-04":525.0,"BK-100":20300.0,"BK-300":34800.0,"RK-20":15550.0,"KY-S1":625.0,"DG-10":2000.0,"10-40":29400.0,"35-65":2475.0,"BK-300 PLUS":344325.0},"2025-12":{"PG-04":2425.0,"10-35":7200.0,"BK-100":19775.0,"BK-300":62050.0,"RK-20":39800.0,"KY-S1":2400.0,"DG-10":16825.0,"10-40":58425.0,"BK-300 PLUS":508100.0}};
const YON_TARIHSEL_SON_FN='2026-06';   // bu ay DAHİL tarihsel; sonrası canlı sipariş verisi

// ---- YÖNETİCİ HAFTALIK ÖZETİ (yalnız Cuma) ----
const GUN_KISA_FN = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const isoTarih = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// Bu hafta (Pazartesi → bugün) ve önceki hafta (aynı gün sayısı) tonaj/sipariş + kırılımlar.
// CİRO GÖSTERİLMEZ (firma kararı): yönetim raporları YALNIZ TONAJ üzerinden okunur.
function haftaOzetHesap(DB, now) {
  const pzt = (now.getDay() + 6) % 7;                       // Pzt=0 ... Cum=4 ... Paz=6
  const bas = new Date(now); bas.setDate(now.getDate() - pzt);
  const son = new Date(now);
  const oncekiBas = new Date(bas); oncekiBas.setDate(bas.getDate() - 7);
  const oncekiSon = new Date(son); oncekiSon.setDate(son.getDate() - 7);
  const isoBas = isoTarih(bas), isoSon = isoTarih(son), oisoBas = isoTarih(oncekiBas), oisoSon = isoTarih(oncekiSon);
  const topla = (a, b) => {
    const list = (DB.orders || []).filter((o) => satisMiFN(o) && satisTarihiFN(o) >= a && satisTarihiFN(o) <= b);   // taban: fiilen TESLİM edilen
    let ton = 0; const gunler = {}, custTon = {}, prodTon = {};
    let siparis = 0;
    list.forEach((o) => {
      let coded = false, oTon = 0;
      (o.lines || []).forEach((l) => {
        if (!l || !l.code) return;
        const t = (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000;
        prodTon[l.code] = (prodTon[l.code] || 0) + t;
        ton += t; oTon += t; coded = true;
      });
      if (!coded) return;
      siparis++;
      gunler[satisTarihiFN(o)] = (gunler[satisTarihiFN(o)] || 0) + oTon;   // gün = FİİLEN teslim günü
      const ad = o.customer || o.aliciMusteri || "—";
      custTon[ad] = (custTon[ad] || 0) + oTon;
    });
    return {ton, siparis, aktifGun: Object.keys(gunler).length, gunler, custTon, prodTon};
  };
  const bu = topla(isoBas, isoSon);
  const onceki = topla(oisoBas, oisoSon);
  return {bas, son, isoBas, isoSon, pzt, bu, onceki};
}
// Yüzde değişim oku (▲/▼) — önceki 0 ise "yeni".
function trendEt(bu, onceki) {
  if (!(onceki > 0)) return bu > 0 ? "🆕 yeni" : "—";
  const p = (bu - onceki) / onceki * 100;
  const ok = p > 0.05 ? "▲" : (p < -0.05 ? "▼" : "▬");
  return ok + " %" + Math.abs(p).toLocaleString("tr-TR", {maximumFractionDigits: 1});
}
function haftaOzetMesaj(Dmonth, H, now) {
  const bu = H.bu, onceki = H.onceki;
  const trTarih = (d) => String(d.getDate()).padStart(2, "0") + " " + AYLAR_TR_FN[d.getMonth()];
  const gunlukOrt = bu.aktifGun ? bu.ton / bu.aktifGun : 0;
  const sat = (lbl, val) => lbl.padEnd(15, " ") + String(val).padStart(13, " ");
  // özet + trend
  const ozet = [
    sat("Teslim edilen", fmtTonFN(bu.ton) + " t"),
    sat("  geçen hafta", fmtTonFN(onceki.ton) + " t"),
    sat("  değişim", trendEt(bu.ton, onceki.ton)),
    "",
    sat("Sipariş", bu.siparis + " adet"),
    sat("Satış günü", bu.aktifGun + " gün"),
    sat("Günlük ort.", fmtTonFN(gunlukOrt) + " t"),
  ].join("\n");
  // günlük dağılım (Pzt → bugün)
  const gunSat = [];
  for (let i = 0; i <= H.pzt; i++) {
    const d = new Date(H.bas); d.setDate(H.bas.getDate() + i);
    const t = bu.gunler[isoTarih(d)] || 0;
    gunSat.push((GUN_KISA_FN[d.getDay()] + " " + String(d.getDate()).padStart(2, "0")).padEnd(10, " ") + (fmtTonFN(t) + " t").padStart(11, " "));
  }
  const gunBlok = "\n📅 <b>Günlük Dağılım</b>\n<pre>" + escHTML(gunSat.join("\n")) + "</pre>";
  // en çok alan müşteriler (ilk 5)
  const custArr = Object.entries(bu.custTon).filter(([, t]) => t >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const custSat = custArr.map(([ad, t], i) => ((i + 1) + ". " + ad).slice(0, 22).padEnd(23, " ") + (fmtTonFN(t) + " t").padStart(10, " "));
  const custBlok = custSat.length ? ("\n🏆 <b>En Çok Alan Müşteriler</b>\n<pre>" + escHTML(custSat.join("\n")) + "</pre>") : "";
  // en çok satan ürünler (ilk 5)
  const prodArr = Object.entries(bu.prodTon).filter(([, t]) => t >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const prodSat = prodArr.map(([code, t]) => escHTML(code).slice(0, 16).padEnd(17, " ") + (fmtTonFN(t) + " t").padStart(11, " "));
  const prodBlok = prodSat.length ? ("\n📦 <b>En Çok Satan Ürünler</b>\n<pre>" + prodSat.join("\n") + "</pre>") : "";
  // ay sonu projeksiyon (takvim-günü temposu)
  const daysInM = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfM = now.getDate();
  const proj = dayOfM ? (Dmonth.toplam / dayOfM * daysInM) : Dmonth.toplam;
  // Projeksiyon SEVK EDİLEN üzerinden kurulur; bekleyen ayrı satırda gösterilir ki
  // "ay içi 0 t" görünürken bekleyen 14 t sipariş olduğu yönetimden gizlenmesin.
  let projSat = sat("Ay içi teslim", fmtTonFN(Dmonth.toplam) + " t") + "\n" + sat("Tahmini kapanış", fmtTonFN(proj) + " t");
  if (Dmonth.bekAdet > 0) projSat += "\n" + sat("Bekleyen", fmtTonFN(Dmonth.bekTon) + " t (" + Dmonth.bekAdet + " sipariş)");
  projSat += "\n" + sat("Ay toplamı", fmtTonFN(Dmonth.toplam + Dmonth.bekTon) + " t");   // sevk + bekleyen
  if (Dmonth.hedef > 0) {
    const projYuzde = Dmonth.hedef > 0 ? proj / Dmonth.hedef * 100 : 0;
    projSat += "\n" + sat("Hedef", fmtTonFN(Dmonth.hedef) + " t") + "\n" + sat("Tahmini/Hedef", "%" + projYuzde.toLocaleString("tr-TR", {maximumFractionDigits: 1}));
  }
  const projBlok = "\n📈 <b>Ay Sonu Projeksiyon</b>\n<pre>" + escHTML(projSat) + "</pre>";
  return "🗂 <b>YÖNETİCİ HAFTALIK ÖZETİ</b>\n" +
    "📆 " + trTarih(H.bas) + " – " + trTarih(H.son) + " (bu hafta)\n\n" +
    "<pre>" + escHTML(ozet) + "</pre>" +
    gunBlok + custBlok + prodBlok + projBlok +
    "\n\n<i>Sipariş Yönetimi · TMR · haftalık — her Cuma 10:00</i>";
}

// ---- AYLIK RAPOR (her ayın 1'i, ÖNCEKİ ay) ----
// HERHANGİ bir ayın TONAJI — istemci raporOrders() ile aynı sınır: ay > YON_TARIHSEL_SON ise CANLI
// siparişler, değilse TARİHSEL arşiv (kg/1000). Geçen-yıl kıyası bu fonksiyonla yapılır.
// TONAJ TABANI — siteyle AYNI kural (siparis-takip/index.html · tonajCikti).
// Yalnız fabrikadan fiilen çıkan mal sayılır: sevk + teslim. Beklemede/onaylandı sayılmaz.
// Tarihsel arşiv zaten fiilen satılan malı taşır → canlı ayları da aynı ölçüye getirir,
// yoksa geçmiş "satılan", bugün "sipariş alınan" olur ve yıllık kıyas sahte artış gösterir.
// Bu kural DEĞİŞİRSE site tarafı da değişmeli — iki rapor birbirini tutmalı.
// ══ SATIŞ KURALI (firma kararı 07.08.2026) — istemciyle BİREBİR (siparis-takip: satisMi/satisTarihi)
// Teslim edilmeyen hiçbir sipariş satış değildir: tonaj, ciro, danışman payı, günlük/haftalık/aylık
// raporların HEPSİ yalnız status==='teslim' olanı sayar. 'sevk' sayılmaz — mal yolda.
// TARİH: fiilen teslim edildiği gün. Eski kayıtta alan yoksa teslimTarihi → date sırasıyla düşülür
// (yalnız OKUMA yolu; hiçbir kayıt güncellenmez, göç yok).
// İKİ TARAF AYRIŞMAMALI: test/odeme.test.js bölüm 29 eşliği denetler.
function satisMiFN(o) {
  return !!o && o.status === "teslim";
}
function satisTarihiFN(o) {
  return satisMiFN(o) ? String(o.teslimEdildiTarih || o.teslimTarihi || o.date || "") : "";
}
function cikanSiparisFN(o) {
  return satisMiFN(o);   // ESKİ AD — kalan çağrılar satış kuralına düşer
}
function ayTonajOf(DB, ym) {
  if (ym > YON_TARIHSEL_SON_FN) {
    let ton = 0;
    (DB.orders || []).forEach((o) => {
      if (!satisMiFN(o) || satisTarihiFN(o).slice(0, 7) !== ym) return;
      (o.lines || []).forEach((l) => { if (l && l.code) ton += (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000; });
    });
    return ton;
  }
  const m = YON_TARIHSEL_FN[ym];
  if (!m) return null;                       // o ay için veri YOK (kıyas gösterilmez)
  return Object.keys(m).reduce((s, k) => s + (+m[k] || 0), 0) / 1000;
}
// DANIŞMAN BAZLI AYLIK TONAJ. o.danismanId sipariş anında damgalanır — hem doğrudan müşteri
// siparişinde (müşteri kartındaki danışman) hem de BAYİ siparişinde (bayinin bağlı danışmanı).
// Tarihsel arşivde danışman bilgisi YOKTUR → yalnız canlı aylar (> YON_TARIHSEL_SON_FN) hesaplanır;
// arşiv ayı istenirse null döner ve kıyas gösterilmez (Haziran 2026 ve öncesi böyledir).
// Siparişin danışmanı — istemci ordDanisman ile BİREBİR: damga yoksa müşteri/bayi kartına düşülür.
// Excel'den aktarılan siparişlerde damga boş kaldı ve atama sonradan yapıldı; geri düşüş olmazsa
// o siparişlerin tonajı danışman payına HİÇ girmez (ekran ile Telegram ayrışır).
function danismanIdFN(DB, o) {
  if (!o) return "";
  if (o.danismanId) return String(o.danismanId);
  const kl = DB.komisyoncular || [];
  if (o.komisyoncuId) {
    const k = kl.find((x) => x && x.id === o.komisyoncuId);
    if (k && k.type === "danisman") return String(o.komisyoncuId);
  }
  if (o.bayiId) {
    const b = kl.find((x) => x && x.id === o.bayiId);
    return String((b && b.danismanId) || "");
  }
  if (o.customerId) {
    const c = (DB.customers || []).find((x) => x && x.id === o.customerId);
    return String((c && c.danismanId) || "");
  }
  return "";
}
function danismanTonajOf(DB, ym) {
  if (ym <= YON_TARIHSEL_SON_FN) return null;
  const out = {};
  (DB.orders || []).forEach((o) => {
    if (!satisMiFN(o) || satisTarihiFN(o).slice(0, 7) !== ym) return;   // taban: ayTonajOf ile AYNI — pay yüzdeleri tutarlı kalsın
    const did = danismanIdFN(DB, o);
    if (!did) return;                                     // danışmansız sipariş sayılmaz
    let t = 0;
    (Array.isArray(o.lines) ? o.lines : []).forEach((l) => { if (l && l.code) t += (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000; });
    if (t > 0) out[did] = (out[did] || 0) + t;
  });
  return out;
}
function danismanAdi(DB, id) {
  const k = (DB.komisyoncular || []).find((x) => x && x.id === id && x.type === "danisman");
  const ad = (k && k.name) || (DB.komisyoncular || []).reduce((a, x) => (x && x.id === id ? (x.name || a) : a), "");
  return String(ad || "(bilinmeyen danışman)").replace(/[\r\n\t]+/g, " ").trim().slice(0, 22);
}
// Bir önceki ayın tam dökümü (CANLI veri) + geçen yıl aynı ay tonajı + yıl kümülatif kıyası.
// CİRO GÖSTERİLMEZ (firma kararı). Geçen yıl kıyası zaten yalnız tonaj: arşiv ciro/müşteri taşımaz.
function aylikRaporHesap(DB, ym) {
  const [Ys, Ms] = ym.split("-");
  const gecenYilYm = (String(+Ys - 1)) + "-" + Ms;
  const list = (DB.orders || []).filter((o) => satisMiFN(o) && satisTarihiFN(o).slice(0, 7) === ym);   // taban: fiilen TESLİM edilen
  const prodTon = {}, custTon = {}, gunler = {}, haftaTon = {};
  let ton = 0, siparis = 0;
  list.forEach((o) => {
    let coded = false, oTon = 0;
    (o.lines || []).forEach((l) => {
      if (!l || !l.code) return;
      const t = (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000;
      prodTon[l.code] = (prodTon[l.code] || 0) + t;
      ton += t; oTon += t; coded = true;
    });
    if (!coded) return;
    siparis++;
    gunler[satisTarihiFN(o)] = true;   // gün = FİİLEN teslim günü
    custTon[o.customer || o.aliciMusteri || "—"] = (custTon[o.customer || o.aliciMusteri || "—"] || 0) + oTon;
    const gun = +satisTarihiFN(o).slice(8, 10);   // hafta kırılımı da teslim gününe göre
    const hafta = Math.min(4, Math.floor((gun - 1) / 7));   // 5. haftanın kalanı 4. haftaya biner
    haftaTon[hafta] = (haftaTon[hafta] || 0) + oTon;
  });
  // BEKLEYEN: o aya ait olup hâlâ sevk edilmemiş sipariş. Ay kapandıktan sonra bunlar hâlâ duruyorsa
  // ya gerçekten çıkmamıştır ya da durumu güncellenmemiştir — ikisi de yönetimin görmesi gereken bilgi.
  let bekTon = 0, bekAdet = 0;
  const prodTonAy = Object.assign({}, prodTon);   // ürün kırılımının AY TOPLAMI tabanı (sevk + bekleyen)
  (DB.orders || []).forEach((o) => {
    if (!o || o.status === "iptal" || satisMiFN(o)) return;
    if (String(o.teslimTarihi || o.date || "").slice(0, 7) !== ym) return;   // bekleyen = PLANLANAN teslim ayı
    let coded = false;
    (o.lines || []).forEach((l) => {
      if (!l || !l.code) return;
      const t = (+l.qty || 0) * prodKgOf(DB.products, l.code) / 1000;
      bekTon += t;
      prodTonAy[l.code] = (prodTonAy[l.code] || 0) + t;
      coded = true;
    });
    if (coded) bekAdet++;
  });
  // BAŞLIK TONAJI TEK KAYNAK (ayTonajOf): ekran/YTD ile aynı sayıyı verir. Rapor ayı arşive düşerse
  // (sınır ileri taşınırsa) canlı sipariş döngüsü 0 verirdi — o durumda arşiv değeri geçerlidir ve
  // müşteri/ürün kırılımı YOKTUR (arşiv yalnız tonaj taşır) → mesajda kırılım blokları gizlenir.
  const arsivAyi = ym <= YON_TARIHSEL_SON_FN;
  const tonKaynak = ayTonajOf(DB, ym);
  if (arsivAyi && tonKaynak != null) ton = tonKaynak;
  // DANIŞMAN SATIŞLARI: bu ay + BİR ÖNCEKİ ay (kullanıcı kararı: geçen yıl DEĞİL, önceki ay).
  // Önceki ay arşive düşüyorsa (Temmuz raporunda Haziran) kıyas YOKTUR — danismanOnceki null kalır.
  const _oy = new Date(+Ys, +Ms - 1, 1); _oy.setMonth(_oy.getMonth() - 1);
  const oncekiYm = _oy.getFullYear() + "-" + String(_oy.getMonth() + 1).padStart(2, "0");
  const danismanBu = danismanTonajOf(DB, ym) || {};
  const danismanOnceki = danismanTonajOf(DB, oncekiYm);
  const danismanAd = {};
  Object.keys(danismanBu).forEach((id) => { danismanAd[id] = danismanAdi(DB, id); });
  Object.keys(danismanOnceki || {}).forEach((id) => { if (!danismanAd[id]) danismanAd[id] = danismanAdi(DB, id); });
  const gecenYilTon = ayTonajOf(DB, gecenYilYm);
  // Yıl kümülatif: bu yılın Ocak→ym ile geçen yılın Ocak→aynı ay (TONAJ)
  let ytdBu = 0, ytdGecen = 0, ytdGecenTam = true;
  for (let i = 1; i <= +Ms; i++) {
    const mm = String(i).padStart(2, "0");
    ytdBu += (ayTonajOf(DB, Ys + "-" + mm) || 0);
    const g = ayTonajOf(DB, String(+Ys - 1) + "-" + mm);
    if (g == null) ytdGecenTam = false; else ytdGecen += g;
  }
  return {ym, Y: Ys, M: Ms, gecenYilYm, oncekiYm, danismanBu, danismanOnceki, danismanAd,
    ton, siparis, aktifGun: Object.keys(gunler).length,
    prodTon, prodTonAy, custTon, haftaTon, gecenYilTon, ytdBu, ytdGecen, ytdGecenTam, arsivAyi, bekTon, bekAdet,
    hedef: (DB.meta && DB.meta.tonajHedef && +DB.meta.tonajHedef[ym]) || 0};
}
function aylikRaporMesaj(A) {
  const ayAd = AYLAR_TR_FN[+A.M - 1] + " " + A.Y;
  const sat = (lbl, val) => lbl.padEnd(16, " ") + String(val).padStart(13, " ");
  const gunlukOrt = A.aktifGun ? A.ton / A.aktifGun : 0;
  const ozet = (A.arsivAyi ? [
    sat("Tonaj", fmtTonFN(A.ton) + " t"),
    "(arşiv ayı — kırılım kaydı yok)",
  ] : [
    // SIRA FİRMA TARAFINDAN BELİRLENDİ (04.08.2026) — günlük raporla AYNI:
    // sevk · bekleyen · toplam sipariş · satış günü · günlük ort.
    sat("Teslim edilen", fmtTonFN(A.ton) + " t"),
    sat("Bekleyen", fmtTonFN(A.bekTon) + " t"),
    sat("Toplam sipariş", (A.siparis + A.bekAdet) + " adet"),
    sat("Satış günü", A.aktifGun + " gün"),
    sat("Günlük ort.", fmtTonFN(gunlukOrt) + " t"),
  ]).join("\n");
  // GEÇEN YIL KIYASI — yalnız TONAJ (arşivde ciro/müşteri yok)
  let yoyBlok = "";
  if (A.gecenYilTon != null) {
    const fark = A.ton - A.gecenYilTon;
    const yoy = [
      sat(AYLAR_TR_FN[+A.M - 1] + " " + A.Y, fmtTonFN(A.ton) + " t"),
      sat(AYLAR_TR_FN[+A.M - 1] + " " + (+A.Y - 1), fmtTonFN(A.gecenYilTon) + " t"),
      sat("Fark", (fark >= 0 ? "+" : "−") + fmtTonFN(Math.abs(fark)) + " t"),
      sat("Değişim", trendEt(A.ton, A.gecenYilTon)),
    ].join("\n");
    yoyBlok = "\n📊 <b>Geçen Yıl Aynı Ay</b>\n<pre>" + escHTML(yoy) + "</pre>";
  } else {
    yoyBlok = "\n📊 <b>Geçen Yıl Aynı Ay</b>\n<pre>" + escHTML(AYLAR_TR_FN[+A.M - 1] + " " + (+A.Y - 1) + " için kayıt yok") + "</pre>";
  }
  // yıl kümülatif (tonaj)
  let ytdBlok = "";
  if (A.ytdGecenTam && A.ytdGecen > 0) {
    const ytd = [
      sat("Ocak–" + AYLAR_TR_FN[+A.M - 1] + " " + A.Y, fmtTonFN(A.ytdBu) + " t"),
      sat("Ocak–" + AYLAR_TR_FN[+A.M - 1] + " " + (+A.Y - 1), fmtTonFN(A.ytdGecen) + " t"),
      sat("Değişim", trendEt(A.ytdBu, A.ytdGecen)),
    ].join("\n");
    ytdBlok = "\n📈 <b>Yıl Başından Beri</b>\n<pre>" + escHTML(ytd) + "</pre>";
  }
  // hedef
  let hedefBlok = "";
  if (A.hedef > 0) {
    const yuzde = A.ton / A.hedef * 100;
    const dolu = Math.max(0, Math.min(10, Math.round(yuzde / 10)));
    const h = [
      sat("Hedef", fmtTonFN(A.hedef) + " t"),
      sat("Gerçekleşen", "%" + yuzde.toLocaleString("tr-TR", {maximumFractionDigits: 1})),
      sat(yuzde >= 100 ? "Aşım" : "Açık", fmtTonFN(Math.abs(A.hedef - A.ton)) + " t"),
      "█".repeat(dolu) + "░".repeat(10 - dolu),
    ].join("\n");
    hedefBlok = "\n🎯 <b>Hedef</b>\n<pre>" + escHTML(h) + "</pre>";
  }
  // haftalık seyir
  const hSat = [];
  for (let i = 0; i <= 4; i++) {
    if (A.haftaTon[i] == null && i === 4) continue;
    const et = i === 4 ? "29+ gün" : ((i * 7 + 1) + "–" + (i * 7 + 7));
    hSat.push(("Hafta " + (i + 1) + " (" + et + ")").padEnd(20, " ") + (fmtTonFN(A.haftaTon[i] || 0) + " t").padStart(9, " "));
  }
  const haftaBlok = (!A.arsivAyi && hSat.length) ? ("\n🗓 <b>Haftalık Seyir</b>\n<pre>" + escHTML(hSat.join("\n")) + "</pre>") : "";
  // en çok alan müşteriler (ilk 8)
  const custArr = Object.entries(A.custTon).filter(([, t]) => t >= 0.05).sort((a, b) => b[1] - a[1]);
  const custSat = custArr.slice(0, 8).map(([ad, t], i) => ((i + 1) + ". " + ad).slice(0, 24).padEnd(25, " ") + (fmtTonFN(t) + " t").padStart(9, " "));
  const custBlok = (!A.arsivAyi && custSat.length) ? ("\n🏆 <b>En Çok Alan Müşteriler</b>\n<pre>" + escHTML(custSat.join("\n")) +
    (custArr.length > 8 ? escHTML("\n… ve " + (custArr.length - 8) + " müşteri daha") : "") + "</pre>") : "";
  // DANIŞMAN SATIŞLARI — yalnız TONAJ (detay istenmedi) + AY TOPLAMINDAKİ PAY + BİR ÖNCEKİ AY kıyası.
  // PAY PAYDASI = A.ton (ayın TOPLAM tonajı, danışmansız/doğrudan satış DAHİL). Bu yüzden listedeki
  // paylar 100'e ULAŞMAZ; aradaki fark doğrudan satıştır ve blok sonundaki "Danışman toplamı"
  // satırı bunu açıkça gösterir (o satır kesilen 12+ danışmanı da kapsar).
  // Önceki ay arşive düşüyorsa (ilk raporda Haziran) kıyas sütunu yerine açıklama satırı konur.
  let danBlok = "";
  {
    const idler = Object.keys(A.danismanBu || {}).filter((id) => (A.danismanBu[id] || 0) >= 0.05);
    // Bu ay satmayan ama ÖNCEKİ ay satan danışman da görünmeli (düşüş gizlenmesin)
    Object.keys(A.danismanOnceki || {}).forEach((id) => { if (idler.indexOf(id) < 0 && (A.danismanOnceki[id] || 0) >= 0.05) idler.push(id); });
    if (idler.length) {
      idler.sort((a, b) => (A.danismanBu[b] || 0) - (A.danismanBu[a] || 0));
      const kiyasVar = A.danismanOnceki !== null;
      // Ay toplamı 0/eksik ise (veya danışman bu ay satmadıysa) pay yerine "—" — sahte %0,0 gösterme
      // minimumFractionDigits ŞART: yoksa %63,0 → "%63" olur ve sütun hizası bozulur
      const payEt = (t) => (A.ton > 0 && t > 0) ?
        ("%" + (t / A.ton * 100).toLocaleString("tr-TR", {minimumFractionDigits: 1, maximumFractionDigits: 1})) : "—";
      const satirlar = idler.slice(0, 12).map((id) => {
        const bu = A.danismanBu[id] || 0;
        const ad = (A.danismanAd && A.danismanAd[id]) || "(bilinmeyen)";
        const solTaraf = ad.slice(0, 16).padEnd(17, " ") + (fmtTonFN(bu) + " t").padStart(9, " ") + payEt(bu).padStart(7, " ");
        if (!kiyasVar) return solTaraf;
        const onc = A.danismanOnceki[id] || 0;
        return solTaraf + (" " + trendEt(bu, onc)).padStart(9, " ");
      });
      // TOPLAM satırı: listede kesilen (12+) danışmanlar DA dahil — paylar böyle yorumlanabilir
      const danToplam = Object.keys(A.danismanBu || {}).reduce((s, id) => s + (+A.danismanBu[id] || 0), 0);
      const genislik = satirlar.reduce((m, s) => Math.max(m, s.length), 0);
      satirlar.push("─".repeat(Math.max(24, Math.min(46, genislik))));
      satirlar.push("Danışman toplamı".padEnd(17, " ") + (fmtTonFN(danToplam) + " t").padStart(9, " ") + payEt(danToplam).padStart(7, " "));
      let bas = "\n🧑‍💼 <b>Danışman Satışları</b>";
      bas += kiyasVar ? " <i>(toplamdaki pay · önceki ay kıyası)</i>" : " <i>(toplamdaki pay)</i>";
      danBlok = bas + "\n<pre>" + escHTML(satirlar.join("\n")) + "</pre>";
      if (!kiyasVar) danBlok += "\n<i>Önceki ay (" + A.oncekiYm + ") arşiv dönemi — danışman kaydı yok, kıyas verilemedi.</i>";
      else if (idler.length > 12) danBlok += "\n<i>… ve " + (idler.length - 12) + " danışman daha (toplam satırına dahildir)</i>";
    }
  }
  // ürün kırılımı (ilk 8) — YoY YOK (firma kararı: geçen yıl kıyası yalnız toplam tonaj)
  const prodArr = Object.entries(A.prodTonAy || A.prodTon).filter(([, t]) => t >= 0.05).sort((a, b) => b[1] - a[1]);   // ay toplamı (sevk + bekleyen)
  const prodSat = prodArr.slice(0, 8).map(([code, t]) => {
    const pay = A.ton > 0 ? (t / A.ton * 100) : 0;
    return escHTML(code).slice(0, 15).padEnd(16, " ") + (fmtTonFN(t) + " t").padStart(10, " ") +
      ("%" + pay.toLocaleString("tr-TR", {maximumFractionDigits: 1})).padStart(8, " ");
  });
  const prodBlok = (!A.arsivAyi && prodSat.length) ? ("\n📦 <b>Ürün Kırılımı</b> — ay toplamı\n<pre>" + prodSat.join("\n") + "</pre>") : "";
  return "📋 <b>AYLIK RAPOR — " + ayAd.toUpperCase() + "</b>\n" +
    "🏭 Sipariş Yönetimi · TMR\n\n" +
    "<pre>" + escHTML(ozet) + "</pre>" +
    yoyBlok + ytdBlok + hedefBlok + haftaBlok + danBlok + custBlok + prodBlok +
    "\n\n<i>Ay kapanış raporu · geçen yıl kıyası tonaj bazlıdır</i>";
}
exports.tmrAylikRapor = onSchedule({schedule: "0 10 1 * *", timeZone: "Europe/Istanbul", region: "us-central1", secrets: [TG_TOKEN, TG_CHAT_YONETIM]}, async () => {
  const token = tgToken(), chat = tgChatYonetim();
  if (!token || !chat) { console.log("aylıkRapor: telegram/yönetim secret'i yok"); return; }
  const DB = await loadDB();
  if (!DB) { console.log("aylıkRapor: veri yok"); return; }
  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Istanbul"}));
  // ÖNCEKİ ay: ayın 1'inde çalıştığı için bir gün geri gitmek yeterli ve yıl dönümünde de doğrudur.
  const d = new Date(now); d.setDate(0);
  const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const A = aylikRaporHesap(DB, ym);
  try {
    await tg(token, "sendMessage", {chat_id: chat, text: aylikRaporMesaj(A), parse_mode: "HTML", disable_web_page_preview: true});
    console.log("aylık rapor gönderildi: " + ym + " " + fmtTonFN(A.ton) + " t / geçen yıl " + (A.gecenYilTon == null ? "yok" : fmtTonFN(A.gecenYilTon) + " t"));
  } catch (e) { console.error("aylık rapor gönderim", e); }
});

exports.tmrTonajGunluk = onSchedule({schedule: "0 10 * * 1-5", timeZone: "Europe/Istanbul", region: "us-central1", secrets: [TG_TOKEN, TG_CHAT_YONETIM]}, async () => {
  const token = tgToken(), chat = tgChatYonetim();
  if (!token || !chat) { console.log("tmrTonaj: telegram/yönetim secret'i yok"); return; }
  const DB = await loadDB();
  if (!DB) { console.log("tmrTonaj: veri yok"); return; }
  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Istanbul"}));
  const D = tmrTonajHesap(DB, now);
  try {
    await tg(token, "sendMessage", {chat_id: chat, text: tmrTonajMesaj(D, now), parse_mode: "HTML", disable_web_page_preview: true});
    console.log("tmrTonaj gönderildi: " + D.curYM + " " + fmtTonFN(D.toplam) + " t / " + D.aktifGun + " gün");
  } catch (e) { console.error("tmrTonaj gönderim", e); }
  // CUMA (getDay()===5): günlük rapordan sonra YÖNETİCİ HAFTALIK ÖZETİ de gönderilir.
  if (now.getDay() === 5) {
    try {
      const H = haftaOzetHesap(DB, now);
      await tg(token, "sendMessage", {chat_id: chat, text: haftaOzetMesaj(D, H, now), parse_mode: "HTML", disable_web_page_preview: true});
      console.log("haftalık özet gönderildi: " + H.isoBas + ".." + H.isoSon + " " + fmtTonFN(H.bu.ton) + " t");
    } catch (e) { console.error("haftalık özet gönderim", e); }
  }
});

// ============================================================
// GÜNLÜK TESLİMAT PLANI — her sabah 07:45 (Türkiye saati)
// O gün teslim tarihi olan siparişleri gruba yazar:
// kime, hangi üründen, ne kadar + teslim noktası ve durum.
// ============================================================
exports.gunlukTeslimat = onSchedule({schedule: "45 7 * * *", timeZone: "Europe/Istanbul", region: "us-central1", secrets: [TG_TOKEN, TG_CHAT]}, async () => {
  const DB = await loadDB();
  if (!DB) { console.log("teslimat: veri yok"); return; }
  const token = tgToken(), chat = tgChat();
  if (!token || !chat) { console.log("teslimat: telegram secret'i yok"); return; }

  // Türkiye saatiyle bugün
  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Istanbul"}));
  const iso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][now.getDay()];
  const trTarih = String(now.getDate()).padStart(2, "0") + "." + String(now.getMonth() + 1).padStart(2, "0") + "." + now.getFullYear();
  const fmtQ = (n) => (+n || 0).toLocaleString("tr-TR");

  const KADEME = {fabrika: "Fabrika Teslim", yakin: "Yakın Bayi Satış", uzak: "Uzak Bayi Satış", bayi: "Bayi Satış"};
  const ST = {beklemede: "Beklemede", onay: "Onaylandı", hazir: "Hazır", sevk: "Sevk Edildi"};
  const list = (DB.orders || []).filter((o) => o.teslimTarihi === iso && o.status !== "iptal" && o.status !== "teslim");

  let msg;
  if (!list.length) {
    msg = "GÜNLÜK TESLİMAT PLANI — " + trTarih + " " + GUN + "\n\nBugün teslim edilmesi gereken sipariş bulunmuyor.";
  } else {
    let topCuval = 0;
    const bloklar = list.map((o, i) => {
      const cust = (DB.customers || []).find((c) => c.id === o.customerId);
      const urunler = (o.lines || []).map((l) => {
        topCuval += (+l.qty || 0);
        return "   • " + l.code + ": " + fmtQ(l.qty) + " çuval";
      }).join("\n");
      const satirlar = [
        (i + 1) + ") " + (o.customer || "—") + "  (#" + (o.no || "") + ")",
        urunler || "   • —",
        "   Teslim: " + (KADEME[o.fiyatKademe] || "—") + " · Durum: " + (ST[o.status] || o.status || "—"),
      ];
      if (cust && cust.phone) satirlar.push("   Tel: " + cust.phone);
      if (o.not && String(o.not).trim()) satirlar.push("   Not: " + o.not);
      return satirlar.join("\n");
    }).join("\n\n");
    const ton = (topCuval * 25 / 1000).toLocaleString("tr-TR", {minimumFractionDigits: 1, maximumFractionDigits: 1});
    msg = "GÜNLÜK TESLİMAT PLANI — " + trTarih + " " + GUN + "\n\n" + bloklar +
      "\n\n————————————\nTOPLAM: " + list.length + " sipariş · " + fmtQ(topCuval) + " çuval (" + ton + " ton)";
  }
  await tg(token, "sendMessage", {chat_id: chat, text: msg});
  console.log("teslimat: gönderildi —", list.length, "sipariş");
});

// ============================================================
// GÜNLÜK OTOMATİK YEDEK — her gece 03:00 (Türkiye saati)
// Tüm uygulama verileri tarihli kopyaya alınır; 30 gün saklanır.
// ============================================================
const YEDEK_KAYNAK = ["siparis", "yem", "saha", "ik", "muhasebe", "portal", "muhasebeLog", "muhasebeonay"];
// Faz 3.1: yedeği İKİ konuma al + kendi-doğrula. (1) Firestore yedekler/ (mevcut). (2) GCS 'yedek/' — Firestore
// çökse/silinse/bozulsa bile AYRI depolama sisteminde durur; storage.rules ile istemciye tümüyle KAPALI (Admin SDK yazar/okur).
// Her modül GCS'e yazıldıktan sonra GERİ OKUNUP parse edilir → yedeğin gerçekten okunabilir/bütün olduğu kanıtlanır (bozuksa 'BOZUK').
async function yedekAl() {
  const tarih = new Date().toLocaleDateString("sv-SE", {timeZone: "Europe/Istanbul"}); // YYYY-MM-DD
  const ts = new Date().toISOString();
  let bucket = null; try { bucket = admin.storage().bucket(); } catch (e) { console.error("yedek/bucket", e); }
  const sonuc = [];
  for (const id of YEDEK_KAYNAK) {
    try {
      const s = await db.doc("apps/" + id).get();
      if (!s.exists) { sonuc.push({id, durum: "yok"}); continue; }
      const veri = s.data();
      await db.doc("yedekler/" + tarih + "_" + id).set({...veri, _yedekTs: ts});   // 1) Firestore yedeği
      let durum = "ok-fs";   // en az Firestore yedeği alındı
      if (bucket) {
        const json = JSON.stringify(veri);
        const dosya = bucket.file("yedek/" + tarih + "/" + id + ".json");
        await dosya.save(json, {contentType: "application/json", resumable: false, metadata: {metadata: {yedekTs: ts}}});   // 2) GCS (ikinci konum)
        const [geri] = await dosya.download();   // 3) KENDİ-DOĞRULAMA: geri oku + parse
        try { JSON.parse(geri.toString()); durum = "ok"; } catch (e) { durum = "BOZUK"; }
      }
      sonuc.push({id, durum, kayit: kayitSayisi(veri.data || {})});
    } catch (e) { console.error("yedekAl", id, e); sonuc.push({id, durum: "HATA", hata: String(e.message || e)}); }
  }
  // 30 günden eski yedekleri temizle (hem Firestore hem GCS)
  const sinir = new Date(Date.now() - 30 * 864e5).toLocaleDateString("sv-SE", {timeZone: "Europe/Istanbul"});
  try { const hepsi = await db.collection("yedekler").get(); for (const d of hepsi.docs) { if (d.id.slice(0, 10) < sinir) await d.ref.delete().catch(() => {}); } } catch (e) { console.error("yedek temizle FS", e); }
  if (bucket) { try { const [files] = await bucket.getFiles({prefix: "yedek/"}); for (const f of files) { const g = (f.name.split("/")[1] || ""); if (g && g < sinir) await f.delete().catch(() => {}); } } catch (e) { console.error("yedek temizle GCS", e); } }
  return {tarih, ts, sonuc};
}
exports.gunlukYedek = onSchedule({schedule: "0 3 * * *", timeZone: "Europe/Istanbul", region: "us-central1", secrets: [TG_TOKEN, TG_CHAT]}, async () => {
  const r = await yedekAl();
  console.log("gunlukYedek", JSON.stringify(r.sonuc));
  const bozuk = r.sonuc.filter((x) => x.durum !== "ok" && x.durum !== "ok-fs" && x.durum !== "yok");   // BOZUK/HATA → uyar
  if (bozuk.length) {
    const token = tgToken(), chat = tgChat();
    if (token && chat) { try { await tg(token, "sendMessage", {chat_id: chat, text: "⚠️ YEDEK UYARISI (" + r.tarih + "): sorunlu modüller → " + bozuk.map((b) => b.id + ":" + b.durum).join(", ") + "\nLütfen kontrol edin."}); } catch (e) { /* yut */ } }
  }
});

// ============================================================
// YEDEK YÖNETİMİ (Faz 3.1) — yalnız PORTAL YÖNETİCİSİ. Manuel yedekle · yedek listesi · GERİ YÜKLEME PROVASI · gerçek geri yükleme.
// Prova: yedeği okuyup client-KAPALI 'yedek_prova/' koleksiyonuna geri yazar → okur → doğrular → siler. CANLI VERİYE DOKUNMAZ,
// hiçbir modül sızmaz (yedek_prova firestore.rules catch-all ile kapalı). "Geri yükleme en az bir kez prova edilir" bunu karşılar.
// geri-yukle: gerçek felaket kurtarma — apps/{modul}'ü ezer; onay:true + denetim + Telegram uyarısı zorunlu.
// ============================================================
exports.yedekYonet = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec; try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (dec.portalYonetici !== true) { res.status(403).json({hata: "yalnız portal yöneticisi"}); return; }
    if (!(await rateLimit("yedekYonet:" + dec.uid, 20, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const aktor = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
    const b = req.body || {};
    const islem = String(b.islem || "");
    // yedek okuma: önce GCS (ikinci konum), sonra Firestore yedekler/
    async function yedekOku(tarih, id) {
      try { const bucket = admin.storage().bucket(); const [buf] = await bucket.file("yedek/" + tarih + "/" + id + ".json").download(); return {kaynak: "gcs", veri: JSON.parse(buf.toString())}; } catch (e) { /* GCS yoksa FS */ }
      try { const s = await db.doc("yedekler/" + tarih + "_" + id).get(); if (s.exists) { const d = s.data(); delete d._yedekTs; return {kaynak: "firestore", veri: d}; } } catch (e) { /* yok */ }
      return null;
    }

    if (islem === "yedekle") {
      const r = await yedekAl();
      await denetimVer("yedek-alindi", aktor, {tarih: r.tarih, modul: r.sonuc.length});
      res.json({ok: true, tarih: r.tarih, sonuc: r.sonuc}); return;
    }

    if (islem === "listele") {
      const snap = await db.collection("yedekler").get();
      const gunler = {};
      snap.docs.forEach((d) => { const t = d.id.slice(0, 10), m = d.id.slice(11); (gunler[t] = gunler[t] || []).push(m); });
      const liste = Object.keys(gunler).sort().reverse().map((t) => ({tarih: t, moduller: gunler[t]}));
      res.json({ok: true, liste}); return;
    }

    if (islem === "prova") {
      const tarih = String(b.tarih || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) { res.status(400).json({hata: "tarih gerekli"}); return; }
      const rapor = [];
      for (const id of YEDEK_KAYNAK) {
        const y = await yedekOku(tarih, id);
        if (!y) { rapor.push({id, durum: "yok"}); continue; }
        try {
          const ref = db.doc("yedek_prova/" + id);   // client-KAPALI scratch → round-trip restore provası
          await ref.set(y.veri);
          const geri = await ref.get();
          const asilK = kayitSayisi((y.veri && y.veri.data) || {});
          const okK = kayitSayisi((geri.exists && geri.data() && geri.data().data) || {});
          await ref.delete().catch(() => {});
          rapor.push({id, durum: (geri.exists && okK === asilK) ? "ok" : "UYUŞMUYOR", kayit: asilK, kaynak: y.kaynak});
        } catch (e) { rapor.push({id, durum: "HATA", hata: String(e.message || e)}); }
      }
      await denetimVer("yedek-geri-yukleme-provasi", aktor, {tarih, sonuc: rapor.map((x) => x.id + ":" + x.durum).join(",")});
      res.json({ok: true, tarih, rapor}); return;
    }

    if (islem === "geri-yukle") {
      const tarih = String(b.tarih || ""), modul = String(b.modul || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !YEDEK_KAYNAK.includes(modul)) { res.status(400).json({hata: "tarih/modul geçersiz"}); return; }
      if (b.onay !== true) { res.status(400).json({hata: "onay gerekli"}); return; }
      const y = await yedekOku(tarih, modul);
      if (!y) { res.status(404).json({hata: "yedek bulunamadı"}); return; }
      // Sayım YAZIMDAN ÖNCE: yazımdan sonraki her satır, hata verirse "başarısız" yalanı üretir.
      const kayit = kayitSayisi((y.veri && y.veri.data) || {});
      await db.doc("apps/" + modul).set(y.veri);   // CANLI veriyi ez — yalnız gerçek felaket kurtarma
      // BU NOKTADAN SONRA HİÇBİR HATA 500'E DÖNÜŞEMEZ: veri EZİLDİ, operatör bunu bilmeli.
      // Denetim/Telegram başarısız olsa bile yanıt ok:true'dur; aksaklık `uyari` ile bildirilir.
      let uyari = null;
      try { await denetimVer("yedek-GERI-YUKLENDI", aktor, {tarih, modul, kaynak: y.kaynak, kayit}); } catch (e) {
        console.error("geri-yukle/denetim", e); uyari = "denetim kaydı yazılamadı";
      }
      try {
        const token = tgToken(), chat = tgChat();
        if (token && chat) await tg(token, "sendMessage", {chat_id: chat, text: "♻️ GERİ YÜKLEME: " + aktor + ", '" + modul + "' modülünü " + tarih + " yedeğinden geri yükledi (" + kayit + " kayıt)."});
      } catch (e) { console.error("geri-yukle/telegram", e); uyari = (uyari ? uyari + " · " : "") + "Telegram bildirimi gitmedi"; }
      res.json(Object.assign({ok: true, tarih, modul, kayit}, uyari ? {uyari} : {})); return;
    }

    res.status(400).json({hata: "bilinmeyen işlem"});
  } catch (e) { console.error("yedekYonet", e); res.status(500).json({hata: "sunucu"}); }
});

// ============================================================
// YÖNETİM UCU — kullanıcı & yetki senkronu (yalnız Portal Yöneticisi)
// Çark panelindeki Kaydet buraya gelir: apps/portal şifresiz yazılır,
// Firebase Auth hesapları ve yetki rozetleri (custom claims) eşitlenir.
// ============================================================
const EPOSTA_SON = "@rota-yem.firebaseapp.com";
// AÇILIŞ-BLOKERİ #3 (parola politikası, 11.07.2026): eski sifreDolgu ('.rota' doldurma) desteği
// KALDIRILDI. Yeni/değişen parolalar sunucuda min-8 + harf + rakam ile ZORLANIR (aşağıda yonetim).
// Not: LOGIN tarafındaki sifreDolgu (portal.js:14, portal-auth.js:37) mevcut hesaplarla geriye-uyum
// için OLDUĞU GİBİ kalır (≥8 parolada zaten no-op) — bozulmaz.
const parolaGecerli = (p) => typeof p === "string" && p.length >= 8 &&
  /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p) && /[0-9]/.test(p);
async function portalOku() {
  const s = await db.doc("apps/portal").get();
  const d = s.exists ? s.data().data : null;
  return d && d.rota_portal_v1 ? JSON.parse(d.rota_portal_v1) : null;
}
exports.yonetim = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const dec = await admin.auth().verifyIdToken(idToken);
    const P = await portalOku();
    if (!P) { res.status(500).json({hata: "portal verisi yok"}); return; }
    const me = (P.users || []).find((u) => u.username && (u.username.toLowerCase() + EPOSTA_SON) === (dec.email || ""));
    if (!(dec.portalYonetici === true || (me && me.portalYonetici === true))) {
      res.status(403).json({hata: "yetkisiz"}); return;
    }
    if (!(await rateLimit("yonetim:" + dec.uid, 40, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const aktor = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;   // DENETİM: işlemi yapan yönetici
    const b = req.body || {};
    // Faz 3.3: HESAP DURUMU — Firebase Auth'tan son giriş / oluşturma / disabled. Panelin "atıl hesap" gözden-geçirmesi için.
    if (b.islem === "durum") {
      const out = [];
      let pageToken;
      do {
        const page = await admin.auth().listUsers(1000, pageToken);
        for (const u of page.users) {
          if (!u.email || !u.email.endsWith(EPOSTA_SON)) continue;
          out.push({username: u.email.replace(EPOSTA_SON, ""),
            rol: (u.customClaims && u.customClaims.rol) || "ic",
            disabled: !!u.disabled,
            sonGiris: (u.metadata && u.metadata.lastSignInTime) || "",
            olusturma: (u.metadata && u.metadata.creationTime) || ""});
        }
        pageToken = page.pageToken;
      } while (pageToken);
      res.json({ok: true, hesaplar: out});
      return;
    }
    // ACİL DURUM ŞALTERİ: apps/portal.disKilit bayrağı. true iken bayi/danisman/musteri uçları 503 döner (dış dünya kesilir).
    // Tek atomik yazım; iç personel etkilenmez. Denetime işlenir + Telegram "GÜVENLİK OLAYI" uyarısı gider (DENETIM_UYAR).
    if (b.islem === "diskilit") {
      const kapali = b.kapali === true;
      await db.runTransaction(async (tx) => {
        const ref = db.doc("apps/portal");
        const snp = await tx.get(ref);
        const dd = snp.exists ? (snp.data().data || {}) : {};
        let PP; try { PP = JSON.parse(dd["rota_portal_v1"] || "null") || {}; } catch (e) { PP = {}; }
        PP.disKilit = kapali;
        tx.set(ref, {data: Object.assign({}, dd, {rota_portal_v1: JSON.stringify(PP)}), updatedAt: new Date().toISOString()});
      });
      await denetimVer(kapali ? "dis-erisim-KESILDI" : "dis-erisim-acildi", aktor, {});
      res.json({ok: true, kapali});
      return;
    }
    if (b.islem !== "sync") { res.status(400).json({hata: "bilinmeyen işlem"}); return; }

    // 1) apps/portal — ŞİFRESİZ kullanıcı listesi yazılır (şifre metadata'sı korunur)
    const eskiMap = {};
    (P.users || []).forEach((u) => { if (u && u.id) eskiMap[u.id] = u; });
    const temizUsers = (b.users || []).map((u) => {
      const e = eskiMap[u.id] || {};
      const yeniSifre = b.sifreler && b.sifreler[u.username];
      // Admin geçici şifre atadıysa → kullanıcı ilk girişte KENDİ güçlü şifresini kurmalı (sifreZorunlu=true).
      // Aksi halde mevcut şifre-durumu (tarih + zorunluluk) OLDUĞU GİBİ korunur.
      const zorunlu = (yeniSifre && parolaGecerli(yeniSifre)) ? true : (e.sifreZorunlu === true);
      return {
        id: u.id, username: u.username, name: u.name || "",
        // Yeni kullanıcı alanı eklerken BURAYA da ekle (aksi halde sunucu alanı düşürür → ayar kaydedilmez).
        perms: u.perms || {}, fiyatGor: !!u.fiyatGor, siparisSil: !!u.siparisSil, portalYonetici: !!u.portalYonetici, arama: !!u.arama,
        bolum: (u.bolum && typeof u.bolum === "object") ? u.bolum : {},   // bölüm kısıtları (yalnız kapatılanlar)
        sifreDegisim: e.sifreDegisim || null,   // son şifre değişim tarihi (admin görür; şifre DEĞİL)
        sifreZorunlu: zorunlu,                   // true → kullanıcı bir sonraki girişte kendi şifresini kuracak
      };
    });
    P.users = temizUsers;
    if (b.muhasebeOnay) P.muhasebeOnay = b.muhasebeOnay;
    if (b.yemOnay) P.yemOnay = b.yemOnay;
    if (b.muhasebeSiparisOnay) P.muhasebeSiparisOnay = b.muhasebeSiparisOnay;   // sipariş muhasebe onaycıları
    if (b.fabrikaOnay) P.fabrikaOnay = b.fabrikaOnay;   // TMR ÜRETİM onaycıları (panelden onay)
    await db.doc("apps/portal").set({data: {rota_portal_v1: JSON.stringify(P)}, updatedAt: new Date().toISOString()}, {merge: true});

    // 2) Auth hesapları + yetki rozetleri
    const notlar = [];
    for (const u of temizUsers) {
      // Kullanıcı-başı hata izolasyonu: tek bir hesabın Auth hatası (geçersiz e-posta, kota, geçici hata)
      // TÜM senkronu bozmasın — hatayı nota yaz, diğer kullanıcılara devam et.
      try {
        if (!u.username || typeof u.username !== "string") { notlar.push("geçersiz kullanıcı adı — atlandı"); continue; }
        const em = u.username.toLowerCase() + EPOSTA_SON;
        let rec = null;
        try { rec = await admin.auth().getUserByEmail(em); } catch (e) { /* yok */ }
        // GÜVENLİK (dış portal izolasyonu): bu e-posta zaten bir BAYİ/DANIŞMAN dış hesabına aitse, iç claim'lerle EZME —
        // aksi halde dış hesap sessizce tam iç hesaba yükselir (kendi şifresiyle iç modüllere girer).
        if (rec && rec.customClaims && (rec.customClaims.rol === "bayi" || rec.customClaims.rol === "danisman")) {
          notlar.push(u.username + ": bu kullanıcı adı bir " + (rec.customClaims.rol === "danisman" ? "DANIŞMAN" : "BAYİ") + " hesabına ait — iç kullanıcı olarak atlandı (farklı bir kullanıcı adı seçin)");
          continue;
        }
        const yeniSifre = b.sifreler && b.sifreler[u.username];
        if (!rec) {
          if (!yeniSifre) { notlar.push(u.username + ": yeni kullanıcı — şifre girilmediği için hesap açılamadı"); continue; }
          if (!parolaGecerli(yeniSifre)) { notlar.push(u.username + ": şifre politikayı karşılamıyor (en az 8 karakter, harf ve rakam) — hesap AÇILMADI"); continue; }
          rec = await admin.auth().createUser({email: em, password: yeniSifre});
        } else if (yeniSifre) {
          if (!parolaGecerli(yeniSifre)) { notlar.push(u.username + ": yeni şifre politikayı karşılamıyor (en az 8 karakter, harf ve rakam) — şifre DEĞİŞTİRİLMEDİ"); } else {
            await admin.auth().updateUser(rec.uid, {password: yeniSifre, disabled: false});
            await denetimVer("sifre-admin-degisti", aktor, {kullanici: u.username});
          }
        } else if (rec.disabled) {
          await admin.auth().updateUser(rec.uid, {disabled: false});
          await denetimVer("giris-acildi", aktor, {kullanici: u.username});
        }
        const claims = {username: u.username, portalYonetici: !!u.portalYonetici, fiyatGor: !!u.fiyatGor, siparisSil: !!u.siparisSil};
        ["siparis", "yem", "muhasebe", "ik", "saha", "bakim", "toplanti"].forEach((k) => { claims[k] = (u.perms && u.perms[k]) || "yok"; });
        const oncekiC = rec.customClaims || null;   // DENETİM: yeni hesapta null (customClaims yok), mevcutta eski yetkiler
        const yetkiAlan = ["portalYonetici", "fiyatGor", "siparisSil", "siparis", "yem", "muhasebe", "ik", "saha", "bakim", "toplanti"];
        const degisen = yetkiAlan.filter((k) => yetkiNorm(k, (oncekiC || {})[k]) !== yetkiNorm(k, claims[k]));
        // Uyarı metni okunur olsun: "SİPARİŞ SİLME (verildi)" / "Sipariş Takip (TMR): admin"
        const degisenAd = degisen.map((k) => YETKI_BOOL.has(k) ?
          (YETKI_AD[k] || k) + (claims[k] === true ? " (verildi)" : " (kaldırıldı)") :
          (YETKI_AD[k] || k) + ": " + yetkiNorm(k, claims[k]));
        await admin.auth().setCustomUserClaims(rec.uid, claims);
        if (!oncekiC) await denetimVer("hesap-acildi", aktor, {kullanici: u.username, yetki: claims});
        else if (degisen.length) await denetimVer("yetki-degisti", aktor, {kullanici: u.username, degisen: degisenAd});
      } catch (e) {
        console.error("yonetim/kullanıcı", u && u.username, e);
        notlar.push((u && u.username ? u.username : "?") + ": senkronlanamadı (" + (e.code || e.message || "hata") + ")");
      }
    }
    // 3) Listeden çıkarılanları devre dışı bırak (her biri ayrı korumalı)
    const gecerli = new Set(temizUsers.filter((u) => u.username && typeof u.username === "string").map((u) => u.username.toLowerCase() + EPOSTA_SON));
    const hepsi = await admin.auth().listUsers(1000);
    for (const r of hepsi.users) {
      if (r.customClaims && (r.customClaims.rol === "bayi" || r.customClaims.rol === "danisman")) continue;   // BAYİ/DANIŞMAN dış portal hesapları iç panelde değil; bu sweep kapatmasın
      if (r.uid === dec.uid) continue;   // ÖZ-KİLİTLENME KORUMASI: işlemi yapan yönetici eksik liste gönderse bile KENDİ hesabını kapatmasın
      if (r.email && r.email.endsWith(EPOSTA_SON) && !gecerli.has(r.email) && !r.disabled) {
        try { await admin.auth().updateUser(r.uid, {disabled: true}); try { await admin.auth().revokeRefreshTokens(r.uid); } catch (er) { /* token iptali başarısızsa disable yeter */ } notlar.push(r.email.replace(EPOSTA_SON, "") + ": listeden çıkarıldığı için girişi kapatıldı"); await denetimVer("giris-kapatildi", aktor, {kullanici: r.email.replace(EPOSTA_SON, "")}); } catch (e) { notlar.push(r.email.replace(EPOSTA_SON, "") + ": girişi kapatılamadı (" + (e.code || e.message) + ")"); }
      }
    }
    res.json({ok: true, notlar});
  } catch (e) {
    console.error("yonetim", e);
    res.status(401).json({hata: "kimlik doğrulanamadı"});
  }
});

// ============================================================
// ŞİFRE DEĞİŞTİR — kullanıcı KENDİ şifresini yeniler (admin dahil kimse göremez).
// Bloker #3 (şifre yaşam döngüsü): ilk-giriş zorunlu kurulum · 90 gün rotasyon · self-servis.
// - Yalnız son 5 dk içinde kimlik doğrulamış (giriş/reauth) oturum kabul edilir → çalınmış
//   eski token'la hesap ele geçirme kapalı.
// - Şifre min-8 + harf + rakam (parolaGecerli); Firebase'de güncellenir, HİÇBİR yerde saklanmaz/loglanmaz.
// - apps/portal'da yalnız sifreDegisim (tarih) + sifreZorunlu (false) meta güncellenir.
// ============================================================
exports.sifreDegistir = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    const now = Math.floor(Date.now() / 1000);
    if (!dec.auth_time || (now - dec.auth_time) > 300) { res.status(401).json({hata: "oturum-eski"}); return; }
    if (!(await rateLimit("sifreDegistir:" + dec.uid, 8, 300))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const yeni = String((req.body && req.body.yeni) || "");
    if (!parolaGecerli(yeni)) { res.status(400).json({hata: "zayif-parola"}); return; }
    await admin.auth().updateUser(dec.uid, {password: yeni});
    await denetimVer("sifre-kullanici-degisti", (dec.email || "").replace(EPOSTA_SON, "") || dec.uid, {});   // DENETİM: yalnız OLAY (şifre ASLA loglanmaz)
    // ASIL İŞLEM TAMAM (şifre değişti). Meta yazımı AYRI try/catch — çökse bile ok:true dön;
    // yoksa istemci 'değiştirilemedi' der ama şifre zaten değişmiştir → kullanıcı kilitlenir.
    let uyari = null;
    try {
      const P = await portalOku();
      if (P) {
        const uname = (dec.email || "").replace(EPOSTA_SON, "").toLowerCase();
        // İç kullanıcı (P.users) VEYA bayi (P.bayiler) — hangisiyse onun meta'sını güncelle
        let rec = Array.isArray(P.users) ? P.users.find((u) => u.username && u.username.toLowerCase() === uname) : null;
        if (!rec && Array.isArray(P.bayiler)) rec = P.bayiler.find((x) => x.username && x.username.toLowerCase() === uname);
        if (rec) {
          rec.sifreDegisim = new Date().toISOString();
          rec.sifreZorunlu = false;
          await db.doc("apps/portal").set({data: {rota_portal_v1: JSON.stringify(P)}, updatedAt: new Date().toISOString()}, {merge: true});
        }
      }
    } catch (e) { console.error("sifreDegistir/meta", e); uyari = "meta-guncellenemedi"; }
    res.json({ok: true, uyari});
  } catch (e) { console.error("sifreDegistir", e); res.status(500).json({hata: "degistirilemedi"}); }
});

// ============================================================
// MÜŞTERİ UCU — onay/bilgi sayfaları için güvenli erişim
// GET  ?t=TOKEN  → yalnızca o siparişin izinli alanları (fiyat yok)
// POST {t,islem:'onaylandi'|'itiraz',sebep,notOkundu} → onay kaydı + Telegram
// Müşteri tarayıcısına veritabanı İNMEZ; bot anahtarı sunucuda kalır.
// ============================================================
// NOT: söz verilen "teslimTarihi" bilinçli olarak listede YOK — müşteriye gitmez
// (gecikme olursa "zamanında teslim edilmedi" itirazını önlemek için). Fiilen gerçekleşen
// olay tarihleri (hareketTarihi, sevkTarih, teslimEdildiTarih) müşteriye gösterilebilir.
// "total" ve "dbsOran"/"imeceFark" LİSTEDE: müşteri onay sayfası tutarı kendisi topluyordu ve
// DBS indirimi ile manuel pazarlık tutarını GÖRMÜYORDU → müşteri, kesilen faturadan FARKLI bir
// tutarı onaylamış oluyordu. Onay kaydı delil niteliğinde tutulduğu için bu alanlar gitmeli.
const MUSTERI_ALANLAR = ["no", "date", "customer", "odeme", "fiyatKademe", "status", "onayNot",
  "plaka", "sofor", "soforTel", "hareketTarihi", "hareketSaati", "kargo", "palet", "strec", "nakliyeMusteri",
  "not", "sevkTarih", "teslimEdildiTarih", "musteriOnay", "musteriOnayTs",
  "total", "dbsOran", "imeceAy", "imeceOran", "imeceFark"];

// ---- ÖDEME TİPİ (DBS) — SUNUCU TARAFI DAMGA ----
// Portal (bayi/danışman) siparişleri istemcideki odemeDamgala'dan geçmez. Damgalanmazsa:
// (1) portal siparişi DBS indirimini HİÇ almaz, (2) sipariş iç ekranda ilk kez düzenlendiğinde
// tutar sessizce %3 düşer, (3) aynı alıcı kanala göre farklı fatura alır. Bu yüzden burada damgalanır.
const DBS_ORAN_VARSAYILAN = 3;
function dbsOranHesapla(DB, odemeTipi) {
  if (String(odemeTipi || "") !== "dbs") return 0;
  const v = DB && DB.meta ? DB.meta.dbsOran : null;
  const n = (v === null || v === undefined || v === "") ? DBS_ORAN_VARSAYILAN : (+v || 0);
  return (isFinite(n) && n > 0 && n <= 100) ? n : 0;
}
// İSTEMCİ İLE BİREBİR AYNI FORMÜL OLMAK ZORUNDA: istemci İKİ adımda yuvarlar
// (dbsIskonto=round2(net*r/100) → orderNetDbs=round2(net−dbsIskonto)). Sunucu tek adımda
// yuvarlarsa net tutar X,50 ile bittiğinde 1 kuruş ayrışır; bu 1 kuruş, siparişi iç ekranda
// kaydederken "tutar değişti" kapısını (eşik 0,005) tetikleyip müşteri onayını sahte yere düşürür.
function dbsUygula(toplam, oran) {
  const t = Math.round((+toplam || 0) * 100) / 100;
  if (!(oran > 0)) return t;
  const isk = Math.round(t * oran / 100 * 100) / 100;
  return Math.round((t - isk) * 100) / 100;
}
function trTarihUzun(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "—";
  const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const GN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return (+m[3]) + " " + AY[+m[2] - 1] + " " + m[1] + " " + GN[dt.getDay()];
}
exports.musteri = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const t = String((req.method === "GET" ? req.query.t : (req.body || {}).t) || "").trim();
    if (!t || t.length < 8) { res.status(400).json({hata: "gecersiz baglanti"}); return; }
    // HIZ SINIRI (kimliksiz uç): IP başına dk'da 40 — token kaba-kuvvet tahminini frenler (128-bit token + bu = pratikte imkânsız).
    if (!(await rateLimit("musteri:" + istekIp(req), 40, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    try { const P = await portalOku(); if (P && P.disKilit === true) { res.status(503).json({hata: "Sayfa geçici olarak kapalı. Lütfen daha sonra tekrar deneyin."}); return; } } catch (e) { /* portal okunamazsa müşteri sayfasını engelleme (fail-open — en düşük riskli yüzey) */ }   // ACİL ŞALTER (tüm dış dünya)
    const DB = await loadDB();
    const o = DB && (DB.orders || []).find((x) => x.onayToken === t);
    if (!o) { res.status(404).json({hata: "bulunamadi"}); return; }

    if (req.method === "GET") {
      const out = {};
      MUSTERI_ALANLAR.forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
      out.lines = (o.lines || []).map((l) => ({code: l.code, qty: l.qty, price: l.price}));  // yalnız KENDİ siparişinin fiyatı
      let onayKaydi = null;
      try {
        const s = await db.doc("apps/onaylar").get();
        const r = s.exists ? (s.data()[o.id] || null) : null;
        if (r) onayKaydi = {onay: r.onay, ts: r.ts};
      } catch (e) { /* yok */ }
      res.json({siparis: out, onay: onayKaydi});
      return;
    }

    if (req.method === "POST") {
      const b = req.body || {};
      const kind = b.islem === "itiraz" ? "itiraz" : "onaylandi";
      const payload = {onay: kind, ts: new Date().toISOString(), ad: o.customer || "", no: o.no || ""};
      if (kind === "itiraz") payload.sebep = String(b.sebep || "").slice(0, 600);
      if (kind === "onaylandi" && b.notOkundu) payload.notOkundu = true;
      await db.doc("apps/onaylar").set({[o.id]: payload}, {merge: true});

      const token = tgToken(), chat = tgChat();
      if (token && chat) {
        const cust = (DB.customers || []).find((c) => c.id === o.customerId) || {};
        const ortak = "Sipariş: #" + (o.no || "") + "\nMüşteri: " + (o.customer || "—") +
          "\nTelefon: " + (cust.phone || "—") + "\nSipariş alan: " + (o.alan || "—") +
          "\nTeslim: " + (o.teslimTarihi ? trTarihUzun(o.teslimTarihi) : "—");
        const text = kind === "itiraz"
          ? "MÜŞTERİ HATA BİLDİRDİ\n\n" + ortak + "\n\nMüşteri Notu:\n" + (payload.sebep || "(belirtilmedi)") + "\n\nLütfen müşteri ile iletişime geçip bilgileri düzeltin."
          : "MÜŞTERİ ONAYLADI\n\n" + ortak + (payload.notOkundu ? "\n\nMüşteri gönderim notunu okudu." : "") + "\n\n(Üretim için ayrıca fabrika onayı gerekir.)";
        await tg(token, "sendMessage", {chat_id: chat, text});
      }
      res.json({ok: true});
      return;
    }
    res.status(405).json({hata: "yontem"});
  } catch (e) {
    console.error("musteri", e);
    res.status(500).json({hata: "sunucu"});
  }
});

// ============================================================
// BAYİ PORTALI (Faz 1a) — İKİ UÇ
// (A) bayiYonetim: İÇ personel (portalYonetici / saha yöneticisi) bir bayiye portal erişimi açar/sıfırlar/kapatır.
//     Bayi hesabı = Firebase Auth, TÜM iç modül claim'i 'yok' + rol:'bayi' + bayiId. Meta apps/portal.bayiler'de.
//     Şifre yaşam döngüsü otomatik: açılış/sıfırlama GEÇİCİ şifre verir → sifreZorunlu=true → bayi kendi şifresini kurar.
// (B) bayi: DIŞ bayi hesabı KENDİ verisini ister — sahip-kapsamlı (yalnız o bayinin siparişleri + müşterileri).
//     Fiyat kademeleri/komisyon/iskonto/başka bayilerin verisi ASLA gönderilmez (beyaz-liste deseni).
// ============================================================
// NOT: 'not' (sipariş notu) ve 'note' (müşteri notu) BİLİNÇLİ olarak dışarıda — iç personel notu içerebilir, bayiye gitmez.
// 'no' (genel sipariş no) da BİLİNÇLİ dışarıda — bayi bizim toplam sipariş sayımızı görmesin; bayi-site kendi
// içinde (createdAt sırasıyla) yerel numara verir. 'id' yalnız istemci anahtarı (rastgele, sayı sızdırmaz).
const BAYI_SIP_ALANLAR = ["id", "date", "createdAt", "fiyatKademe", "status", "teslimTarihi", "sevkTarih",
  "teslimEdildiTarih", "hareketTarihi", "hareketSaati", "kargo", "plaka", "sofor", "soforTel", "odeme", "total", "aliciMusteri",
  "imeceAy", "imeceOran", "imeceFark"];   // İMECE 2. faturası: portal yalnız 1. faturayı gösterirse bayi eksik tutar görür
const BAYI_MUS_ALANLAR = ["id", "name", "irtibat", "phone", "adres", "city", "tip"];

exports.bayiYonetim = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    // Yetki: yalnız portal yöneticisi VEYA saha YÖNETİCİSİ bayi hesabı açabilir (hesap oluşturma hassas işlem)
    if (!(dec.portalYonetici === true || dec.saha === "yonetici")) { res.status(403).json({hata: "yetkisiz"}); return; }
    if (!(await rateLimit("bayiYonetim:" + dec.uid, 40, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const aktor = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;   // DENETİM: dış portal hesabını açan/kapatan yönetici
    const b = req.body || {};
    const islem = String(b.islem || "");
    // ROL: 'bayi' (varsayılan, geriye-uyum) veya 'danisman'. Kayıtlar tek listede (P.bayiler), rol + idKey ile ayrışır.
    const rol = (String(b.rol || "") === "danisman") ? "danisman" : "bayi";
    const idKey = rol === "danisman" ? "danismanId" : "bayiId";
    const komType = rol === "danisman" ? "danisman" : "bayi";
    const komId = String(b[idKey] || "");
    if (!komId) { res.status(400).json({hata: (rol === "danisman" ? "danışman" : "bayi") + " seçilmedi"}); return; }
    const P = await portalOku();
    if (!P) { res.status(500).json({hata: "portal verisi yok"}); return; }
    P.bayiler = Array.isArray(P.bayiler) ? P.bayiler : [];
    const DB = await loadDB();
    const komKaydi = DB && (DB.komisyoncular || []).find((k) => k.id === komId && k.type === komType);
    if (!komKaydi) { res.status(404).json({hata: (rol === "danisman" ? "danışman" : "bayi") + " bulunamadı"}); return; }
    let rec = P.bayiler.find((x) => (x.rol || "bayi") === rol && x[idKey] === komId);

    if (islem === "ac" || islem === "sifirla") {
      const gecici = String(b.gecici || "");
      if (!parolaGecerli(gecici)) { res.status(400).json({hata: "geçici şifre en az 8 karakter, harf ve rakam olmalı"}); return; }
      let uname;
      if (islem === "ac") {
        uname = String(b.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(uname)) { res.status(400).json({hata: "geçersiz kullanıcı adı (3-30; harf, rakam, . _ -)"}); return; }
        const cakisma = (P.users || []).some((u) => u.username && u.username.toLowerCase() === uname) ||
          P.bayiler.some((x) => x.username && x.username.toLowerCase() === uname && !((x.rol || "bayi") === rol && x[idKey] === komId));
        if (cakisma) { res.status(409).json({hata: "bu kullanıcı adı kullanımda"}); return; }
      } else {
        if (!rec || !rec.username) { res.status(400).json({hata: "önce erişim açılmalı"}); return; }
        uname = rec.username;
      }
      const em = uname + EPOSTA_SON;
      let au = null;
      try { au = await admin.auth().getUserByEmail(em); } catch (e) { /* yok */ }
      // GÜVENLİK: mevcut hesabı ancak AYNI rol+id'ye ait bir dış portal hesabıysa geri dönüştür; iç/orphan/başka hesabı asla ezme
      if (au && !(au.customClaims && au.customClaims.rol === rol && au.customClaims[idKey] === komId)) {
        res.status(409).json({hata: "bu kullanıcı adı başka bir hesaba ait — farklı bir ad seçin"}); return;
      }
      if (!au) au = await admin.auth().createUser({email: em, password: gecici});
      else await admin.auth().updateUser(au.uid, {password: gecici, disabled: false});
      // Claim: HİÇ iç modül yetkisi yok + rol + (bayiId | danismanId) — kurallar bu hesabı iç veriden dışlar
      const claims = {rol, username: uname, portalYonetici: false, fiyatGor: false, siparis: "yok", yem: "yok", muhasebe: "yok", ik: "yok", saha: "yok", bakim: "yok", toplanti: "yok"};
      claims[idKey] = komId;
      await admin.auth().setCustomUserClaims(au.uid, claims);
      if (rec) { rec.username = uname; rec.sifreZorunlu = true; rec.aktif = true; rec.name = komKaydi.name || rec.name; rec.rol = rol; } else {
        rec = {rol, username: uname, name: komKaydi.name || "", sifreZorunlu: true, sifreDegisim: null, aktif: true, olusturma: new Date().toISOString()};
        rec[idKey] = komId;
        P.bayiler.push(rec);
      }
      await db.doc("apps/portal").set({data: {rota_portal_v1: JSON.stringify(P)}, updatedAt: new Date().toISOString()}, {merge: true});
      await denetimVer(islem === "ac" ? "portal-hesap-acildi" : "portal-sifre-sifirlandi", aktor, {rol, id: komId, kullanici: uname});
      res.json({ok: true, username: uname});
      return;
    }
    if (islem === "kapat") {
      if (rec && rec.username) {
        try { const a = await admin.auth().getUserByEmail(rec.username + EPOSTA_SON); await admin.auth().updateUser(a.uid, {disabled: true}); await admin.auth().revokeRefreshTokens(a.uid); } catch (e) { /* yok */ }
        rec.aktif = false;
        await db.doc("apps/portal").set({data: {rota_portal_v1: JSON.stringify(P)}, updatedAt: new Date().toISOString()}, {merge: true});
        await denetimVer("portal-hesap-kapatildi", aktor, {rol, id: komId, kullanici: rec.username});
      }
      res.json({ok: true});
      return;
    }
    res.status(400).json({hata: "bilinmeyen işlem"});
  } catch (e) { console.error("bayiYonetim", e); res.status(500).json({hata: "islem-basarisiz"}); }
});

// ============================================================
// KOMİSYONCU (BAYİ/DANIŞMAN) YÖNETİMİ — TEK KAYNAK (apps/siparis.komisyoncular)
// Saha modülü bayi/danışman EDİTÖRÜ ama eskiden apps/saha'ya (kendi kopyası) yazıyordu → portal/fiyat/fonksiyonların
// okuduğu apps/siparis ile ıraksıyordu. Bu uç, çekirdek kimliği (whitelist) doğrudan apps/siparis'e yazar → tek kaynak.
// Sözleşme/belge PII apps/saha'da kalır (buraya GİRMEZ → portal fonksiyonlarına sızmaz). Yalnız saha-yönetici/portalYönetici.
// Silme: siparişi/müşterisi/bağlı bayisi olan HARD silinemez → pasife alınır (veri bütünlüğü; siparişler bayiId'ye bağlı).
// ============================================================
exports.komisyoncuYonet = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec; try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (!(dec.portalYonetici === true || dec.saha === "yonetici")) { res.status(403).json({hata: "yetkisiz — yalnız saha yöneticisi/portal yöneticisi"}); return; }
    if (!(await rateLimit("komisyoncuYonet:" + dec.uid, 40, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const aktor = (dec.email || "").replace(EPOSTA_SON, "") || dec.uid;
    const b = req.body || {};
    const islem = String(b.islem || "");

    if (islem === "kaydet") {
      const k = b.kom || {};
      const ad = String(k.name || "").trim();
      if (!ad) { res.status(400).json({hata: "isim gerekli"}); return; }
      const tip = (String(k.type || "") === "danisman") ? "danisman" : "bayi";
      const veri = {   // WHITELIST — yalnız çekirdek kimlik alanları (sz/belgeler DEĞİL)
        name: ad.slice(0, 160), type: tip,
        city: String(k.city || "").slice(0, 80), phone: String(k.phone || "").slice(0, 40),
        adres: String(k.adres || "").slice(0, 300), note: String(k.note || "").slice(0, 300),
        rate: Math.max(0, Math.min(100, +k.rate || 0)),
        ozelIskonto: tip === "bayi" ? Math.max(0, Math.min(100, +k.ozelIskonto || 0)) : 0,
        active: k.active !== false,
        // Ödeme tipi: "" normal | "dbs" (iskonto üzerine ek indirim) | "imece" (vadeli, kredi kartı fiyatından).
        // TEK alan → DBS ve İMECE aynı bayide birlikte olamaz. Bilinmeyen değer normale düşer.
        // İMECE artık kart özelliği DEĞİL, sipariş kararı → komisyoncu kartında yalnız "dbs" kabul edilir.
        odemeTipi: (String(k.odemeTipi || "") === "dbs" ? "dbs" : ""),
        danismanId: tip === "bayi" ? String(k.danismanId || "").slice(0, 40) : "",
        plasiyerId: tip === "bayi" ? String(k.plasiyerId || "").slice(0, 40) : "",
        guncelleme: new Date().toISOString(),   // yaz-guard bunu 'son 10 dk' korumasında kullanır
      };
      let yeniId = null;
      await db.runTransaction(async (tx) => {
        const ref = db.doc("apps/siparis");
        const snap = await tx.get(ref);
        const dd = snap.exists ? (snap.data().data || {}) : {};
        let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
        if (!DBc) throw new Error("veri yok");
        DBc.komisyoncular = DBc.komisyoncular || [];
        if (veri.danismanId && !DBc.komisyoncular.some((x) => x.id === veri.danismanId && x.type === "danisman")) veri.danismanId = "";   // geçersiz danışman → temizle
        const mid = String(k.id || "");
        if (mid) {
          const ex = DBc.komisyoncular.find((x) => x.id === mid);
          if (ex) { Object.assign(ex, veri); }   // yalnız whitelist alanları güncellenir; kaydın diğer alanları (crossKey vb.) korunur
          else { DBc.komisyoncular.push(Object.assign({id: mid}, veri)); }   // verilen id YOKSA o id ile OLUŞTUR (Saha orphan göçü: id korunur → sz/belge eşleşir)
          yeniId = mid;
        } else {
          const yeni = Object.assign({id: "k" + Date.now().toString(36) + Math.floor(Math.random() * 1000)}, veri);
          DBc.komisyoncular.push(yeni);
          yeniId = yeni.id;
        }
        tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
      });
      await denetimVer("komisyoncu-kaydet", aktor, {id: yeniId, kullanici: ad, tip});
      res.json({ok: true, id: yeniId});
      return;
    }

    if (islem === "sil") {
      const mid = String(b.id || "");
      if (!mid) { res.status(400).json({hata: "kayıt yok"}); return; }
      let sonuc = "yok";
      await db.runTransaction(async (tx) => {
        const ref = db.doc("apps/siparis");
        const snap = await tx.get(ref);
        const dd = snap.exists ? (snap.data().data || {}) : {};
        let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
        if (!DBc) throw new Error("veri yok");
        const ex = (DBc.komisyoncular || []).find((x) => x.id === mid);
        if (!ex) { sonuc = "yok"; return; }
        const refli = (DBc.orders || []).some((o) => o && (o.bayiId === mid || o.danismanId === mid || o.komisyoncuId === mid)) ||
          (DBc.customers || []).some((c) => c && (c.bayiId === mid || c.danismanId === mid)) ||
          (DBc.komisyoncular || []).some((x) => x && x.danismanId === mid);   // bu danışmana bağlı bayi
        if (refli) { ex.active = false; ex.guncelleme = new Date().toISOString(); sonuc = "pasif"; } else { DBc.komisyoncular = DBc.komisyoncular.filter((x) => x.id !== mid); sonuc = "silindi"; }
        tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
      });
      if (sonuc === "yok") { res.status(404).json({hata: "kayıt bulunamadı"}); return; }
      await denetimVer("komisyoncu-sil", aktor, {id: mid, sonuc});
      res.json({ok: true, sonuc});
      return;
    }

    res.status(400).json({hata: "bilinmeyen işlem"});
  } catch (e) { console.error("komisyoncuYonet", e); res.status(500).json({hata: "sunucu"}); }
});

exports.bayi = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (dec.rol !== "bayi" || !dec.bayiId) { res.status(403).json({hata: "bayi erişimi değil"}); return; }
    if (!(await rateLimit("bayi:" + dec.uid, 90, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const bayiId = dec.bayiId;
    const P = await portalOku();
    if (P && P.disKilit === true) { res.status(503).json({hata: "Portal geçici olarak kapalı. Lütfen fabrika ile görüşün."}); return; }   // ACİL ŞALTER
    const rec = (P && Array.isArray(P.bayiler)) ? P.bayiler.find((x) => x.bayiId === bayiId) : null;
    if (!rec || rec.aktif === false) { res.status(403).json({hata: "erişim kapalı"}); return; }
    // Şifre kurulmadan VERİ DÖNDÜRME/SİPARİŞ YOK (defense-in-depth): önce kendi şifresini kursun.
    if (rec.sifreZorunlu === true) {
      res.status(428).json({hata: "sifre-kurulmali", profil: {bayiId, username: rec.username, name: rec.name || "", sifreZorunlu: true, sifreDegisim: rec.sifreDegisim || null}});
      return;
    }
    const DB = await loadDB();
    if (!DB) { res.status(500).json({hata: "veri yok"}); return; }
    const bayiKaydi = (DB.komisyoncular || []).find((k) => k.id === bayiId && k.type === "bayi");
    const rate = (bayiKaydi && +bayiKaydi.rate) || 0;
    const ozelIskonto = (bayiKaydi && +bayiKaydi.ozelIskonto) || 0;
    // Bayi net = fabrika × (1−özel) × (1−iskonto). Fabrika aktif tarifeden, yoksa üründen.
    const aktifPL = (DB.priceLists || []).find((x) => x.id === (DB.meta && DB.meta.activePriceListId)) || (DB.priceLists || []).find((x) => x.active) || null;
    const fabOf = (code) => {
      if (aktifPL) { const it = (aktifPL.items || []).find((x) => String(x.code || "").toLowerCase() === String(code).toLowerCase()); if (it && +it.fabrika) return +it.fabrika; }
      const p = (DB.products || []).find((x) => x.code === code); return p ? (+p.fabrika || 0) : 0;
    };
    const bayiCarpan = (1 - ozelIskonto / 100) * (1 - rate / 100);
    const bayiNet = (code) => Math.round(fabOf(code) * bayiCarpan * 100) / 100;

    // ---- POST: yeni bayi siparişi (KENDİSİ için, 'beklemede' → iç onaya düşer) ----
    if (req.method === "POST") {
      const bd = req.body || {};
      const islem = String(bd.islem || "");

      // ---- Müşteri EKLE/GÜNCELLE (sahip-kapsamlı: yalnız KENDİ müşterisi; SİLME YOK) ----
      if (islem === "musteri") {
        const m = bd.musteri || {};
        const ad = String(m.name || "").trim();
        if (!ad) { res.status(400).json({hata: "müşteri adı gerekli"}); return; }
        const veri = {
          name: ad.slice(0, 120), irtibat: String(m.irtibat || "").slice(0, 120),
          phone: String(m.phone || "").slice(0, 40), adres: String(m.adres || "").slice(0, 300), city: String(m.city || "").slice(0, 60),
        };
        const mid = String(m.id || "");
        let yeniId = null;
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.doc("apps/siparis");
            const snap = await tx.get(ref);
            const dd = snap.exists ? (snap.data().data || {}) : {};
            let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
            if (!DBc) throw new Error("veri yok");
            DBc.customers = DBc.customers || [];
            let c = mid ? DBc.customers.find((x) => x.id === mid) : null;
            if (mid) {
              if (!c || c.bayiId !== bayiId) throw new Error("yetki");   // başka bayinin/atanmamış müşteriyi düzenleyemez
              Object.assign(c, veri);
            } else {
              // Bayi başına aktif müşteri tavanı (paylaşılan apps/siparis blob'unun şişip 1MB'a dayanmasını önler)
              if (DBc.customers.filter((x) => x.bayiId === bayiId && !x.arsiv).length >= 300) throw new Error("limit");
              c = Object.assign({id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1000), bayiId, danismanId: "", plasiyerId: "", tip: "Müşteri", orderCount: 0, arsiv: false, kaynak: "bayi-portal", createdAt: new Date().toISOString()}, veri);
              DBc.customers.push(c);
            }
            yeniId = c.id;
            tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
          });
        } catch (e) {
          if (String(e.message) === "yetki") { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
          if (String(e.message) === "limit") { res.status(429).json({hata: "aktif müşteri sınırına ulaştınız (en fazla 300). Kullanmadıklarınızı arşivleyin."}); return; }
          throw e;
        }
        res.json({ok: true, id: yeniId});
        return;
      }
      // ---- Müşteri ARŞİVLE / arşivden çıkar (SİLME YOK — iç sistemde kayıt kalır) ----
      if (islem === "musteri-arsiv") {
        const mid = String(bd.id || "");
        if (!mid) { res.status(400).json({hata: "müşteri yok"}); return; }
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.doc("apps/siparis");
            const snap = await tx.get(ref);
            const dd = snap.exists ? (snap.data().data || {}) : {};
            let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
            if (!DBc) throw new Error("veri yok");
            const c = (DBc.customers || []).find((x) => x.id === mid);
            if (!c || c.bayiId !== bayiId) throw new Error("yetki");
            c.arsiv = !!bd.arsiv;   // arşivle (true) veya geri al (false) — asla silme
            tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
          });
        } catch (e) {
          if (String(e.message) === "yetki") { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
          throw e;
        }
        res.json({ok: true});
        return;
      }
      // ---- YEM siparişi (portal → apps/yem, ÜRETİM ONAYI; fiyat GÖSTERİLMEZ, fabrika belirler) ----
      if (islem === "siparis-yem") {
        const YB = await loadYemDB();
        const yemUrunSet = new Set((YB && Array.isArray(YB.products) ? YB.products : []).filter((p) => p && p.active !== false && p.code).map((p) => p.code));
        const ylines = [];
        (Array.isArray(bd.lines) ? bd.lines : []).forEach((l) => {
          if (ylines.length >= 50) return;
          const code = String((l && l.code) || "").trim();
          const qty = Math.floor(+((l && l.qty)) || 0);
          if (!code || qty <= 0 || qty > 100000) return;
          if (!yemUrunSet.has(code)) return;   // yalnız geçerli aktif YEM ürünü
          ylines.push({code, qty});
        });
        if (!ylines.length) { res.status(400).json({hata: "geçerli yem ürün satırı yok"}); return; }
        const teslimTarihi = /^\d{4}-\d{2}-\d{2}$/.test(String(bd.teslimTarihi || "")) ? String(bd.teslimTarihi) : "";
        let aliciMusteriId = String(bd.aliciMusteriId || ""); let musAd = "";
        if (aliciMusteriId) {
          const mc = (DB.customers || []).find((x) => x.id === aliciMusteriId && x.bayiId === bayiId && !x.arsiv);
          if (mc) musAd = mc.name || ""; else aliciMusteriId = "";   // geçersiz/başkasının/arşivliyse yok say
        }
        const bayiAd = (bayiKaydi && bayiKaydi.name) || rec.name || "Bayi";
        // Fatura bayie kesildiği için DBS bayinin ödeme tipinden. Fiyat 0 olduğu için indirim şimdi
        // hesaplanamaz ama ORAN damgalanır; fabrika fiyatı girip kaydedince odemeDamgala bu oranı korur.
        const yDbsOran = dbsOranHesapla(YB, bayiKaydi && bayiKaydi.odemeTipi);
        const yeni = yemPortalSiparis({
          customerId: "", customer: musAd || bayiAd, teslimTarihi, lines: ylines, dbsOran: yDbsOran,
          alan: "Bayi Portalı" + (musAd ? " · " + bayiAd : ""), kaynak: "bayi-portal",
          extra: {bayiId, portalMusteriId: aliciMusteriId, portalMusteri: musAd},
        });
        const ut = ylines.map((l) => "• " + l.code + " × " + l.qty + " çuval").join("\n");
        const sonNo = await yemPortalEkleVeBildir(yeni,
          "YENİ YEM SİPARİŞİ (bayi portalı) — MUHASEBE ONAYI BEKLİYOR\n\nBayi: " + bayiAd + (musAd ? "\nAlıcı (müşteri): " + musAd : "") +
          "\nSipariş: {NO}\nTarih: " + yeni.date + (teslimTarihi ? "\nTeslim istenen: " + teslimTarihi : "") + "\n\n" + ut +
          "\n\nFiyat/vade fabrika tarafından belirlenecek. Muhasebe onayı verilince sipariş üretime geçer 👇");
        res.json({ok: true, no: sonNo, hat: "yem"});
        return;
      }
      if (islem !== "siparis") { res.status(400).json({hata: "bilinmeyen işlem"}); return; }
      const lines = [];
      (Array.isArray(bd.lines) ? bd.lines : []).forEach((l) => {
        if (lines.length >= 50) return;   // sipariş başına en fazla 50 kalem (belge şişmesi/DoS sınırı)
        const code = String((l && l.code) || "").trim();
        const qty = Math.floor(+((l && l.qty)) || 0);
        if (!code || qty <= 0 || qty > 100000) return;
        if (!(DB.products || []).some((p) => p.code === code && p.active !== false)) return;   // yalnız aktif ürün
        const liste = fabOf(code);     // iskontosuz (fabrika) birim fiyat — sipariş anında kilitlenir (sonradan gösterim için)
        const price = bayiNet(code);   // FİYATI SUNUCU HESAPLAR — istemci fiyatı yok sayılır
        if (price <= 0) return;         // fabrika fiyatı tanımsız ürün 0 TL'ye sipariş edilmesin
        lines.push({code, qty, price, liste});
      });
      if (!lines.length) { res.status(400).json({hata: "geçerli ürün satırı yok"}); return; }
      const teslimTarihi = /^\d{4}-\d{2}-\d{2}$/.test(String(bd.teslimTarihi || "")) ? String(bd.teslimTarihi) : "";
      // Alıcı: bayi kendisi (varsayılan) VEYA kendi müşterilerinden biri (teslim/izleme hedefi; fiyat yine bayi fiyatı)
      let aliciMusteriId = String(bd.aliciMusteriId || "");
      let aliciMusteri = "";
      if (aliciMusteriId) {
        const mc = (DB.customers || []).find((x) => x.id === aliciMusteriId && x.bayiId === bayiId && !x.arsiv);
        if (mc) aliciMusteri = mc.name || ""; else aliciMusteriId = "";   // geçersiz/başkasının/arşivliyse yok say
      }
      let toplamHam = 0; lines.forEach((l) => { toplamHam += l.qty * l.price; });
      // Bayinin ödeme tipi DBS ise indirim SUNUCUDA uygulanır ve oran siparişe damgalanır.
      const dbsOranSip = dbsOranHesapla(DB, bayiKaydi && bayiKaydi.odemeTipi);
      const toplam = dbsUygula(toplamHam, dbsOranSip);
      const nowISO = new Date().toISOString();
      const yeni = {
        id: "o" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        no: 0, date: nowISO.slice(0, 10), createdAt: nowISO, teslimTarihi,
        aliciBayi: true, bayiId, fiyatKademe: "bayi", komisyonRate: rate, ozelIskonto: ozelIskonto,
        danismanId: (bayiKaydi && bayiKaydi.danismanId) || "",
        komisyoncuId: (bayiKaydi && bayiKaydi.danismanId) || bayiId,
        plasiyerId: (bayiKaydi && bayiKaydi.plasiyerId) || "",
        bayiPlasiyerId: (bayiKaydi && bayiKaydi.plasiyerId) || "",
        status: "beklemede", lines, total: toplam,
        dbsOran: dbsOranSip, imeceAy: 0, imeceOran: 0, imeceFark: 0,   // oranlar sipariş anında damgalanır (geçmiş kaymasın)
        aliciMusteri, aliciMusteriId,   // siparişin gittiği bayi müşterisi (teslim/izleme hedefi); boşsa bayi kendisi için
        customerId: "", customer: "", firma: "", odeme: "", kargo: "", nakliye: 0,
        not: "", alan: "Bayi Portalı", kaynak: "bayi-portal",   // not BOŞ: iç listede "Not Var" clutter'ı yerine BAYİDEN etiketi çıkar (#9)
        muhasebeOnayGerek: true,   // katı sıra: önce muhasebe onayı (sunucu-kilidi için)
        priceListId: (DB.meta && DB.meta.activePriceListId) || "",
        hist: [{ts: nowISO, durum: "beklemede", not: "Bayi portalından oluşturuldu" +
          (dbsOranSip > 0 ? " · DBS %" + dbsOranSip + " uygulandı" : "")}],
      };
      // apps/siparis'e TRANSACTION ile ekle: eşzamanlı yazımlarda kayıp önlenir, no transaction içinde tazelenir
      let sonNo = 0;
      await db.runTransaction(async (tx) => {
        const ref = db.doc("apps/siparis");
        const snap = await tx.get(ref);
        const dd = snap.exists ? (snap.data().data || {}) : {};
        let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
        if (!DBc) throw new Error("siparis verisi yok");
        DBc.orders = DBc.orders || [];
        portalSipTavanKontrol(DBc.orders, yeni);   // dış aktör açık-sipariş tavanı (DoS koruması) — bayi ANA sipariş yolu da kapsanır
        sonNo = DBc.orders.reduce((m, o) => Math.max(m, +o.no || 0), 0) + 1;
        yeni.no = sonNo;
        DBc.orders.push(yeni);
        tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
      });
      try {
        const token = tgToken(), chat = tgChat();
        if (token && chat) {
          const ut = lines.map((l) => "• " + l.code + " × " + l.qty).join("\n");
          const aliciTxt = aliciMusteri ? ("\nAlıcı (müşteri): " + aliciMusteri) : "";
          const teslimTxt = teslimTarihi ? ("\nTeslim istenen: " + teslimTarihi) : "";
          const text = "YENİ BAYİ SİPARİŞİ (portal) — MUHASEBE ONAYI BEKLİYOR\n\nBayi: " + ((bayiKaydi && bayiKaydi.name) || "—") + aliciTxt +
            "\nSipariş: #" + sonNo + "\nTarih: " + yeni.date + teslimTxt + "\n\n" + ut + "\n\nTahmini tutar: " + Math.round(toplam) + " ₺\n\nSipariş Takip'te 'beklemede' olarak listelendi. Önce muhasebe onayı, ardından üretim onayı alınır.";
          // 1. KAPI: muhasebe onayı (moapprove:t) → webhook onaylanınca üretim onayını (approve:→confirm:) tetikler.
          // GÜVENLİK: mesaj yalnız İÇ Telegram grubuna gider; bayi bu grupta değil → kendi siparişini onaylayamaz.
          await tg(token, "sendMessage", {chat_id: chat, text, reply_markup: {inline_keyboard: [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:t:" + yeni.id + ":" + imzaHash(siparisImza(yeni))}]]}});
        }
      } catch (e) { console.error("bayi/tg", e); }
      res.json({ok: true, no: sonNo});
      return;
    }

    // ---- GET: profil + siparişler + müşteriler + ürünler + özet ----
    const profil = {bayiId, username: rec.username, name: (bayiKaydi && bayiKaydi.name) || rec.name || "",
      sifreZorunlu: rec.sifreZorunlu === true, sifreDegisim: rec.sifreDegisim || null};
    const tmrSiparisler = (DB.orders || [])
      .filter((o) => o.aliciBayi === true && o.bayiId === bayiId && o.status !== "iptal")
      .map((o) => {
        const out = {};
        BAYI_SIP_ALANLAR.forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
        out.lines = (o.lines || []).map((l) => ({code: l.code, qty: l.qty, price: l.price}));
        // İskontosuz (brut) tutar + bayiye yapılan iskonto: line.liste varsa ondan, yoksa net fiyattan geri hesapla
        // DAMGA ÖNCELİKLİ: iç sistem kaydederken o.brutListe'yi yazar (orderListTotal — İMECE'de
        // kredi kartı tabanını, elle girilen fiyatı ve tarifeyi doğru görür). Damga yoksa (damga
        // öncesi eski kayıt) tersine hesaba düşülür; tersine hesap İMECE/elle fiyatta yanılabilir.
        const r2 = +o.komisyonRate || 0;
        const oz2 = +o.ozelIskonto || 0;
        const carpan2 = (1 - oz2 / 100) * (1 - r2 / 100);
        let brut = 0;
        (o.lines || []).forEach((l) => {
          const liste = (+l.liste) || ((carpan2 > 0 && carpan2 < 1 && +l.price) ? (+l.price) / carpan2 : (+l.price || 0));
          brut += liste * (+l.qty || 0);
        });
        out.brut = Math.round((+o.brutListe > 0) ? (+o.brutListe) : brut);
        out.iskonto = Math.max(0, Math.round(out.brut - (+o.total || 0)));
        out.hat = "tmr";
        // SATIŞ KURALI damgası: bayinin gördüğü çeyreklik iskonto/tonaj iç raporla AYNI olsun.
        // Sipariş listesi tüm durumları göstermeye devam eder (takip), yalnız İSKONTO ekranı süzer.
        out.teslimEdildi = satisMiFN(o);
        out.satisTarih = satisTarihiFN(o);
        return out;
      });
    const musteriler = (DB.customers || [])
      .filter((c) => c.bayiId === bayiId && !c.arsiv)
      .map((c) => { const out = {}; BAYI_MUS_ALANLAR.forEach((k) => { if (c[k] !== undefined) out[k] = c[k]; }); return out; });
    // Ürün kataloğu — FİYAT YOK (rekabet: bayi katalog ekran görüntüsünde fiyat sızdırmasın).
    // Fiyat yalnız sipariş SONRASI, o siparişe özel (aşağıda siparisler.brut/iskonto) görünür.
    const urunler = (DB.products || []).filter((p) => p.active !== false && p.code)
      .map((p) => ({code: p.code, ad: p.name || p.code, pkg: p.pkg || ""}))
      .sort((a, b) => String(a.ad).localeCompare(String(b.ad), "tr"));
    // YEM tarafı (Faz C): katalog (fiyatsız) + bayinin kendi yem siparişleri (apps/yem). Yem ürününde 'name' yok → code kullanılır.
    const YB = await loadYemDB();
    const yemUrunler = (YB && Array.isArray(YB.products) ? YB.products : []).filter((p) => p && p.active !== false && p.code)
      .map((p) => ({code: p.code, ad: p.code, pkg: p.pkg || ""}))
      .sort((a, b) => String(a.ad).localeCompare(String(b.ad), "tr"));
    const yemSiparisler = (YB && Array.isArray(YB.orders) ? YB.orders : [])
      .filter((o) => o && o.kaynak === "bayi-portal" && o.bayiId === bayiId && o.status !== "iptal")
      .map((o) => ({
        id: o.id, no: o.no, date: o.date, createdAt: o.createdAt, teslimTarihi: o.teslimTarihi || "",
        status: o.status || "beklemede", lines: (o.lines || []).map((l) => ({code: l.code, qty: l.qty})),
        hat: "yem", aliciMusteri: o.portalMusteri || "", brut: 0, iskonto: 0, total: 0,
        plaka: o.plaka || "", sofor: o.sofor || "", soforTel: o.soforTel || "", sevkTarih: o.sevkTarih || "", hareketSaati: o.hareketSaati || "",
      }));
    const siparisler = tmrSiparisler.concat(yemSiparisler).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    let alimTutar = 0;
    tmrSiparisler.forEach((o) => { if (o.teslimEdildi) alimTutar += (+o.total || 0); });   // yalnız TESLİM — iç bayiAlimData ile aynı taban
    res.json({profil, siparisler, musteriler, urunler, yemUrunler, ozet: {alimTutar, siparisAdet: siparisler.length, musteriSayisi: musteriler.length}});
  } catch (e) {
    if (e && e.message === "SIP_TAVAN") { res.status(429).json({hata: "Açık sipariş sınırına ulaştınız. Mevcut siparişleriniz teslim/iptal edildikçe yeni sipariş açabilirsiniz."}); return; }
    console.error("bayi", e); res.status(500).json({hata: "sunucu"});
  }
});

// ============================================================
// DANIŞMAN PORTALI (Faz B) — danisman fonksiyonu (rol:'danisman')
// Danışman KENDİ bayilerini (saha ataması) + KENDİ müşterilerini + kendi/fabrika siparişlerini görür.
// KOMİSYON/İSKONTO ASLA gönderilmez (beyaz-liste; komisyon zaten siparişte SAKLANMAZ — iç sistemde türetilir).
// İki sipariş modu: (a) BAYİ için (sabit bayi fiyatı) (b) MÜŞTERİ için (danışman fiyat girer, kargo komisyondan düşülür).
// ============================================================
const DANISMAN_SIP_ALANLAR = ["id", "date", "createdAt", "fiyatKademe", "status", "teslimTarihi", "sevkTarih",
  "teslimEdildiTarih", "hareketTarihi", "hareketSaati", "kargo", "plaka", "sofor", "soforTel", "odeme", "total", "aliciBayi", "nakliye",
  "imeceAy", "imeceOran", "imeceFark"];   // İMECE 2. faturası: danışman yalnız 1. faturayı görürse eksik tutar bildirir
const DANISMAN_MUS_ALANLAR = ["id", "name", "irtibat", "phone", "adres", "city", "tip"];

// Sipariş ekle (transaction, no tazelenir) + Telegram onay butonu — portal siparişleri için ortak yardımcı
// Dış aktörün AÇIK (teslim/iptal edilmemiş) portal siparişi sayısını tavana kilitler. kaynak+aktör-id ile sayar;
// tavana varılmışsa SIP_TAVAN fırlatır → çağıran fonksiyonun dış catch'i 429'a çevirir. İç siparişleri (kaynak boş) saymaz.
function portalSipTavanKontrol(orders, yeni) {
  const kynk = yeni.kaynak || "";
  const idAlan = kynk === "bayi-portal" ? "bayiId" : (kynk === "danisman-portal" ? "danismanId" : "");
  const akId = idAlan ? String(yeni[idAlan] || "") : "";
  if (!akId) return;
  const acik = (orders || []).filter((o) => o && o.kaynak === kynk && String(o[idAlan] || "") === akId &&
    o.status !== "iptal" && o.status !== "teslim").length;
  if (acik >= PORTAL_SIP_TAVAN) throw new Error("SIP_TAVAN");
}
async function portalSiparisEkleVeBildir(yeni, tgText) {
  yeni.muhasebeOnayGerek = true;   // katı sıra: önce muhasebe onayı (sunucu-kilidi confirm: forge'unu kapatır)
  let sonNo = 0;
  await db.runTransaction(async (tx) => {
    const ref = db.doc("apps/siparis");
    const snap = await tx.get(ref);
    const dd = snap.exists ? (snap.data().data || {}) : {};
    let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
    if (!DBc) throw new Error("siparis verisi yok");
    DBc.orders = DBc.orders || [];
    portalSipTavanKontrol(DBc.orders, yeni);   // dış aktör açık-sipariş tavanı (DoS koruması)
    sonNo = DBc.orders.reduce((m, o) => Math.max(m, +o.no || 0), 0) + 1;
    yeni.no = sonNo;
    DBc.orders.push(yeni);
    tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
  });
  try {
    const token = tgToken(), chat = tgChat();
    if (token && chat) {
      // 1. KAPI: muhasebe onayı. Muhasebe onaylayınca webhook üretim onay mesajını (approve:) tetikler.
      await tg(token, "sendMessage", {chat_id: chat, text: tgText.split("{NO}").join("#" + sonNo),
        reply_markup: {inline_keyboard: [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:t:" + yeni.id + ":" + imzaHash(siparisImza(yeni))}]]}});
    }
  } catch (e) { console.error("portalSiparis/tg", e); }
  return sonNo;
}

// ============================================================
// PORTAL YEM SİPARİŞİ (Faz C) — bayi/danışman yem ürünü sipariş eder.
// Sipariş apps/yem'e (yem modülünün blob'u) yazılır; FİYAT/VADE/İSKONTO/NAKLİYE = 0 (fabrika belirler).
// Onay: mevcut YEM ÜRETİM ONAYI akışı — Telegram 'yoapprove' → 'yoconfirm' → apps/yemonay (yalnız Gülseren/yedek).
// Komisyon: ŞİMDİLİK YOK (kullanıcı kararı). İleride danışman komisyonu buraya eklenecek (temiz kanca: kaynak/danismanId siparişte var).
// ============================================================
// dbsOran: fiyatlar burada 0 olduğu için indirim şimdi hesaplanamaz; ORANI YİNE DE DAMGALARIZ.
// Damgalanmazsa, fabrika fiyatları girip kaydettiğinde istemcideki odemeDamgala "mevcut kayıt +
// alan yok" görüp 0 yazar ve DBS'li müşteri indirimini HİÇ alamaz.
function yemPortalSiparis({customerId, customer, teslimTarihi, lines, alan, kaynak, extra, dbsOran}) {
  const nowISO = new Date().toISOString();
  const vlines = lines.map((l) => ({code: l.code, qty: l.qty, liste: 0, price: 0}));   // fiyat yok — fabrika girer
  const cuval = vlines.reduce((s, l) => s + (+l.qty || 0), 0);
  return Object.assign({
    id: "yo" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    no: 0, date: nowISO.slice(0, 10), createdAt: nowISO, teslimTarihi: teslimTarihi || "",
    alan: alan || "", customerId: customerId || "", customer: customer || "",
    vade: "", odeme: "", status: "beklemede", lines: vlines,
    nakliyeBirim: 0, hammaliyeBirim: 0, iskontoOran: 0, iskontoTL: 0,
    plaka: "", sofor: "", soforTel: "", hareketTarihi: "", hareketSaati: "",
    cuval, brut: 0, iskontoTutar: 0, nakliyeTutar: 0, hammaliyeTutar: 0, urunNet: 0, total: 0,
    // NAKLİYE KDV DAMGASI: portal siparişi id'siyle doğar → istemcideki nakliyeKdvDamgala() onu
    // "mevcut kayıt" sanıp atlar. Damgasız kalsaydı fabrika nakliyeyi girdiğinde KDV eklenmezdi.
    // İstemcideki NAKLIYE_KDV_ORAN ile AYNI olmalı (yem/index.html).
    nakliyeKdv: NAKLIYE_KDV_ORAN_FN,
    dbsOran: +dbsOran || 0, imeceAy: 0, imeceOran: 0, imeceFark: 0,
    // YEM HATTI TEK KAPILI (firma kararı): ayrı üretim onayı YOK — statüyü muhasebe onayı ilerletir.
    // yemOnayGerek dolu bırakılırsa istemci eski iki kapılı akışa düşer ve sipariş 'beklemede'de kalır.
    not: "", kaynak, yemOnayGerek: false, hist: [],
  }, extra || {});
}
async function yemPortalEkleVeBildir(yeni, tgText) {
  yeni.muhasebeOnayGerek = true;   // katı sıra: önce muhasebe onayı
  let sonNo = 0;
  await db.runTransaction(async (tx) => {
    const ref = db.doc("apps/yem");
    const snap = await tx.get(ref);
    const dd = snap.exists ? (snap.data().data || {}) : {};
    let YB = null; try { YB = JSON.parse(dd["rota_yem_v1"] || "null"); } catch (e) { YB = null; }
    if (!YB) throw new Error("yem verisi yok");
    YB.orders = YB.orders || [];
    portalSipTavanKontrol(YB.orders, yeni);   // dış aktör açık-sipariş tavanı (DoS koruması)
    sonNo = YB.orders.reduce((m, o) => Math.max(m, +o.no || 0), 0) + 1;
    yeni.no = sonNo;
    YB.orders.push(yeni);
    tx.set(ref, {data: Object.assign({}, dd, {rota_yem_v1: JSON.stringify(YB)}), updated: Date.now()});
  });
  try {
    const token = tgToken(), chat = tgChat();
    if (token && chat) {
      // YEM HATTI TEK KAPILI: yalnız muhasebe onayı istenir; webhook mod="y" gördüğünde ayrıca üretim onay mesajı GÖNDERMEZ.
      await tg(token, "sendMessage", {chat_id: chat, text: tgText.split("{NO}").join("#Y" + sonNo),
        reply_markup: {inline_keyboard: [[{text: "✅ Muhasebe Onayı Ver", callback_data: "moapprove:y:" + yeni.id + ":" + imzaHash(siparisImza(yeni))}]]}});
    }
  } catch (e) { console.error("yemPortal/tg", e); }
  return sonNo;
}

exports.danisman = onRequest({region: "us-central1", cors: true, secrets: [TG_TOKEN, TG_CHAT]}, async (req, res) => {
  try {
    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    if (dec.rol !== "danisman" || !dec.danismanId) { res.status(403).json({hata: "danışman erişimi değil"}); return; }
    if (!(await rateLimit("danisman:" + dec.uid, 90, 60))) { res.status(429).json({hata: "cok_fazla_istek"}); return; }
    const danismanId = dec.danismanId;
    const P = await portalOku();
    if (P && P.disKilit === true) { res.status(503).json({hata: "Portal geçici olarak kapalı. Lütfen fabrika ile görüşün."}); return; }   // ACİL ŞALTER
    const rec = (P && Array.isArray(P.bayiler)) ? P.bayiler.find((x) => x.rol === "danisman" && x.danismanId === danismanId) : null;
    if (!rec || rec.aktif === false) { res.status(403).json({hata: "erişim kapalı"}); return; }
    if (rec.sifreZorunlu === true) {
      res.status(428).json({hata: "sifre-kurulmali", profil: {danismanId, username: rec.username, name: rec.name || "", sifreZorunlu: true, sifreDegisim: rec.sifreDegisim || null}});
      return;
    }
    const DB = await loadDB();
    if (!DB) { res.status(500).json({hata: "veri yok"}); return; }
    const danKaydi = (DB.komisyoncular || []).find((k) => k.id === danismanId && k.type === "danisman");
    // Danışman YALNIZ kendi perakende müşterileriyle çalışır: bayi listesi/fiyatı bu uçta HİÇ kullanılmaz (bayi verisi gizli).
    // Bayilere ait komisyon iç sistemde (bayi siparişinin danismanId'si üzerinden) hesaplanır; danışman portalında görünmez.

    // ---- POST ----
    if (req.method === "POST") {
      const bd = req.body || {};
      const islem = String(bd.islem || "");

      // Müşteri EKLE/GÜNCELLE (danışmana ait; SİLME YOK, arşiv)
      if (islem === "musteri") {
        const m = bd.musteri || {};
        const ad = String(m.name || "").trim();
        if (!ad) { res.status(400).json({hata: "müşteri adı gerekli"}); return; }
        const veri = {name: ad.slice(0, 120), irtibat: String(m.irtibat || "").slice(0, 120), phone: String(m.phone || "").slice(0, 40), adres: String(m.adres || "").slice(0, 300), city: String(m.city || "").slice(0, 60)};
        const mid = String(m.id || "");
        let yeniId = null;
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.doc("apps/siparis");
            const snap = await tx.get(ref);
            const dd = snap.exists ? (snap.data().data || {}) : {};
            let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
            if (!DBc) throw new Error("veri yok");
            DBc.customers = DBc.customers || [];
            let c = mid ? DBc.customers.find((x) => x.id === mid) : null;
            if (mid) {
              if (!c || c.danismanId !== danismanId) throw new Error("yetki");
              Object.assign(c, veri);
            } else {
              if (DBc.customers.filter((x) => x.danismanId === danismanId && !x.arsiv).length >= 300) throw new Error("limit");
              c = Object.assign({id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1000), danismanId, bayiId: "", plasiyerId: "", tip: "Müşteri", orderCount: 0, arsiv: false, kaynak: "danisman-portal", createdAt: new Date().toISOString()}, veri);
              DBc.customers.push(c);
            }
            yeniId = c.id;
            tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
          });
        } catch (e) {
          if (String(e.message) === "yetki") { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
          if (String(e.message) === "limit") { res.status(429).json({hata: "aktif müşteri sınırına ulaştınız (en fazla 300). Kullanmadıklarınızı arşivleyin."}); return; }
          throw e;
        }
        res.json({ok: true, id: yeniId});
        return;
      }
      if (islem === "musteri-arsiv") {
        const mid = String(bd.id || "");
        if (!mid) { res.status(400).json({hata: "müşteri yok"}); return; }
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.doc("apps/siparis");
            const snap = await tx.get(ref);
            const dd = snap.exists ? (snap.data().data || {}) : {};
            let DBc = null; try { DBc = JSON.parse(dd["rota_so_v1"] || "null"); } catch (e) { DBc = null; }
            if (!DBc) throw new Error("veri yok");
            const c = (DBc.customers || []).find((x) => x.id === mid);
            if (!c || c.danismanId !== danismanId) throw new Error("yetki");
            c.arsiv = !!bd.arsiv;
            tx.set(ref, {data: Object.assign({}, dd, {rota_so_v1: JSON.stringify(DBc)}), updated: Date.now()});
          });
        } catch (e) {
          if (String(e.message) === "yetki") { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
          throw e;
        }
        res.json({ok: true});
        return;
      }

      const teslimTarihi = /^\d{4}-\d{2}-\d{2}$/.test(String(bd.teslimTarihi || "")) ? String(bd.teslimTarihi) : "";
      const nowISO = new Date().toISOString();

      // NOT: 'siparis-bayi' KALDIRILDI — danışman artık bayi için sipariş veremez, yalnız kendi müşterisine.

      // Sipariş — MÜŞTERİ için: fiyatı DANIŞMAN girer; kargo bedeli komisyonundan düşülür (iç orderKomisyon)
      if (islem === "siparis-musteri") {
        const musteriId = String(bd.musteriId || "");
        const musteri = (DB.customers || []).find((c) => c.id === musteriId && c.danismanId === danismanId && !c.arsiv);
        if (!musteri) { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
        const lines = [];
        (Array.isArray(bd.lines) ? bd.lines : []).forEach((l) => {
          if (lines.length >= 50) return;
          const code = String((l && l.code) || "").trim();
          const qty = Math.floor(+((l && l.qty)) || 0);
          const price = Math.round((+((l && l.fiyat)) || 0) * 100) / 100;   // FİYATI DANIŞMAN GİRER
          if (!code || qty <= 0 || qty > 100000 || price <= 0) return;
          if (!(DB.products || []).some((p) => p.code === code && p.active !== false)) return;
          // _locked: fiyatı DANIŞMAN pazarlıkla girdi — iç ekranda İMECE işaretlenince applyTariffToLines
          // bu satırı kredi kartı tarifesine EZMESİN (danışmanın 900 ₺'si sessizce 700'e düşüyordu ve
          // "elle fiyat girilmiş" uyarısı da _locked aranmadığı için hiç çıkmıyordu).
          lines.push({code, qty, price, _locked: true});
        });
        if (!lines.length) { res.status(400).json({hata: "geçerli ürün/fiyat satırı yok"}); return; }
        let toplamHam = 0; lines.forEach((l) => { toplamHam += l.qty * l.price; });
        // Müşterinin ödeme tipi DBS ise indirim SUNUCUDA uygulanır ve oran damgalanır (bkz. dbsOranHesapla).
        const dbsOranSip = dbsOranHesapla(DB, musteri.odemeTipi);
        const toplam = dbsUygula(toplamHam, dbsOranSip);
        const yeni = {
          id: "o" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
          no: 0, date: nowISO.slice(0, 10), createdAt: nowISO, teslimTarihi,
          aliciBayi: false, customerId: musteriId, customer: musteri.name || "", firma: musteri.firma || "",
          danismanId, komisyoncuId: danismanId, plasiyerId: musteri.plasiyerId || "",
          fiyatKademe: "", status: "beklemede", lines, total: toplam,
          dbsOran: dbsOranSip, imeceAy: 0, imeceOran: 0, imeceFark: 0,
          odeme: "", kargo: "", nakliye: 0,   // KARGO'yu danışman girmez — fabrika/iç personel ekler (o zaman komisyondan düşülür). Burada 0.
          not: "", alan: "Danışman Portalı", kaynak: "danisman-portal",
          priceListId: (DB.meta && DB.meta.activePriceListId) || "",
          hist: [{ts: nowISO, durum: "beklemede", not: "Danışman portalından (müşteri için) oluşturuldu" +
            (dbsOranSip > 0 ? " · DBS %" + dbsOranSip + " uygulandı" : "")}],
        };
        const ut = lines.map((l) => "• " + l.code + " × " + l.qty).join("\n");
        const sonNo = await portalSiparisEkleVeBildir(yeni,
          "YENİ DANIŞMAN SİPARİŞİ (portal · müşteriye) — MUHASEBE ONAYI BEKLİYOR\n\nDanışman: " + ((danKaydi && danKaydi.name) || "—") + "\nMüşteri: " + (musteri.name || "—") +
          "\nSipariş: {NO}\nTarih: " + yeni.date + (teslimTarihi ? "\nTeslim istenen: " + teslimTarihi : "") + "\n\n" + ut + "\n\nTutar: " + Math.round(toplam) + " ₺\n\nSipariş Takip'te 'beklemede'. Önce muhasebe, ardından üretim onayı alınır.");
        res.json({ok: true, no: sonNo});
        return;
      }

      // Sipariş — YEM (Faz C): bayi VEYA müşteri hedefli; FİYAT/KOMİSYON YOK (fabrika belirler). apps/yem'e yazılır, Gülseren onayı.
      if (islem === "siparis-yem") {
        const YB = await loadYemDB();
        const yemUrunSet = new Set((YB && Array.isArray(YB.products) ? YB.products : []).filter((p) => p && p.active !== false && p.code).map((p) => p.code));
        const ylines = [];
        (Array.isArray(bd.lines) ? bd.lines : []).forEach((l) => {
          if (ylines.length >= 50) return;
          const code = String((l && l.code) || "").trim();
          const qty = Math.floor(+((l && l.qty)) || 0);
          if (!code || qty <= 0 || qty > 100000) return;
          if (!yemUrunSet.has(code)) return;
          ylines.push({code, qty});
        });
        if (!ylines.length) { res.status(400).json({hata: "geçerli yem ürün satırı yok"}); return; }
        // Danışman yem siparişi YALNIZ kendi müşterisine (bayi hedefi kaldırıldı).
        const musteri = (DB.customers || []).find((c) => c.id === String(bd.musteriId || "") && c.danismanId === danismanId && !c.arsiv);
        if (!musteri) { res.status(403).json({hata: "bu müşteri size ait değil"}); return; }
        const hedefAd = musteri.name || "Müşteri";
        const extra = {danismanId, portalMusteriId: musteri.id, portalMusteri: musteri.name || "", tur: "musteri"};
        const danAd = (danKaydi && danKaydi.name) || rec.name || "Danışman";
        const yDbsOran = dbsOranHesapla(YB, musteri.odemeTipi);   // müşterinin ödeme tipinden; fabrika fiyatı girince odemeDamgala korur
        const yeni = yemPortalSiparis({
          customerId: "", customer: hedefAd, teslimTarihi, lines: ylines, dbsOran: yDbsOran,
          alan: "Danışman Portalı · " + danAd, kaynak: "danisman-portal", extra,
        });
        const ut = ylines.map((l) => "• " + l.code + " × " + l.qty + " çuval").join("\n");
        const sonNo = await yemPortalEkleVeBildir(yeni,
          "YENİ YEM SİPARİŞİ (danışman portalı · müşteriye) — MUHASEBE ONAYI BEKLİYOR\n\nDanışman: " + danAd +
          "\nMüşteri: " + hedefAd +
          "\nSipariş: {NO}\nTarih: " + yeni.date + (teslimTarihi ? "\nTeslim istenen: " + teslimTarihi : "") + "\n\n" + ut +
          "\n\nFiyat/vade fabrika tarafından belirlenecek. Muhasebe onayı verilince sipariş üretime geçer 👇");
        res.json({ok: true, no: sonNo, hat: "yem"});
        return;
      }
      res.status(400).json({hata: "bilinmeyen işlem"});
      return;
    }

    // ---- GET ----
    const profil = {danismanId, username: rec.username, name: (danKaydi && danKaydi.name) || rec.name || "", sifreZorunlu: false, sifreDegisim: rec.sifreDegisim || null};
    const musteriler = (DB.customers || []).filter((c) => c.danismanId === danismanId && !c.arsiv)
      .map((c) => { const o = {}; DANISMAN_MUS_ALANLAR.forEach((k) => { if (c[k] !== undefined) o[k] = c[k]; }); return o; });
    // Danışman YALNIZ kendi perakende MÜŞTERİLERİNİN siparişlerini görür. Bayi siparişleri (aliciBayi) GÖSTERİLMEZ —
    // bayi orderlarının danismanId'si komisyon için set edilse de burada dışlanır (bayi verisi gizli).
    const benimMusteriIds = new Set((DB.customers || []).filter((c) => c.danismanId === danismanId).map((c) => c.id));
    const tmrSiparisler = (DB.orders || []).filter((o) => o && o.aliciBayi !== true && o.customerId && benimMusteriIds.has(o.customerId) && o.status !== "iptal").map((o) => {
      const out = {};
      DANISMAN_SIP_ALANLAR.forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
      out.lines = (o.lines || []).map((l) => ({code: l.code, qty: l.qty, price: l.price}));
      out.kime = o.customer || o.aliciMusteri || "—";
      out.tur = "musteri";
      out.fabrikadan = o.kaynak !== "danisman-portal";   // fabrika/iç tarafından girilen sipariş
      out.hat = "tmr";
      return out;
    });
    const urunler = (DB.products || []).filter((p) => p.active !== false && p.code)
      .map((p) => ({code: p.code, ad: p.name || p.code, pkg: p.pkg || ""}))
      .sort((a, b) => String(a.ad).localeCompare(String(b.ad), "tr"));
    // YEM tarafı (Faz C): katalog (fiyatsız) + danışmanın kendi yem siparişleri (apps/yem)
    const YB = await loadYemDB();
    const yemUrunler = (YB && Array.isArray(YB.products) ? YB.products : []).filter((p) => p && p.active !== false && p.code)
      .map((p) => ({code: p.code, ad: p.code, pkg: p.pkg || ""}))
      .sort((a, b) => String(a.ad).localeCompare(String(b.ad), "tr"));
    const yemSiparisler = (YB && Array.isArray(YB.orders) ? YB.orders : [])
      .filter((o) => o && o.kaynak === "danisman-portal" && o.danismanId === danismanId && o.tur !== "bayi" && !o.bayiId && o.status !== "iptal")   // bayi hedefli yem siparişleri hariç
      .map((o) => ({
        id: o.id, no: o.no, date: o.date, createdAt: o.createdAt, teslimTarihi: o.teslimTarihi || "",
        status: o.status || "beklemede", lines: (o.lines || []).map((l) => ({code: l.code, qty: l.qty})),
        hat: "yem", kime: o.customer || "—", tur: "musteri", fabrikadan: false, total: 0,
        plaka: o.plaka || "", sofor: o.sofor || "", soforTel: o.soforTel || "", sevkTarih: o.sevkTarih || "", hareketSaati: o.hareketSaati || "",
      }));
    const siparisler = tmrSiparisler.concat(yemSiparisler).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    let toplam = 0; tmrSiparisler.forEach((o) => { toplam += (+o.total || 0); });
    res.json({rol: "danisman", profil, musteriler, siparisler, urunler, yemUrunler, ozet: {siparisAdet: siparisler.length, musteriSayisi: musteriler.length, toplam}});
  } catch (e) {
    if (e && e.message === "SIP_TAVAN") { res.status(429).json({hata: "Açık sipariş sınırına ulaştınız. Mevcut siparişleriniz teslim/iptal edildikçe yeni sipariş açabilirsiniz."}); return; }
    console.error("danisman", e); res.status(500).json({hata: "sunucu"});
  }
});


// ============================================================
// SÖZLEŞME KISA LİNK — WA/Mail'de firebasestorage… yerine rota-yem.web.app/s/xxxxxxxx
// POST (saha/portal yetkisi): {url, path?, komId?, ad?} → {ok, kod, link}
// GET  /s/{kod} (Hosting rewrite) veya ?k=kod → antetli HTML'i sunar (Firebase markası yok)
// paylas/* yalnız Admin SDK; istemci okuyamaz/yazamaz (firestore catch-all).
// ============================================================
const crypto = require("crypto");
function sozKisaKod() {
  // 8 karakter, URL-dostu (karışıklık yaratan 0/O/1/l yok)
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += abc[bytes[i] % abc.length];
  return s;
}
exports.sozPaylas = onRequest({region: "us-central1", cors: true}, async (req, res) => {
  try {
    // —— GET: kısa link → belgeyi göster ——
    if (req.method === "GET") {
      const raw = String(req.url || req.path || "");
      const m = raw.match(/\/s\/([A-Za-z0-9]{6,12})/) || String(req.path || "").match(/([A-Za-z0-9]{6,12})$/);
      const kod = (m && m[1]) || String(req.query.k || "").trim();
      if (!kod || !/^[A-Za-z0-9]{6,12}$/.test(kod)) {
        res.status(404).set("Content-Type", "text/html; charset=utf-8")
          .send("<!doctype html><meta charset=utf-8><title>Link bulunamadı</title><body style=\"font-family:system-ui;padding:40px\"><h2>Sözleşme linki geçersiz</h2><p>Bağlantı hatalı veya süresi dolmuş olabilir. Rota SMI ile iletişime geçin.</p></body>");
        return;
      }
      const snap = await db.doc("paylas/" + kod).get();
      if (!snap.exists) {
        res.status(404).set("Content-Type", "text/html; charset=utf-8")
          .send("<!doctype html><meta charset=utf-8><title>Link bulunamadı</title><body style=\"font-family:system-ui;padding:40px\"><h2>Sözleşme linki bulunamadı</h2><p>Bu bağlantı artık geçerli değil. Lütfen Rota SMI ile iletişime geçin.</p></body>");
        return;
      }
      const d = snap.data() || {};
      // Tercihen Storage'dan HTML sun — tarayıcıda firebase URL görünmez
      if (d.path) {
        try {
          const bucket = admin.storage().bucket();
          const [buf] = await bucket.file(d.path).download();
          res.status(200)
            .set("Content-Type", "text/html; charset=utf-8")
            .set("Cache-Control", "private, max-age=300")
            .set("X-Content-Type-Options", "nosniff")
            .send(buf.toString("utf8"));
          return;
        } catch (e) {
          console.error("sozPaylas download", e);
          if (d.url) { res.redirect(302, d.url); return; }
          res.status(502).send("Belge okunamadı");
          return;
        }
      }
      if (d.url) { res.redirect(302, d.url); return; }
      res.status(404).send("Belge yok");
      return;
    }

    if (req.method !== "POST") { res.status(405).json({hata: "method"}); return; }

    const idToken = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let dec;
    try { dec = await admin.auth().verifyIdToken(idToken); } catch (e) { res.status(401).json({hata: "kimlik doğrulanamadı"}); return; }
    const sahaOk = dec.portalYonetici === true || (dec.saha && dec.saha !== "yok");
    if (!sahaOk) { res.status(403).json({hata: "yetkisiz"}); return; }

    if (!(await rateLimit("sozPaylas:" + (dec.uid || "x"), 30, 60))) { res.status(429).json({hata: "çok sık istek"}); return; }

    const b = req.body || {};
    const url = String(b.url || "").trim();
    const path = String(b.path || "").trim();
    if (!url && !path) { res.status(400).json({hata: "url veya path gerekli"}); return; }
    // Yalnız kendi Storage bucket / bilinen host — açık yönlendirme (open redirect) engeli
    if (url && !/^https:\/\/firebasestorage\.googleapis\.com\//.test(url) && !/^https:\/\/.*\.firebasestorage\.app\//.test(url)) {
      res.status(400).json({hata: "geçersiz depolama adresi"}); return;
    }
    if (path && (path.includes("..") || !path.startsWith("belgeler/"))) {
      res.status(400).json({hata: "geçersiz path"}); return;
    }

    let kod = sozKisaKod(), deneme = 0;
    while (deneme < 5) {
      const exists = await db.doc("paylas/" + kod).get();
      if (!exists.exists) break;
      kod = sozKisaKod(); deneme++;
    }
    await db.doc("paylas/" + kod).set({
      url: url || null,
      path: path || null,
      komId: String(b.komId || "").slice(0, 40) || null,
      ad: String(b.ad || "").slice(0, 120) || null,
      by: dec.username || dec.uid || null,
      ts: Date.now(),
    });
    const link = "https://rota-yem.web.app/s/" + kod;
    res.json({ok: true, kod, link});
  } catch (e) {
    console.error("sozPaylas", e);
    res.status(500).json({hata: "sunucu"});
  }
});
