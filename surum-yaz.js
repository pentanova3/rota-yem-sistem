// ROTA — dağıtım sürüm damgası üretici.
// firebase.json → hosting[portal].predeploy tarafından HER hosting dağıtımında otomatik çalışır,
// yani sürümü elle bumplamayı UNUTMAK mümkün değildir.
// Ürettiği /surum.json'u istemcideki surum-kontrol.js yoklar; değer değişince kullanıcının
// ekranı kilitlenir ve sayfayı yenilemesi istenir.
const fs = require('fs');
const d = new Date();
const v = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);   // ör. 20260721094512
fs.writeFileSync(__dirname + '/surum.json', JSON.stringify({ v: v, tarih: d.toISOString() }) + '\n');
console.log('surum.json yazıldı → ' + v);
