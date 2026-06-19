// Rota SMI — Telegram sipariş onay webhook'u (Cloud Functions v2)
// Telegram'daki "Siparişi Onayla" butonunu işler: teyit → kim onayladı kaydı.
const {onRequest} = require("firebase-functions/v2/https");
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
    } else {
      await tg(token, "answerCallbackQuery", {callback_query_id: cq.id});
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error("webhook error", e);
    res.status(200).send("err"); // Telegram'ın yeniden denememesi için 200
  }
});
