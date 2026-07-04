// ============================================================
// ROTA SMI · Finans Çekirdeği
// Kasa Defteri · Alacaklar · Borçlar · POS · DBS · Ayarlar
// ------------------------------------------------------------
// İlkeler:
//  - Tek gerçek kaynak: DB.hareketler (her giriş/çıkış tek kayıt).
//  - Gün sonu bakiyesi = ertesi günün açılışı (kronolojik kümülatif).
//  - Alacak, siparişten otomatik doğar (apps/siparis); tahsilat kasaya işler.
//  - POS: brüt giriş + komisyon gideri = net etki. DBS: vade + iş günü, kesintisiz.
//  - Mevcut haftalık grid verisi (entries) korunur ve bakiyeye dahildir.
// ============================================================
'use strict';

let MTAB='hafta';           // hafta | kasa | alacak | borc | pos | dbs | ayar
let _SIP=null;              // apps/siparis önbelleği {orders, customers}
let _finansHazir=false;

// ---------- yardımcılar ----------
function fuid(p){return (p||'f')+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function fmtP(n){return '₺'+(+n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtP0(n){return '₺'+(+n||0).toLocaleString('tr-TR',{maximumFractionDigits:0});}
function bugun(){return todayISO();}
// n iş günü ekle (Cumartesi/Pazar atlanır)
function addIsGunu(iso,n){
  const d=parseISO(iso);let k=0;
  while(k<n){d.setDate(d.getDate()+1);const g=d.getDay();if(g!==0&&g!==6)k++;}
  return isoOf(d);
}
function gecikmeGun(vadeISO){return daysBetween(vadeISO,bugun());}

// ---------- veri taşıma (mevcut alanlar korunur) ----------
function finansMigrate(){
  DB.hareketler=DB.hareketler||[];
  DB.poslar=DB.poslar||[];
  DB.dbsler=DB.dbsler||[];
  DB.tahsilatlar=DB.tahsilatlar||[];
  DB.ayarlar=DB.ayarlar||{};
  DB.ayarlar.bankalar=DB.ayarlar.bankalar||[];
  if(DB.ayarlar.dbsGun==null)DB.ayarlar.dbsGun=5;
  if(!DB.ayarlar.alacakBaslangic)DB.ayarlar.alacakBaslangic=bugun();  // eski dönem elle yönetildi; alacak takibi bu tarihten başlar
  (DB.odemeler||[]).forEach(o=>{if(o.odemeTarihi===undefined)o.odemeTarihi='';if(o.odemeYontemi===undefined)o.odemeYontemi='';if(o.not===undefined)o.not='';});
}

// ---------- hareket motoru ----------
function hareketEkle(h){ // {tarih,yon,tutar,kat,banka,aciklama,kaynak,ref}
  if(!h.tarih||!(+h.tutar>0))return null;
  if(h.ref&&DB.hareketler.some(x=>x.ref===h.ref&&x.kat===h.kat))return null; // idempotent
  const kayit={id:fuid('h'),tarih:h.tarih,yon:h.yon,tutar:Math.round(+h.tutar*100)/100,kat:h.kat||'Diğer',banka:h.banka||'',aciklama:h.aciklama||'',kaynak:h.kaynak||'manuel',ref:h.ref||'',ts:new Date().toISOString()};
  DB.hareketler.push(kayit);return kayit;
}
function gunHareketToplam(date,yon){return (DB.hareketler||[]).filter(h=>h.tarih===date&&h.yon===yon).reduce((s,h)=>s+(+h.tutar||0),0);}
// Haftalık ekranın gün toplamlarına otomatik hareketleri de kat (bakiye her ekranda aynı olsun)
const _dayGirisEski=dayGiris,_dayCikisEski=dayCikis;
dayGiris=function(date){return _dayGirisEski(date)+gunHareketToplam(date,'giris');};
dayCikis=function(date){return _dayCikisEski(date)+gunHareketToplam(date,'cikis');};

// ---------- sipariş verisi (alacaklar) ----------
async function sipYukle(force){
  if(_SIP&&!force)return _SIP;
  try{
    const KEY='AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8';
    const tk=(window.PortalAuth&&PortalAuth.token)?await PortalAuth.token():null;
    const r=await fetch('https://firestore.googleapis.com/v1/projects/rota-yem/databases/(default)/documents/apps/siparis?key='+KEY,{headers:tk?{'Authorization':'Bearer '+tk}:{}});
    const j=await r.json();
    const db=JSON.parse(j.fields.data.mapValue.fields.rota_so_v1.stringValue);
    _SIP={orders:db.orders||[],customers:db.customers||[]};
  }catch(e){_SIP={orders:[],customers:[]};}
  return _SIP;
}
function alacakSiparisleri(){ // takip başlangıcından itibaren, iptal hariç, tutarı olan
  if(!_SIP)return [];
  const bas=DB.ayarlar.alacakBaslangic;
  return _SIP.orders.filter(o=>o.status!=='iptal'&&o.date&&o.date>=bas&&(+o.total>0));
}
function tahsilEdilen(orderId){return DB.tahsilatlar.filter(t=>t.orderId===orderId).reduce((s,t)=>s+(+t.tutar||0),0);}

// ---------- otomatik motor (idempotent) ----------
async function autoEngine(){
  let degisti=false;const t=bugun();
  // 1) POS: hesaba geçiş günü gelenler → brüt giriş + komisyon gideri
  DB.poslar.forEach(p=>{
    if(p.durum!=='bekliyor'||p.hesabaGecis>t)return;
    hareketEkle({tarih:p.hesabaGecis,yon:'giris',tutar:p.brut,kat:'POS Tahsilat',banka:p.banka,aciklama:'POS brüt · '+fmtDate(p.tahsilatTarihi)+' tahsilatı',kaynak:'pos',ref:p.id});
    if(p.komisyon>0)hareketEkle({tarih:p.hesabaGecis,yon:'cikis',tutar:p.komisyon,kat:'POS Komisyonu',banka:p.banka,aciklama:'POS komisyonu (%'+p.oran+')',kaynak:'pos',ref:p.id});
    p.durum='gecti';degisti=true;
  });
  // 2) DBS: hesap tarihi gelenler → kesintisiz tam tutar giriş
  DB.dbsler.forEach(d=>{
    if(d.durum!=='bekliyor'||d.hesapTarihi>t)return;
    hareketEkle({tarih:d.hesapTarihi,yon:'giris',tutar:d.tutar,kat:'DBS Tahsilatı',banka:d.banka,aciklama:d.firma+' · vade '+fmtDate(d.vade),kaynak:'dbs',ref:d.id});
    d.durum='gecti';degisti=true;
  });
  // 3) Peşin siparişler: ödeme tarihi = sipariş günü → otomatik tahsilat + kasa girişi
  await sipYukle();
  alacakSiparisleri().forEach(o=>{
    if(!o.odeme||o.odeme>o.date)return;                       // peşin değil
    if(DB.tahsilatlar.some(x=>x.orderId===o.id))return;       // zaten işlendi
    DB.tahsilatlar.push({id:fuid('t'),orderId:o.id,orderNo:o.no,musteri:o.customer,tutar:+o.total,tarih:o.date,yontem:'Peşin',oto:true,ts:new Date().toISOString()});
    hareketEkle({tarih:o.date,yon:'giris',tutar:+o.total,kat:'Alacak Tahsilatı',aciklama:'#'+o.no+' '+o.customer+' · peşin (otomatik)',kaynak:'oto-pesin',ref:'pesin_'+o.id});
    degisti=true;
  });
  if(degisti){saveDB();toast('Otomatik kayıtlar işlendi');}
  return degisti;
}

// ---------- sekmeler ----------
const MTABS=[['hafta','Haftalık Akış'],['kasa','Kasa Defteri'],['alacak','Alacaklar'],['borc','Borçlar'],['pos','POS'],['dbs','DBS'],['ayar','Ayarlar']];
function tabsHTML(){
  const rozet={};
  const gecik=(DB.odemeler||[]).filter(o=>!o.odendi&&o.tarih<bugun()).length;if(gecik)rozet.borc=gecik;
  return '<div class="mtabs no-print">'+MTABS.map(([k,l])=>'<button class="mtab'+(MTAB===k?' on':'')+'" onclick="MTAB=\''+k+'\';render()">'+l+(rozet[k]?' <span class="mtab-b">'+rozet[k]+'</span>':'')+'</button>').join('')+'</div>';
}
const _renderHafta=render;
render=function(){
  const c=document.getElementById('content');if(!c)return;
  if(DB&&!DB.hareketler)finansMigrate();   // loadDB sonrası ilk render'da alanları garanti et
  if(MTAB==='hafta'){_renderHafta();}
  else{
    c.innerHTML=({kasa:renderKasa,alacak:renderAlacak,borc:renderBorc,pos:renderPos,dbs:renderDbs,ayar:renderAyar})[MTAB]();
  }
  c.insertAdjacentHTML('afterbegin',tabsHTML());
  if(MTAB==='hafta')c.insertAdjacentHTML('beforeend','<div class="no-print" style="font-size:11px;color:var(--slate-400);margin-top:10px">Not: Kasa Defteri, Alacak/Borç, POS ve DBS kayıtları gün toplamlarına otomatik dahildir — aynı tutarı tabloya ayrıca girmeyin.</div>');
};

// ---------- ortak: modal ----------
function mmOpen(html){mmClose();document.body.insertAdjacentHTML('beforeend','<div class="mm-bg" id="mmBg" onclick="if(event.target===this)mmClose()"><div class="mm">'+html+'</div></div>');}
function mmClose(){const m=document.getElementById('mmBg');if(m)m.remove();}
function mmV(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function bankaOpts(sel){return '<option value="">— Banka —</option>'+(DB.ayarlar.bankalar||[]).map(b=>'<option '+(sel===b.ad?'selected':'')+'>'+esc(b.ad)+'</option>').join('');}
const YONTEMLER=['Havale / EFT','Nakit','Kredi Kartı','Çek','DBS','POS'];
function yontemOpts(sel){return YONTEMLER.map(y=>'<option '+(sel===y?'selected':'')+'>'+y+'</option>').join('');}
function kpi(l,v,s,c){return '<div class="kpi2 '+(c||'')+'"><div class="kl">'+l+'</div><div class="kv">'+v+'</div>'+(s?'<div class="ks">'+s+'</div>':'')+'</div>';}

// ============================================================
// KASA DEFTERİ — günlük hareketler, gün sonu → ertesi gün devri
// ============================================================
let kasaAy='';
function kasaOlaylar(){ // hareketler + eski haftalık grid satırları (salt okunur) — kronolojik
  const ol=[];
  DB.hareketler.forEach(h=>ol.push({tarih:h.tarih,yon:h.yon,tutar:+h.tutar,kat:h.kat,banka:h.banka,aciklama:h.aciklama,kaynak:h.kaynak,id:h.id,silinebilir:h.kaynak==='manuel'}));
  Object.keys(DB.entries||{}).forEach(d=>{
    const e=DB.entries[d];
    DB.girisKat.forEach(k=>{if(+e[k.id]>0)ol.push({tarih:d,yon:'giris',tutar:+e[k.id],kat:k.ad,banka:'',aciklama:'Haftalık tablo girişi',kaynak:'haftalik'});});
    DB.cikisKat.forEach(k=>{if(+e[k.id]>0)ol.push({tarih:d,yon:'cikis',tutar:+e[k.id],kat:k.ad,banka:'',aciklama:'Haftalık tablo girişi',kaynak:'haftalik'});});
  });
  ol.sort((a,b)=>a.tarih.localeCompare(b.tarih)||(a.yon==='giris'?-1:1));
  return ol;
}
function renderKasa(){
  const ol=kasaOlaylar();
  if(!kasaAy)kasaAy=bugun().slice(0,7);
  const aylar=[...new Set(ol.map(o=>o.tarih.slice(0,7)))].sort();
  if(aylar.indexOf(kasaAy)<0&&aylar.length)kasaAy=aylar[aylar.length-1];
  // kümülatif bakiye: açılıştan itibaren tüm olaylar
  let bal=+DB.meta.acilisBakiye||0;
  const gunler={};let ayBasiDevir=bal;
  ol.forEach(o=>{
    const net=o.yon==='giris'?o.tutar:-o.tutar;
    if(o.tarih.slice(0,7)<kasaAy)ayBasiDevir+=net;
    bal+=net;
    (gunler[o.tarih]=gunler[o.tarih]||[]).push({...o,bakiye:bal});
  });
  const ayGunleri=Object.keys(gunler).filter(d=>d.slice(0,7)===kasaAy).sort();
  const girisT=ayGunleri.reduce((s,d)=>s+gunler[d].filter(o=>o.yon==='giris').reduce((a,o)=>a+o.tutar,0),0);
  const cikisT=ayGunleri.reduce((s,d)=>s+gunler[d].filter(o=>o.yon==='cikis').reduce((a,o)=>a+o.tutar,0),0);
  let sonBakiye=ayBasiDevir+girisT-cikisT;
  let run=ayBasiDevir;
  const gunBlok=ayGunleri.map(d=>{
    const rows=gunler[d].map(o=>{
      run+=(o.yon==='giris'?o.tutar:-o.tutar);
      return '<tr><td class="kd-kat"><span class="kd-dot '+(o.yon==='giris'?'g':'c')+'"></span>'+esc(o.kat)+(o.banka?' <span class="kd-bank">'+esc(o.banka)+'</span>':'')+'</td><td class="kd-ac">'+esc(o.aciklama||'')+(o.kaynak&&o.kaynak!=='manuel'&&o.kaynak!=='haftalik'?' <span class="kd-src">otomatik</span>':'')+(o.kaynak==='haftalik'?' <span class="kd-src" style="background:var(--slate-100);color:var(--slate-500)">tablo</span>':'')+'</td><td class="num '+(o.yon==='giris'?'kd-g':'kd-c')+'">'+(o.yon==='giris'?'+':'−')+fmtP(o.tutar)+'</td><td class="num kd-bal">'+fmtP(run)+'</td><td>'+(o.silinebilir?'<button class="kd-del" onclick="kasaSil(\''+o.id+'\')">✕</button>':'')+'</td></tr>';
    }).join('');
    return '<tbody class="kd-gun"><tr class="kd-hd"><td colspan="5">'+fmtDate(d)+' <span class="kd-hd-g">+'+fmtP0(gunler[d].filter(o=>o.yon==='giris').reduce((a,o)=>a+o.tutar,0))+'</span> <span class="kd-hd-c">−'+fmtP0(gunler[d].filter(o=>o.yon==='cikis').reduce((a,o)=>a+o.tutar,0))+'</span></td></tr>'+rows+'<tr class="kd-son"><td colspan="3">Gün Sonu Bakiyesi <span style="font-weight:400;color:var(--slate-400)">→ ertesi güne devir</span></td><td class="num">'+fmtP(run)+'</td><td></td></tr></tbody>';
  }).join('');
  return `<div class="fin-bar">
    <select onchange="kasaAy=this.value;render()">${aylar.map(a=>'<option value="'+a+'" '+(a===kasaAy?'selected':'')+'>'+AYLAR[+a.slice(5,7)-1]+' '+a.slice(0,4)+'</option>').join('')||'<option>'+AYLAR[+bugun().slice(5,7)-1]+'</option>'}</select>
    <button class="btn btn-sm btn-pri2" onclick="kasaEkleModal()">+ Hareket Ekle</button>
    <span style="margin-left:auto;font-size:11px;color:var(--slate-400)">Açılış: ${fmtP0(DB.meta.acilisBakiye)} · ${fmtDate(DB.meta.acilisTarih)}</span>
  </div>
  <div class="kpis2">
    ${kpi('Ay Başı Devir',fmtP0(ayBasiDevir),'önceki günlerden')}
    ${kpi('Ay Girişi',fmtP0(girisT),'','g')}${kpi('Ay Çıkışı',fmtP0(cikisT),'','r')}
    ${kpi('Güncel Bakiye',fmtP0(sonBakiye),'son gün sonu',sonBakiye>=0?'g':'r')}
  </div>
  <div class="card"><div class="card-h2">Kasa Defteri — ${AYLAR[+kasaAy.slice(5,7)-1]} ${kasaAy.slice(0,4)} <span class="card-h2s">her günün son bakiyesi ertesi günün açılışıdır</span></div>
  <div style="overflow-x:auto"><table class="ftbl"><thead><tr><th>Kategori</th><th>Açıklama</th><th class="num">Tutar</th><th class="num">Bakiye</th><th></th></tr></thead>
  ${gunBlok||'<tbody><tr><td colspan="5" class="empty">Bu ayda hareket yok</td></tr></tbody>'}</table></div></div>`;
}
function kasaEkleModal(){
  mmOpen(`<div class="mm-t">Kasa Hareketi Ekle</div>
  <div class="mm-g2"><div class="fld"><label>Yön</label><select id="m_yon"><option value="giris">Giriş (para girdi)</option><option value="cikis">Çıkış (para çıktı)</option></select></div>
  <div class="fld"><label>Tarih</label><input type="date" id="m_tarih" value="${bugun()}"></div></div>
  <div class="mm-g2"><div class="fld"><label>Tutar ₺</label><input type="number" id="m_tutar" min="0" step="0.01"></div>
  <div class="fld"><label>Banka (ops.)</label><select id="m_banka">${bankaOpts('')}</select></div></div>
  <div class="fld"><label>Kategori</label><input id="m_kat" list="katList" placeholder="Örn: Fabrika Gideri"><datalist id="katList">${[...DB.girisKat.map(k=>k.ad),...DB.cikisKat.map(k=>k.ad),'POS Komisyonu','DBS Tahsilatı','Diğer'].map(a=>'<option>'+esc(a)+'</option>').join('')}</datalist></div>
  <div class="fld"><label>Açıklama <span class="mm-hint">— ne girdi / nereden · ne çıktı / nereye</span></label><input id="m_ac" placeholder="Örn: X firmasından havale"></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="kasaKaydet()">Kaydet</button></div>`);
}
function kasaKaydet(){
  const t=+mmV('m_tutar');if(!(t>0)){toast('Tutar giriniz');return;}
  if(!mmV('m_kat')){toast('Kategori giriniz');return;}
  hareketEkle({tarih:mmV('m_tarih')||bugun(),yon:mmV('m_yon'),tutar:t,kat:mmV('m_kat'),banka:mmV('m_banka'),aciklama:mmV('m_ac'),kaynak:'manuel'});
  saveDB();mmClose();render();toast('Hareket eklendi');
}
function kasaSil(id){if(!confirm('Bu hareket silinsin mi?'))return;DB.hareketler=DB.hareketler.filter(h=>h.id!==id);saveDB();render();}

// ============================================================
// ALACAKLAR — siparişten otomatik; tahsilat kasaya işler
// ============================================================
function renderAlacak(){
  if(!_SIP){sipYukle().then(()=>render());return '<div class="card"><div class="empty">Siparişler yükleniyor…</div></div>';}
  const list=alacakSiparisleri().map(o=>{
    const tahsil=tahsilEdilen(o.id),kalan=Math.max(0,(+o.total)-tahsil);
    const vade=o.odeme||'';
    const gecikti=kalan>0&&vade&&vade<bugun();
    return {o,tahsil,kalan,vade,gecikti};
  }).sort((a,b)=>(a.kalan>0?0:1)-(b.kalan>0?0:1)||(a.vade||'9999').localeCompare(b.vade||'9999'));
  const topAlacak=list.reduce((s,x)=>s+x.kalan,0);
  const topGecik=list.filter(x=>x.gecikti).reduce((s,x)=>s+x.kalan,0);
  const hafta=addIsGunu(bugun(),5);
  const topHafta=list.filter(x=>x.kalan>0&&x.vade&&x.vade>=bugun()&&x.vade<=hafta).reduce((s,x)=>s+x.kalan,0);
  const rows=list.map(x=>{
    const o=x.o;
    const durum=x.kalan<=0?'<span class="fb fb-g">Tahsil edildi</span>'
      :(x.gecikti?'<span class="fb fb-r">'+gecikmeGun(x.vade)+' gün gecikti</span>'
      :(x.tahsil>0?'<span class="fb fb-a">Kısmi · kalan '+fmtP0(x.kalan)+'</span>':'<span class="fb fb-s">Bekliyor</span>'));
    const oto=DB.tahsilatlar.some(t=>t.orderId===o.id&&t.oto);
    return '<tr'+(x.gecikti?' style="background:#FEF6F6"':'')+'><td><b>#'+esc(o.no)+'</b></td><td>'+fmtDate(o.date)+'</td><td><b>'+esc(o.customer)+'</b>'+(oto?' <span class="kd-src">peşin·oto</span>':'')+'</td><td class="num">'+fmtP(o.total)+'</td><td>'+(x.vade?fmtDate(x.vade):'—')+'</td><td class="num" style="color:var(--green-700)">'+(x.tahsil?fmtP(x.tahsil):'—')+'</td><td class="num"><b>'+(x.kalan?fmtP(x.kalan):'—')+'</b></td><td>'+durum+'</td><td>'+(x.kalan>0?'<button class="btn btn-sm btn-pri2" onclick="tahsilatModal(\''+o.id+'\')">Tahsilat Al</button>':'')+'</td></tr>';
  }).join('');
  return `<div class="fin-bar">
    <button class="btn btn-sm" onclick="sipYukle(true).then(()=>render())">Siparişleri Yenile</button>
    <span style="margin-left:auto;font-size:11px;color:var(--slate-400)">Takip başlangıcı: ${fmtDate(DB.ayarlar.alacakBaslangic)} (Ayarlar'dan değişir) · sipariş verildiğinde fatura tutarı otomatik alacağa düşer</span>
  </div>
  <div class="kpis2">
    ${kpi('Toplam Alacak',fmtP0(topAlacak),list.filter(x=>x.kalan>0).length+' açık fatura')}
    ${kpi('Vadesi Geçmiş',fmtP0(topGecik),'','r')}
    ${kpi('Bu Hafta Beklenen',fmtP0(topHafta),'5 iş günü içinde vadesi gelen','g')}
  </div>
  <div class="card"><div class="card-h2">Alacak Takibi <span class="card-h2s">peşin siparişler otomatik kasaya işlenir</span></div>
  <div style="overflow-x:auto"><table class="ftbl"><thead><tr><th>No</th><th>Sipariş</th><th>Müşteri / Bayi</th><th class="num">Fatura</th><th>Vade</th><th class="num">Tahsil</th><th class="num">Kalan</th><th>Durum</th><th></th></tr></thead><tbody>
  ${rows||'<tr><td colspan="9" class="empty">Takip başlangıcından bu yana sipariş yok</td></tr>'}</tbody></table></div></div>`;
}
function tahsilatModal(orderId){
  const o=_SIP.orders.find(x=>x.id===orderId);if(!o)return;
  const kalan=Math.max(0,(+o.total)-tahsilEdilen(orderId));
  mmOpen(`<div class="mm-t">Tahsilat Al — #${esc(o.no)} ${esc(o.customer)}</div>
  <div class="mm-g2"><div class="fld"><label>Tutar ₺ <span class="mm-hint">kalan: ${fmtP(kalan)}</span></label><input type="number" id="m_tutar" value="${kalan}" min="0" step="0.01"></div>
  <div class="fld"><label>Tahsilat Tarihi</label><input type="date" id="m_tarih" value="${bugun()}"></div></div>
  <div class="mm-g2"><div class="fld"><label>Yöntem</label><select id="m_yontem">${yontemOpts('Havale / EFT')}</select></div>
  <div class="fld"><label>Banka (ops.)</label><select id="m_banka">${bankaOpts('')}</select></div></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="tahsilatKaydet('${orderId}')">Kasaya İşle</button></div>`);
}
function tahsilatKaydet(orderId){
  const o=_SIP.orders.find(x=>x.id===orderId);if(!o)return;
  const t=+mmV('m_tutar');if(!(t>0)){toast('Tutar giriniz');return;}
  const tarih=mmV('m_tarih')||bugun(),yontem=mmV('m_yontem');
  DB.tahsilatlar.push({id:fuid('t'),orderId:o.id,orderNo:o.no,musteri:o.customer,tutar:t,tarih,yontem,oto:false,ts:new Date().toISOString()});
  hareketEkle({tarih,yon:'giris',tutar:t,kat:'Alacak Tahsilatı',banka:mmV('m_banka'),aciklama:'#'+o.no+' '+o.customer+' · '+yontem,kaynak:'tahsilat',ref:''});
  saveDB();mmClose();render();toast('Tahsilat kasaya işlendi');
}

// ============================================================
// BORÇLAR — ödendi/ödenmedi, yöntem, gecikme, devir, not
// ============================================================
function renderBorc(){
  const t=bugun();
  const acik=(DB.odemeler||[]).filter(o=>!o.odendi).sort((a,b)=>a.tarih.localeCompare(b.tarih));
  const gecikmis=acik.filter(o=>o.tarih<t);
  const bugunkuler=acik.filter(o=>o.tarih===t);
  const gelecek=acik.filter(o=>o.tarih>t);
  const odenmis=(DB.odemeler||[]).filter(o=>o.odendi).sort((a,b)=>(b.odemeTarihi||b.tarih).localeCompare(a.odemeTarihi||a.tarih)).slice(0,20);
  const row=(o,gec)=>'<tr'+(gec?' style="background:#FEF6F6"':'')+'><td><b>'+esc(o.ad)+'</b>'+(o.not?'<div class="borc-not">'+esc(o.not)+'</div>':'')+'</td><td>'+esc(o.kat||'—')+'</td><td>'+fmtDate(o.tarih)+(gec?'<div class="fb fb-r" style="margin-top:3px">'+gecikmeGun(o.tarih)+' gün gecikti</div>':'')+'</td><td class="num"><b>'+fmtP(o.tutar)+'</b></td><td>'
    +(o.odendi?'<span class="fb fb-g">Ödendi</span><div style="font-size:10.5px;color:var(--slate-400);margin-top:2px">'+fmtDate(o.odemeTarihi)+' · '+esc(o.odemeYontemi||'')+'</div>':'<span class="fb fb-s">Ödenmedi</span>')
    +'</td><td style="white-space:nowrap">'
    +(o.odendi?'':'<button class="btn btn-sm btn-pri2" onclick="borcOdeModal(\''+o.id+'\')">Ödendi</button> <button class="btn btn-sm" onclick="borcNotModal(\''+o.id+'\')" title="Hatırlatma notu">Not</button> ')
    +'<button class="btn btn-sm" onclick="borcDuzenleModal(\''+o.id+'\')">Düzenle</button></td></tr>';
  const blok=(baslik,liste,gec,altText)=>liste.length?'<div class="card" style="margin-bottom:14px"><div class="card-h2">'+baslik+(altText?' <span class="card-h2s">'+altText+'</span>':'')+'</div><div style="overflow-x:auto"><table class="ftbl"><thead><tr><th>Kime</th><th>Kategori</th><th>Vade</th><th class="num">Tutar</th><th>Durum</th><th></th></tr></thead><tbody>'+liste.map(o=>row(o,gec)).join('')+'</tbody></table></div></div>':'';
  return `<div class="fin-bar"><button class="btn btn-sm btn-pri2" onclick="borcDuzenleModal('')">+ Borç Ekle</button>
    <span style="margin-left:auto;font-size:11px;color:var(--slate-400)">ödenmeyen borç ertesi güne otomatik devreder ve gecikme süresi işler</span></div>
  <div class="kpis2">
    ${kpi('Açık Borç',fmtP0(acik.reduce((s,o)=>s+(+o.tutar||0),0)),acik.length+' kalem')}
    ${kpi('Gecikmiş',fmtP0(gecikmis.reduce((s,o)=>s+(+o.tutar||0),0)),gecikmis.length+' kalem','r')}
    ${kpi('Bugün Ödenecek',fmtP0(bugunkuler.reduce((s,o)=>s+(+o.tutar||0),0)),'','a')}
  </div>
  ${blok('Gecikmiş Borçlar — bugüne devretti',gecikmis,true,'kime ait ve kaç gün geciktiği')}
  ${blok('Bugün Ödenecekler',bugunkuler,false,'')}
  ${blok('Yaklaşan Borçlar',gelecek,false,'')}
  ${blok('Ödenenler (son 20)',odenmis,false,'kasadan düşüldü')}
  ${!(DB.odemeler||[]).length?'<div class="card"><div class="empty">Kayıtlı borç yok</div></div>':''}`;
}
function borcOdeModal(id){
  const o=DB.odemeler.find(x=>x.id===id);if(!o)return;
  mmOpen(`<div class="mm-t">Borç Ödemesi — ${esc(o.ad)}</div>
  <div class="mm-g2"><div class="fld"><label>Ödenen Tutar ₺</label><input type="number" id="m_tutar" value="${o.tutar}" step="0.01"></div>
  <div class="fld"><label>Ödeme Tarihi</label><input type="date" id="m_tarih" value="${bugun()}"></div></div>
  <div class="mm-g2"><div class="fld"><label>Nasıl Ödendi</label><select id="m_yontem">${yontemOpts('Havale / EFT')}</select></div>
  <div class="fld"><label>Banka (ops.)</label><select id="m_banka">${bankaOpts('')}</select></div></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="borcOdeKaydet('${id}')">Ödendi — Kasadan Düş</button></div>`);
}
function borcOdeKaydet(id){
  const o=DB.odemeler.find(x=>x.id===id);if(!o)return;
  const t=+mmV('m_tutar');if(!(t>0)){toast('Tutar giriniz');return;}
  o.odendi=true;o.odemeTarihi=mmV('m_tarih')||bugun();o.odemeYontemi=mmV('m_yontem');o.tutar=t;
  hareketEkle({tarih:o.odemeTarihi,yon:'cikis',tutar:t,kat:o.kat&&o.tarih<o.odemeTarihi?'Gecikmiş Borç':'Borç Ödemesi',banka:mmV('m_banka'),aciklama:o.ad+' · '+o.odemeYontemi+(o.kat?' · '+o.kat:''),kaynak:'borc',ref:'borc_'+o.id});
  saveDB();mmClose();render();toast('Ödeme kasadan düşüldü');
}
function borcNotModal(id){
  const o=DB.odemeler.find(x=>x.id===id);if(!o)return;
  mmOpen(`<div class="mm-t">Hatırlatma Notu — ${esc(o.ad)}</div>
  <div class="fld"><label>Not</label><textarea id="m_not" rows="3" placeholder="Örn: Banka aranacak, ek süre istendi...">${esc(o.not||'')}</textarea></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="(function(){const o=DB.odemeler.find(x=>x.id==='${id}');o.not=mmV('m_not');saveDB();mmClose();render();toast('Not kaydedildi');})()">Kaydet</button></div>`);
}
function borcDuzenleModal(id){
  const o=id?DB.odemeler.find(x=>x.id===id):{ad:'',kat:'',tarih:bugun(),tutar:'',not:''};
  mmOpen(`<div class="mm-t">${id?'Borç Düzenle':'Yeni Borç'}</div>
  <div class="fld"><label>Kime / Ne</label><input id="m_ad" value="${esc(o.ad)}" placeholder="Örn: Kuveyttürk Kredi Taksiti"></div>
  <div class="mm-g2"><div class="fld"><label>Kategori</label><input id="m_kat" value="${esc(o.kat||'')}" list="borcKat" placeholder="Kredi / Taksit / Fatura..."><datalist id="borcKat">${['Kredi','Taksit','Kredi Kartı','Vergi','SGK','Tedarikçi','Fatura','Diğer'].map(x=>'<option>'+x+'</option>').join('')}</datalist></div>
  <div class="fld"><label>Vade</label><input type="date" id="m_tarih" value="${o.tarih}"></div></div>
  <div class="fld"><label>Tutar ₺</label><input type="number" id="m_tutar" value="${o.tutar}" step="0.01"></div>
  <div class="fld"><label>Not (ops.)</label><input id="m_not" value="${esc(o.not||'')}"></div>
  <div class="mm-ft">${id?'<button class="btn btn-sm" style="color:var(--red-600);margin-right:auto" onclick="if(confirm(\'Silinsin mi?\')){DB.odemeler=DB.odemeler.filter(x=>x.id!==\''+id+'\');saveDB();mmClose();render();}">Sil</button>':''}
  <button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="borcKaydet('${id||''}')">Kaydet</button></div>`);
}
function borcKaydet(id){
  const ad=mmV('m_ad');const t=+mmV('m_tutar');
  if(!ad||!(t>0)){toast('Ad ve tutar giriniz');return;}
  if(id){const o=DB.odemeler.find(x=>x.id===id);Object.assign(o,{ad,kat:mmV('m_kat'),tarih:mmV('m_tarih')||bugun(),tutar:t,not:mmV('m_not')});}
  else DB.odemeler.push({id:fuid('o'),ad,kat:mmV('m_kat'),tarih:mmV('m_tarih')||bugun(),tutar:t,odendi:false,odemeTarihi:'',odemeYontemi:'',not:mmV('m_not')});
  saveDB();mmClose();render();toast('Kaydedildi');
}

// ============================================================
// POS — banka, komisyon; hesaba geçişte brüt giriş + komisyon gideri
// ============================================================
function renderPos(){
  const bekleyen=DB.poslar.filter(p=>p.durum==='bekliyor');
  const buAy=bugun().slice(0,7);
  const ayKom=DB.poslar.filter(p=>p.durum==='gecti'&&p.hesabaGecis.slice(0,7)===buAy).reduce((s,p)=>s+(+p.komisyon||0),0);
  const rows=DB.poslar.slice().sort((a,b)=>b.tahsilatTarihi.localeCompare(a.tahsilatTarihi)).slice(0,60).map(p=>'<tr><td><b>'+esc(p.banka||'—')+'</b></td><td class="num">'+fmtP(p.brut)+'</td><td class="num">%'+p.oran+'</td><td class="num" style="color:var(--red-600)">−'+fmtP(p.komisyon)+'</td><td class="num" style="color:var(--green-700)"><b>'+fmtP(p.net)+'</b></td><td>'+fmtDate(p.tahsilatTarihi)+'</td><td>'+fmtDate(p.hesabaGecis)+'</td><td>'+(p.durum==='gecti'?'<span class="fb fb-g">Hesaba geçti</span>':'<span class="fb fb-a">Bekliyor</span>')+'</td><td>'+(p.durum==='bekliyor'?'<button class="kd-del" onclick="posSil(\''+p.id+'\')">✕</button>':'')+'</td></tr>').join('');
  return `<div class="fin-bar"><button class="btn btn-sm btn-pri2" onclick="posModal()">+ POS Tahsilatı</button>
    <span style="margin-left:auto;font-size:11px;color:var(--slate-400)">hesaba geçiş günü gelince brüt gelir + komisyon gideri otomatik kasaya işlenir</span></div>
  <div class="kpis2">
    ${kpi('Hesaba Geçmesi Beklenen',fmtP0(bekleyen.reduce((s,p)=>s+(+p.net||0),0)),bekleyen.length+' işlem','a')}
    ${kpi('Bu Ay POS Komisyonu',fmtP0(ayKom),'gider','r')}
  </div>
  <div class="card"><div class="card-h2">POS Tahsilatları</div>
  <div style="overflow-x:auto"><table class="ftbl"><thead><tr><th>Banka</th><th class="num">Brüt</th><th class="num">Oran</th><th class="num">Komisyon</th><th class="num">Net</th><th>Tahsilat</th><th>Hesaba Geçiş</th><th>Durum</th><th></th></tr></thead><tbody>
  ${rows||`<tr><td colspan="9" class="empty">POS kaydı yok — bankaları Ayarlar sekmesinden tanımlayın</td></tr>`}</tbody></table></div></div>`;
}
function posModal(){
  mmOpen(`<div class="mm-t">POS Tahsilatı</div>
  <div class="mm-g2"><div class="fld"><label>Banka</label><select id="m_banka" onchange="posOranDoldur()">${bankaOpts('')}</select></div>
  <div class="fld"><label>Komisyon Oranı %</label><input type="number" id="m_oran" step="0.01" min="0" placeholder="örn: 2,5"></div></div>
  <div class="mm-g2"><div class="fld"><label>Brüt Tutar ₺</label><input type="number" id="m_brut" step="0.01" oninput="posOzet()"></div>
  <div class="fld"><label>Tahsilat Tarihi</label><input type="date" id="m_tarih" value="${bugun()}" onchange="posGecisOner()"></div></div>
  <div class="fld"><label>Hesaba Geçiş Tarihi</label><input type="date" id="m_gecis" value="${addIsGunu(bugun(),1)}"></div>
  <div id="posOzet" class="pos-ozet"></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="posKaydet()">Kaydet</button></div>`);
}
function posOranDoldur(){const b=(DB.ayarlar.bankalar||[]).find(x=>x.ad===mmV('m_banka'));if(b&&b.posOran!=null)document.getElementById('m_oran').value=b.posOran;posOzet();}
function posGecisOner(){const t=mmV('m_tarih');if(t)document.getElementById('m_gecis').value=addIsGunu(t,1);}
function posOzet(){
  const brut=+mmV('m_brut')||0,oran=+String(mmV('m_oran')).replace(',','.')||0;
  const komisyon=Math.round(brut*oran/100*100)/100;
  document.getElementById('posOzet').innerHTML=brut>0?('Komisyon (gider): <b style="color:var(--red-600)">−'+fmtP(komisyon)+'</b> · Hesaba geçecek net (gelir): <b style="color:var(--green-700)">'+fmtP(brut-komisyon)+'</b>'):'';
}
function posKaydet(){
  const brut=+mmV('m_brut'),oran=+String(mmV('m_oran')).replace(',','.')||0;
  if(!(brut>0)){toast('Brüt tutar giriniz');return;}
  const komisyon=Math.round(brut*oran/100*100)/100;
  DB.poslar.push({id:fuid('p'),banka:mmV('m_banka'),brut,oran,komisyon,net:Math.round((brut-komisyon)*100)/100,tahsilatTarihi:mmV('m_tarih')||bugun(),hesabaGecis:mmV('m_gecis')||bugun(),durum:'bekliyor',ts:new Date().toISOString()});
  saveDB();mmClose();autoEngine().then(()=>render());toast('POS kaydı eklendi');
}
function posSil(id){if(!confirm('Silinsin mi?'))return;DB.poslar=DB.poslar.filter(p=>p.id!==id);saveDB();render();}

// ============================================================
// DBS — vade + iş günü sonra kesintisiz otomatik gelir
// ============================================================
function renderDbs(){
  const bekleyen=DB.dbsler.filter(d=>d.durum==='bekliyor');
  const rows=DB.dbsler.slice().sort((a,b)=>a.hesapTarihi.localeCompare(b.hesapTarihi)).map(d=>'<tr><td><b>'+esc(d.firma)+'</b></td><td class="num">'+fmtP(d.tutar)+'</td><td>'+fmtDate(d.vade)+'</td><td class="num">'+d.isGunu+' iş günü</td><td><b>'+fmtDate(d.hesapTarihi)+'</b></td><td>'+esc(d.banka||'—')+'</td><td>'+(d.durum==='gecti'?'<span class="fb fb-g">Hesaba geçti</span>':'<span class="fb fb-a">Bekliyor</span>')+'</td><td>'+(d.durum==='bekliyor'?'<button class="kd-del" onclick="dbsSil(\''+d.id+'\')">✕</button>':'')+'</td></tr>').join('');
  return `<div class="fin-bar"><button class="btn btn-sm btn-pri2" onclick="dbsModal()">+ DBS Kaydı</button>
    <span style="margin-left:auto;font-size:11px;color:var(--slate-400)">DBS: vade + iş günü sonunda banka kesintisiz öder — gün gelince otomatik gelir yazılır</span></div>
  <div class="kpis2">${kpi('DBS Beklenen',fmtP0(bekleyen.reduce((s,d)=>s+(+d.tutar||0),0)),bekleyen.length+' kayıt','a')}</div>
  <div class="card"><div class="card-h2">DBS Kayıtları</div>
  <div style="overflow-x:auto"><table class="ftbl"><thead><tr><th>Firma</th><th class="num">Fatura Tutarı</th><th>Vade</th><th class="num">Süre</th><th>Hesaba Geçecek</th><th>Banka</th><th>Durum</th><th></th></tr></thead><tbody>
  ${rows||'<tr><td colspan="8" class="empty">DBS kaydı yok</td></tr>'}</tbody></table></div></div>`;
}
function dbsModal(){
  const g=DB.ayarlar.dbsGun||5;
  mmOpen(`<div class="mm-t">DBS Kaydı</div>
  <div class="fld"><label>Firma</label><input id="m_firma" placeholder="Bayi / firma adı"></div>
  <div class="mm-g2"><div class="fld"><label>Fatura Tutarı ₺</label><input type="number" id="m_tutar" step="0.01"></div>
  <div class="fld"><label>Vade</label><input type="date" id="m_vade" value="${bugun()}" onchange="dbsHesapla()"></div></div>
  <div class="mm-g2"><div class="fld"><label>Vade Sonrası Süre</label><select id="m_gun" onchange="dbsHesapla()">${[1,2,3,4,5,6,7,8,9,10].map(n=>'<option value="'+n+'" '+(n===g?'selected':'')+'>'+n+' iş günü</option>').join('')}</select></div>
  <div class="fld"><label>Banka (ops.)</label><select id="m_banka">${bankaOpts('')}</select></div></div>
  <div id="dbsOzet" class="pos-ozet"></div>
  <div class="mm-ft"><button class="btn btn-sm" onclick="mmClose()">Vazgeç</button><button class="btn btn-sm btn-pri2" onclick="dbsKaydet()">Kaydet</button></div>`);
  dbsHesapla();
}
function dbsHesapla(){
  const v=mmV('m_vade'),g=+mmV('m_gun')||5;
  if(v)document.getElementById('dbsOzet').innerHTML='Hesaba geçecek tarih: <b>'+fmtDate(addIsGunu(v,g))+'</b> · kesinti yok, tam tutar gelir yazılır';
}
function dbsKaydet(){
  const firma=mmV('m_firma'),t=+mmV('m_tutar'),v=mmV('m_vade'),g=+mmV('m_gun')||5;
  if(!firma||!(t>0)||!v){toast('Firma, tutar ve vade giriniz');return;}
  DB.dbsler.push({id:fuid('d'),firma,tutar:t,vade:v,isGunu:g,hesapTarihi:addIsGunu(v,g),banka:mmV('m_banka'),durum:'bekliyor',ts:new Date().toISOString()});
  saveDB();mmClose();autoEngine().then(()=>render());toast('DBS kaydı eklendi');
}
function dbsSil(id){if(!confirm('Silinsin mi?'))return;DB.dbsler=DB.dbsler.filter(d=>d.id!==id);saveDB();render();}

// ============================================================
// AYARLAR — bankalar, DBS günü, alacak takip başlangıcı
// ============================================================
function renderAyar(){
  const rows=(DB.ayarlar.bankalar||[]).map((b,i)=>'<tr><td><input value="'+esc(b.ad)+'" onchange="DB.ayarlar.bankalar['+i+'].ad=this.value;saveDB()" style="width:170px"></td><td><input type="number" step="0.01" value="'+(b.posOran==null?'':b.posOran)+'" onchange="DB.ayarlar.bankalar['+i+'].posOran=+this.value;saveDB()" style="width:90px;text-align:right"></td><td><button class="kd-del" onclick="if(confirm(\'Silinsin mi?\')){DB.ayarlar.bankalar.splice('+i+',1);saveDB();render();}">✕</button></td></tr>').join('');
  return `<div class="kpis2" style="grid-template-columns:1fr"></div>
  <div class="card" style="margin-bottom:14px"><div class="card-h2">Bankalar <span class="card-h2s">POS komisyon oranı banka seçilince otomatik gelir</span></div>
  <div style="padding:14px 18px"><table class="ftbl"><thead><tr><th>Banka Adı</th><th>POS Komisyon %</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="empty">Banka tanımlanmadı</td></tr>'}</tbody></table>
  <button class="btn btn-sm btn-pri2" style="margin-top:10px" onclick="DB.ayarlar.bankalar.push({ad:'',posOran:0});saveDB();render()">+ Banka Ekle</button></div></div>
  <div class="card"><div class="card-h2">Genel</div><div style="padding:14px 18px;display:flex;gap:26px;flex-wrap:wrap;font-size:13px">
    <label style="display:flex;flex-direction:column;gap:5px"><b>DBS varsayılan süre</b><select onchange="DB.ayarlar.dbsGun=+this.value;saveDB();toast('Kaydedildi')">${[1,2,3,4,5,6,7,8,9,10].map(n=>'<option value="'+n+'" '+(n===(DB.ayarlar.dbsGun||5)?'selected':'')+'>'+n+' iş günü</option>').join('')}</select></label>
    <label style="display:flex;flex-direction:column;gap:5px"><b>Alacak takip başlangıcı</b><input type="date" value="${DB.ayarlar.alacakBaslangic}" onchange="DB.ayarlar.alacakBaslangic=this.value;saveDB();toast('Kaydedildi')"><span style="font-size:11px;color:var(--slate-400)">Bu tarihten önceki siparişler alacak listesine girmez.<br>Peşin-otomatik kayıtlar da bu tarihten itibaren işler.</span></label>
  </div></div>`;
}

// ---------- init ----------
async function finansInit(){
  if(_finansHazir)return;_finansHazir=true;
  finansMigrate();
  await autoEngine();
  render();
}
const _showAppEski=showApp;
showApp=function(){_showAppEski();finansInit();};
// Sayfa bu script yüklenmeden önce açıldıysa (ör. kayıtlı oturum) motoru yine başlat
if(document.getElementById('app')&&!document.getElementById('app').classList.contains('hidden'))finansInit();
