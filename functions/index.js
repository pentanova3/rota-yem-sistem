// Rota SMI — Telegram sipariş onay webhook'u (Cloud Functions v2)
// Telegram'daki "Siparişi Onayla" butonunu işler: teyit → kim onayladı kaydı.
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Telegram webhook gizli anahtarı (setWebhook ile aynı olmalı). Kaynak herkese açık değil.
const SECRET = "rota_tg_wh_8s2n4q7x";

let _tokenCache = null, _tokenAt = 0;
async function loadDB() {
  const snap = await db.doc("apps/siparis").get();
  const data = snap.exists ? snap.data().data : null;
  if (!data) return null;
  try { return JSON.parse(data["rota_so_v1"] || "null"); } catch (e) { return null; }
}
async function getToken() {
  const now = Date.now();
  if (_tokenCache && (now - _tokenAt) < 60000) return _tokenCache;
  const DB = await loadDB();
  _tokenCache = (DB && DB.meta && DB.meta.tgToken) || null;
  _tokenAt = now;
  return _tokenCache;
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
function stripConfirm(t) { return String(t || "").replace(/\n\n⚠️[\s\S]*$/, ""); }

exports.telegramWebhook = onRequest({region: "us-central1"}, async (req, res) => {
  try {
    if (req.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) { res.status(403).send("forbidden"); return; }
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
    const name = whoName(cq.from);
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
    } else if (data.startsWith("mg:")) {
      // Muhasebe giriş onayı: mg:ok:REQID | mg:no:REQID
      const parts = data.split(":");
      const karar = parts[1], reqId = parts[2];
      const ts = new Date().toISOString();
      if (karar === "ok") {
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
// GÜNLÜK TESLİMAT PLANI — her sabah 07:45 (Türkiye saati)
// O gün teslim tarihi olan siparişleri gruba yazar:
// kime, hangi üründen, ne kadar + teslim noktası ve durum.
// ============================================================
exports.gunlukTeslimat = onSchedule({schedule: "45 7 * * *", timeZone: "Europe/Istanbul", region: "us-central1"}, async () => {
  const DB = await loadDB();
  if (!DB) { console.log("teslimat: veri yok"); return; }
  const token = DB.meta && DB.meta.tgToken, chat = DB.meta && DB.meta.tgChat;
  if (!token || !chat) { console.log("teslimat: telegram ayarı yok"); return; }

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
