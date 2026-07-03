// ============================================================
// ROTA SMI · Kurumsal Arama ("site içi Google")
// Kapsam: sipariş, müşteri, bayi & danışman, ürün fiyatları,
//         tonaj/üretim, komisyon & iskonto hakedişleri, İK izin.
// Muhasebe & Finans verileri KAPALIDIR (aşağıdaki YASAK listesi).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8",authDomain:"rota-yem.firebaseapp.com",projectId:"rota-yem",storageBucket:"rota-yem.firebasestorage.app",messagingSenderId:"186408871052",appId:"1:186408871052:web:65791c132b2c1b525307a9"};
const app=initializeApp(firebaseConfig), db=getFirestore(app);

// ---------- yardımcılar ----------
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtN=n=>(+n||0).toLocaleString('tr-TR',{maximumFractionDigits:2});
const fmtTL=n=>'₺'+(+n||0).toLocaleString('tr-TR',{maximumFractionDigits:0});
const fmtTon=t=>(+t||0).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1});
const fmtDate=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));return m?(m[3]+'.'+m[2]+'.'+m[1]):'—'};
const AYLAR=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
const AYLAR_TR=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
// Türkçe normalize: küçük harf + diakritik düzleştirme
function norm(s){return String(s||'').toLocaleLowerCase('tr-TR')
  .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
  .replace(/['’´`"]/g,' ').replace(/[^a-z0-9#\s-]/g,' ').replace(/\s+/g,' ').trim();}
const STOP=new Set(['ne','kac','kaç','kadar','hangi','var','mi','mu','mı','kim','kimin','gun','gün','su','şu','bu','o','ve','ile','icin','en','ay','yil','the','a','de','da','ki','neydi','nedir','olan','simdi','an','su an','miydi','acaba','bana','bize','goster','soyle','listele','ver','bul']);
function tokensOf(q){return norm(q).split(' ').filter(t=>t.length>=2&&!STOP.has(t));}
// isim eşleştirme: sorgu tokenlarının kaçı isim tokenlarıyla (önek) örtüşüyor
function nameScore(name,qtoks){
  const nt=norm(name).split(' ').filter(Boolean);if(!nt.length)return 0;
  let hit=0;
  qtoks.forEach(qt=>{if(qt.length<3)return;if(nt.some(n=>n.startsWith(qt)||(qt.startsWith(n)&&n.length>=3)))hit++;});
  return hit;
}
function bestMatch(list,nameOf,qtoks,minScore){
  let best=null,bs=0;
  list.forEach(x=>{const s=nameScore(nameOf(x),qtoks);if(s>bs){bs=s;best=x;}});
  return bs>=(minScore||1)?{item:best,score:bs}:null;
}

// ---------- veri katmanı (lazy + cache) ----------
let CACHE=null;
async function loadData(){
  if(CACHE)return CACHE;
  const read=async(id,key)=>{try{const s=await getDoc(doc(db,'apps',id));const d=s.exists()?s.data().data:null;return d&&d[key]?JSON.parse(d[key]):null;}catch(e){return null;}};
  // DİKKAT: apps/muhasebe bilinçli olarak OKUNMAZ — finans verileri aramaya kapalıdır.
  const [so,saha,ik]=await Promise.all([read('siparis','rota_so_v1'),read('saha','rota_saha_v1'),read('ik','rota_ik_v1')]);
  CACHE={
    orders:(so&&so.orders)||[],customers:(so&&so.customers)||[],products:(so&&so.products)||[],
    priceLists:(so&&so.priceLists)||[],meta:(so&&so.meta)||{},odemeler:(so&&so.komisyonOdemeler)||[],
    koms:(saha&&saha.komisyoncular)||(so&&so.komisyoncular)||[],
    personeller:(ik&&ik.personeller)||[],izinler:(ik&&ik.izinler)||[],izinBakiye:(ik&&ik.izinBakiye)||[],
  };
  return CACHE;
}

// ---------- hesap portları (siparis-takip ile birebir) ----------
const D=()=>CACHE;
const prodByCode=c=>D().products.find(p=>norm(p.code)===norm(c))||null;
const komById=id=>D().koms.find(k=>k.id===id)||null;
const activePL=()=>D().priceLists.find(p=>p.id===D().meta.activePriceListId)||D().priceLists[D().priceLists.length-1]||null;
const plById=id=>id?(D().priceLists.find(p=>p.id===id)||null):null;
const orderPL=o=>plById(o&&o.priceListId)||activePL();
function tariffPrice(pl,code,kad){if(!pl||!code)return 0;const it=(pl.items||[]).find(x=>norm(x.code)===norm(code));return it?(+it[kad||'fabrika']||0):0;}
function prodKg(code){const p=prodByCode(code);const m=/([\d.,]+)\s*kg/i.exec((p&&p.pkg)||'');const kg=m?parseFloat(m[1].replace(',','.')):25;return kg>0?kg:25;}
const tonOf=(code,qty)=>(+qty||0)*prodKg(code)/1000;
function lineUnit(l,kad){if(l.price==='')return 0;if(l.price!=null)return +l.price||0;const p=prodByCode(l.code);return p?(+p[kad||'fabrika']||0):0;}
function orderTotal(o){if(o.lines&&o.lines.length){let t=0;o.lines.forEach(l=>{t+=(+l.qty||0)*lineUnit(l,o.fiyatKademe);});return t||o.total||0;}return o.total||0;}
function orderListTotal(o){if(o.lines&&o.lines.length){const pl=orderPL(o);let t=0;o.lines.forEach(l=>{const lp=tariffPrice(pl,l.code,o.fiyatKademe)||lineUnit(l,o.fiyatKademe);t+=(+l.qty||0)*lp;});return t||o.total||0;}return o.total||0;}
function ordBayi(o){let id=o&&o.bayiId;if(!id&&o&&o.komisyoncuId){const k=komById(o.komisyoncuId);if(k&&k.type==='bayi')id=o.komisyoncuId;}return id?komById(id):null;}
function ordDanisman(o){let id=o&&o.danismanId;if(!id&&o&&o.komisyoncuId){const k=komById(o.komisyoncuId);if(k&&k.type==='danisman')id=o.komisyoncuId;}return id?komById(id):null;}
function orderKomisyon(o,kom){
  if(!o||!kom)return {tutar:0};
  const isk=(D().meta&&D().meta.tdIskonto)||6;
  if(kom.type==='danisman'){
    let prim=0;
    if(o.aliciBayi){
      const bayi=ordBayi(o);if(!bayi)return {tutar:0};
      const bRate=(o.komisyonRate!=null&&o.komisyonRate!=='')?+o.komisyonRate:(+bayi.rate||0);
      const pl=orderPL(o);
      (o.lines||[]).forEach(l=>{
        const p=prodByCode(l.code);
        const fab=tariffPrice(pl,l.code,'fabrika')||(p?(+p.fabrika||0):0);
        const torb=tariffPrice(pl,l.code,'danismanListe')||(p?(+p.danismanListe||0):0);
        if(fab>0&&torb>0)prim+=(fab*(1-bRate/100)-torb*(1-isk/100))*(+l.qty||0);
      });
      return {tutar:prim,viaBayi:true};
    }
    (o.lines||[]).forEach(l=>{
      const p=prodByCode(l.code);const liste=p?(+p.danismanListe||0):0;
      const satis=lineUnit(l,o.fiyatKademe);
      if(satis>0)prim+=(satis-liste*(1-isk/100))*(+l.qty||0);
    });
    return {tutar:prim-(+o.nakliye||0)};
  }
  const rate=(o.komisyonRate!=null&&o.komisyonRate!=='')?+o.komisyonRate:(+kom.rate||0);
  if(o.aliciBayi)return {tutar:0};
  return {tutar:orderListTotal(o)*(rate/100),rate};
}
function bayiLedger(bayiId){
  const os=D().orders.filter(o=>{const b=ordBayi(o);return b&&b.id===bayiId;})
    .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||'').localeCompare(b.createdAt||''));
  let bal=0,kaz=0,mah=0;
  os.forEach(o=>{
    if(o.aliciBayi){
      const tutar=orderTotal(o),avail=bal>0?bal:0;
      let m=(o.iskontoMahsup!==''&&o.iskontoMahsup!=null)?Math.min(+o.iskontoMahsup||0,tutar,avail):Math.min(avail,tutar);
      if(m<0)m=0;bal-=m;mah+=m;
    }else{const r=orderKomisyon(o,ordBayi(o));bal+=r.tutar||0;kaz+=r.tutar||0;}
  });
  return {kazanim:kaz,mahsup:mah,kalan:bal,adet:os.length};
}
function danismanHakedis(danId){
  let hak=0,adet=0;
  D().orders.forEach(o=>{const d=ordDanisman(o);if(d&&d.id===danId){hak+=orderKomisyon(o,d).tutar||0;adet++;}});
  const odenen=D().odemeler.filter(p=>p.komisyoncuId===danId).reduce((s,p)=>s+(+p.odenenTutar||0),0);
  return {hak,odenen,bakiye:hak-odenen,adet};
}
// izin (hr modülü 4857/53 portu)
function yilFark(iso,ref){const d=iso?new Date(iso):null;if(!d||isNaN(d))return 0;const r=ref||new Date();let y=r.getFullYear()-d.getFullYear();const m=r.getMonth()-d.getMonth();if(m<0||(m===0&&r.getDate()<d.getDate()))y--;return y;}
function yillikHakGun(iseGiris,dogum,ref){const k=yilFark(iseGiris,ref);if(k<1)return 0;let g=k<=5?14:(k<15?20:26);if(dogum){const yas=yilFark(dogum,ref);if(yas<18||yas>=50)g=Math.max(g,20);}return g;}
function izinOzet(p,yil){
  const kayit=D().izinler.filter(z=>z.personelId===p.id&&(z.baslangic||'').slice(0,4)===String(yil));
  const kullanilan=kayit.filter(z=>z.tur==='yillik').reduce((s,z)=>s+(+z.gun||0),0);
  const bk=D().izinBakiye.find(x=>x.personelId===p.id&&+x.yil===+yil)||{};
  const devir=+bk.devir||0;
  const hak=(bk.hakEdilen!==''&&bk.hakEdilen!=null)?+bk.hakEdilen:yillikHakGun(p.iseGiris,p.dogum,new Date(yil,11,31));
  return {kullanilan,devir,hak,kalan:devir+hak-kullanilan};
}

// ---------- YASAK: muhasebe & finans ----------
const YASAK=['muhasebe','kasa','banka','cek','senet','nakit','finans','bilanco','tahsilat','borc','kredi','maas','ucret','bordro','avans','iban','vergi','fatura tutari','kar marji','kasa bakiye'];
function yasakMi(q){const n=' '+norm(q)+' ';return YASAK.some(k=>n.includes(' '+k)||n.includes(k+' ')||n.includes(k));}

// ---------- dönem ayrıştırma (tonaj) ----------
function parsePeriod(q){
  const n=norm(q);const now=new Date();
  const yM=/\b(20\d{2})\b/.exec(n);const yil=yM?yM[1]:String(now.getFullYear());
  for(let i=0;i<12;i++){if(n.includes(AYLAR[i]))return {tip:'ay',yil,ay:String(i+1).padStart(2,'0'),lbl:AYLAR_TR[i]+' '+yil};}
  if(n.includes('gecen ay')||n.includes('onceki ay')){const d=new Date(now.getFullYear(),now.getMonth()-1,1);return {tip:'ay',yil:String(d.getFullYear()),ay:String(d.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[d.getMonth()]+' '+d.getFullYear()};}
  if(n.includes('bu ay')){return {tip:'ay',yil:String(now.getFullYear()),ay:String(now.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[now.getMonth()]+' '+now.getFullYear()};}
  if(n.includes('gecen yil')||n.includes('onceki yil'))return {tip:'yil',yil:String(now.getFullYear()-1),lbl:String(now.getFullYear()-1)};
  if(yM)return {tip:'yil',yil,lbl:yil};
  return {tip:'yil',yil:String(now.getFullYear()),lbl:String(now.getFullYear())+' (bu yıl)'};
}

// ---------- kart şablonları ----------
// Tıklanır telefon (tel:) ve Google Haritalar adres bağlantısı
const telLink=p=>p?`<a href="tel:${esc(String(p).replace(/\s/g,''))}" class="ka-tel">${esc(p)}</a>`:'—';
function mapsLink(c){
  const adres=(c.adres||'').trim(), city=(c.city||'').trim();
  const txt=adres||city;if(!txt)return '—';
  const sorgu=encodeURIComponent(adres?(adres+(city?' '+city:'')):city);
  return `<a href="https://www.google.com/maps/search/?api=1&query=${sorgu}" target="_blank" rel="noopener" class="ka-maps" title="Google Haritalar'da aç">${esc(txt)}</a>`;
}
const card=(title,body,tone)=>`<div class="ka-card ${tone||''}"><div class="ka-card-t">${title}</div>${body}</div>`;
const row=(k,v)=>`<div class="ka-row"><span>${esc(k)}</span><b>${v}</b></div>`;
const table=(head,rows)=>`<div class="ka-tblwrap"><table class="ka-tbl"><thead><tr>${head.map(h=>`<th${h.n?' class="n"':''}>${esc(h.t)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;

// ---------- intent işleyicileri ----------
function ansYasak(){
  return card('Erişim Engellendi',`<p class="ka-p">Muhasebe ve finans verileri (kasa, banka, tahsilat, maaş, avans vb.) kurumsal aramaya <b>kapalıdır</b>. Bu bilgiler yalnızca yetkili kullanıcıların erişebildiği <a href="muhasebe/">Muhasebe &amp; Finans</a> modülünde yer alır.</p>`,'ka-red');
}
function ansSiparis(q){
  const m=/#?\b(\d{3,4})\b/.exec(q);if(!m)return null;
  if(!/siparis|#/.test(norm(q))&&!q.includes('#'))return null;
  const o=D().orders.find(x=>String(x.no)===m[1]);if(!o)return null;
  const ST={beklemede:'Beklemede',onay:'Onaylandı',hazir:'Hazırlanıyor',sevk:'Sevk Edildi',teslim:'Teslim Edildi',iptal:'İptal'};
  return card('Sipariş #'+esc(o.no),
    row('Müşteri',esc(o.customer||'—'))+row('Durum',esc(ST[o.status]||o.status||'—'))+
    row('Sipariş Tarihi',fmtDate(o.date))+row('Teslim Tarihi',fmtDate(o.teslimTarihi))+
    row('Ürünler',esc((o.lines||[]).map(l=>l.code+' × '+fmtN(l.qty)).join(', ')||'—'))+
    (o.plaka?row('Araç / Şoför',esc(o.plaka+(o.sofor?' · '+o.sofor:''))):'')+
    `<a class="ka-link" href="siparis-takip/#siparis=${esc(o.no)}">Siparişi aç</a>`);
}
function ansTonaj(q){
  const n=norm(q);
  if(n.includes('hedef'))return null;  // hedef soruları ansHedef'e
  if(!/(^|\s)(ton|tonaj)(\s|$)|uret|satis miktar|kac ton/.test(n))return null;
  const P=parsePeriod(q);
  const os=D().orders.filter(o=>o.status!=='iptal'&&o.date&&o.date.slice(0,4)===P.yil&&(P.tip!=='ay'||o.date.slice(5,7)===P.ay));
  let ton=0,cuval=0;const byP={};
  os.forEach(o=>(o.lines||[]).forEach(l=>{if(!l.code)return;const t=tonOf(l.code,l.qty);ton+=t;cuval+=(+l.qty||0);byP[l.code]=(byP[l.code]||0)+t;}));
  const top=Object.entries(byP).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return card('Satış Tonajı — '+esc(P.lbl),
    row('Toplam',`<span class="ka-big">${fmtTon(ton)} ton</span>`)+row('Çuval',fmtN(cuval)+' adet')+row('Sipariş',os.length+' adet')+
    (top.length?`<div class="ka-sub">Ürün kırılımı</div>`+top.map(([c,t])=>row(c,fmtTon(t)+' t')).join(''):'')+
    `<div class="ka-note">1 çuval = 25 kg · iptal siparişler hariç · detay: <a href="siparis-takip/#raporlar">Raporlar → Tonaj &amp; Hedef</a></div>`);
}
function ansIzin(q){
  const n=norm(q);if(!n.includes('izin')&&!n.includes('izn'))return null;  // izin / izni / izne (ünlü düşmesi)
  const yil=new Date().getFullYear();
  const ps=D().personeller.filter(p=>(p.durum||'aktif')!=='ayrildi');
  if(!ps.length)return card('Yıllık İzin',`<p class="ka-p">İK modülünde henüz personel kaydı bulunmuyor. <a class="ka-link" href="hr/">İK modülünü aç</a></p>`);
  const mt=bestMatch(ps,p=>p.ad,tokensOf(q));
  if(mt){const p=mt.item,s=izinOzet(p,yil);
    return card('Yıllık İzin — '+esc(p.ad)+' ('+yil+')',
      row('Devir',s.devir+' gün')+row('Hak Ediş',s.hak+' gün')+row('Kullanılan',s.kullanilan+' gün')+
      row('Kalan',`<span class="ka-big" style="color:${s.kalan<0?'#B91C1C':'#15803D'}">${s.kalan} gün</span>`)+
      `<a class="ka-link" href="hr/">İK modülünde aç</a>`);}
  const rows=ps.map(p=>({p,s:izinOzet(p,yil)})).sort((a,b)=>b.s.kalan-a.s.kalan)
    .map(({p,s})=>`<tr><td>${esc(p.ad)}</td><td class="n">${s.hak+s.devir}</td><td class="n">${s.kullanilan}</td><td class="n" style="font-weight:700;color:${s.kalan<0?'#B91C1C':'#15803D'}">${s.kalan}</td></tr>`).join('');
  return card('Yıllık İzin Durumu — '+yil,table([{t:'Personel'},{t:'Toplam Hak',n:1},{t:'Kullanılan',n:1},{t:'Kalan',n:1}],rows)+`<a class="ka-link" href="hr/">İK modülünde aç</a>`);
}
function ansKomisyon(q){
  const n=norm(q);
  if(!/komisyon|hakedis|hak edis|prim|iskonto/.test(n))return null;
  const mt=bestMatch(D().koms,k=>k.name,tokensOf(q));
  if(mt){const k=mt.item;
    if(k.type==='danisman'){const h=danismanHakedis(k.id);
      return card('Danışman Hakedişi — '+esc(k.name),
        row('Hak Edilen (toplam)',fmtTL(h.hak))+row('Ödenen',fmtTL(h.odenen))+
        row('Kalan Bakiye',`<span class="ka-big" style="color:${h.bakiye>0?'#B91C1C':'#15803D'}">${fmtTL(h.bakiye)}</span>`)+row('Sipariş',h.adet+' adet')+
        `<div class="ka-note">Prim fatura karşılığı ödenir · detay: <a href="siparis-takip/#komisyon">İskonto &amp; Komisyon</a></div>`);}
    const L=bayiLedger(k.id);
    return card('Bayi İskonto Carisi — '+esc(k.name),
      row('Kazanılan İskonto',fmtTL(L.kazanim))+row('Düşülen (Mahsup)',fmtTL(L.mahsup))+
      row('Kalan Alacak',`<span class="ka-big" style="color:#1D4ED8">${fmtTL(L.kalan)}</span>`)+row('Hareket',L.adet+' sipariş')+
      `<div class="ka-note">İskonto nakit ödenmez; bayiye satış faturasından düşülür.</div>`);}
  // isim yoksa: tüm danışman bakiyeleri
  const ds=D().koms.filter(k=>k.type==='danisman').map(k=>({k,h:danismanHakedis(k.id)})).filter(x=>x.h.adet>0);
  if(!ds.length)return null;
  const rows=ds.sort((a,b)=>b.h.bakiye-a.h.bakiye).map(({k,h})=>`<tr><td>${esc(k.name)}</td><td class="n">${fmtTL(h.hak)}</td><td class="n">${fmtTL(h.odenen)}</td><td class="n" style="font-weight:700">${fmtTL(h.bakiye)}</td></tr>`).join('');
  return card('Danışman Komisyon Bakiyeleri',table([{t:'Danışman'},{t:'Hak Edilen',n:1},{t:'Ödenen',n:1},{t:'Bakiye',n:1}],rows));
}
function ansUrun(q){
  const n=norm(q).replace(/[\s-]/g,'');
  let hits=D().products.filter(p=>p.active!==false&&n.includes(norm(p.code).replace(/[\s-]/g,'')));
  // "plus" ayrımı: bir kod, eşleşen daha uzun bir kodun alt dizesi ise ele (BK-300 PLUS aranırken BK-300 çıkmasın)
  hits.sort((a,b)=>b.code.length-a.code.length);
  hits=hits.filter(p=>!hits.some(o=>o!==p&&norm(o.code).replace(/[\s-]/g,'').includes(norm(p.code).replace(/[\s-]/g,''))));
  const fiyatNiyet=/fiyat|kac tl|kaca|ne kadar|liste/.test(norm(q));
  if(!hits.length)return null;
  if(!fiyatNiyet&&!hits.length)return null;
  const pl=activePL();
  const ps=hits.slice(0,3);
  return ps.map(p=>{
    const bayiNot=/bayi/.test(norm(q))?`<div class="ka-note">Bayi alış fiyatı = Fabrika × (1 − bayi iskontosu). Örn. %3 iskontolu bayi: ${fmtN((+p.fabrika||0)*0.97)} ₺</div>`:'';
    return card('Ürün Fiyatı — '+esc(p.code)+' ('+esc(p.pkg||'25 kg')+')',
      row('Fabrika Teslim',fmtN(p.fabrika)+' ₺')+row('Yakın Bayi Satış',fmtN(p.yakin)+' ₺')+row('Uzak Bayi Satış',fmtN(p.uzak)+' ₺')+
      (p.danismanListe?row('Danışman Liste (Torbalı)',fmtN(p.danismanListe)+' ₺'):'')+
      bayiNot+`<div class="ka-note">Güncel tarife: ${esc(D().meta.priceDate||(pl?fmtDate(pl.date):'—'))}</div>`);
  }).join('');
}
function ansBayiDanisman(q){
  const n=norm(q);
  if(!/bayi|danisman/.test(n))return null;
  const tip=/danisman/.test(n)?'danisman':'bayi';
  const list=D().koms.filter(k=>k.type===tip&&k.active!==false);
  const qt=tokensOf(q);
  // şehir eşleşmesi
  const cityHits=list.filter(k=>k.city&&qt.some(t=>t.length>=3&&norm(k.city).includes(t)));
  if(cityHits.length){
    const rows=cityHits.map(k=>`<tr><td><b>${esc(k.name)}</b></td><td>${esc(k.city||'—')}</td><td>${esc(k.phone||'—')}</td><td class="n">${k.type==='bayi'?('%'+fmtN(k.rate||0)):'—'}</td></tr>`).join('');
    return card((tip==='bayi'?'Bayiler':'Danışmanlar')+' — '+esc(cityHits[0].city),
      table([{t:'Ad'},{t:'Şehir'},{t:'Telefon'},{t:tip==='bayi'?'İskonto':'',n:1}],rows)+`<a class="ka-link" href="saha/">Saha modülünde aç</a>`);
  }
  // ad eşleşmesi
  const mt=bestMatch(list,k=>k.name,qt);
  if(mt){const k=mt.item;const dan=k.danismanId?komById(k.danismanId):null;
    return card((tip==='bayi'?'Bayi':'Teknik Danışman')+' — '+esc(k.name),
      row('Şehir',esc(k.city||'—'))+row('Telefon',esc(k.phone||'—'))+
      (tip==='bayi'?row('İskonto Oranı','%'+fmtN(k.rate||0)):'')+
      (dan?row('Bağlı Danışman',esc(dan.name)):'')+
      `<a class="ka-link" href="saha/">Saha modülünde aç</a>`);}
  // genel liste ("bayilerimiz kimler")
  if(/kimler|listesi|hepsi|tum|kac (tane )?bayi|kac (tane )?danisman/.test(n)||qt.length<=1){
    const rows=list.slice(0,30).map(k=>`<tr><td><b>${esc(k.name)}</b></td><td>${esc(k.city||'—')}</td><td>${esc(k.phone||'—')}</td></tr>`).join('');
    return card((tip==='bayi'?'Bayiler':'Danışmanlar')+' ('+list.length+')',table([{t:'Ad'},{t:'Şehir'},{t:'Telefon'}],rows)+`<a class="ka-link" href="saha/">Saha modülünde aç</a>`);
  }
  return null;
}
function ansMusteri(q){
  const qt=tokensOf(q);if(!qt.length)return null;
  const mt=bestMatch(D().customers,c=>c.name,qt,Math.min(2,qt.filter(t=>t.length>=3).length)||1);
  if(!mt)return null;
  const c=mt.item;
  const os=D().orders.filter(o=>o.customerId===c.id);
  const son=os.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  const bayi=c.bayiId?komById(c.bayiId):null,dan=c.danismanId?komById(c.danismanId):null;
  return card('Müşteri — '+esc(c.name)+(c.arsiv?' <span style="font-size:10px;font-weight:700;background:#eef2f7;color:#8aa0b8;padding:2px 8px;border-radius:10px;vertical-align:middle">ARŞİVDE</span>':''),
    row('Telefon',telLink(c.phone))+
    row('Adres',mapsLink(c))+
    row('Şehir / Bölge',esc(c.city||'—'))+(c.firma?row('Firma',esc(c.firma)):'')+
    (bayi?row('Bayisi',esc(bayi.name)):'')+(dan?row('Danışmanı',esc(dan.name)):'')+
    (!bayi&&!dan?row('Bağlantı','Fabrika (direkt)'):'')+
    row('Sipariş Sayısı',os.length+(c.orderCount?' (+'+c.orderCount+' arşiv)':''))+
    (son?row('Son Sipariş',fmtDate(son.date)+' · #'+son.no):'')+
    `<a class="ka-link" href="siparis-takip/#musteriler">Müşteriler sayfasında aç</a>`);
}
function ansPersonel(q){
  const ps=D().personeller;if(!ps.length)return null;
  const mt=bestMatch(ps,p=>p.ad,tokensOf(q),2);
  if(!mt)return null;
  const p=mt.item;const s=izinOzet(p,new Date().getFullYear());
  return card('Personel — '+esc(p.ad),
    row('Görev',esc(p.gorev||'—'))+row('Departman',esc(p.departman||'—'))+
    row('Telefon',esc(p.telefon||'—'))+row('İşe Giriş',fmtDate(p.iseGiris))+
    row('Kalan Yıllık İzin',s.kalan+' gün')+
    `<div class="ka-note">Ücret ve mali bilgiler aramaya kapalıdır.</div><a class="ka-link" href="hr/">İK modülünde aç</a>`);
}
function ansHedef(q){
  if(!norm(q).includes('hedef'))return null;
  const H=(D().meta&&D().meta.tonajHedef)||{};
  const yil=String(new Date().getFullYear());
  const os=D().orders.filter(o=>o.status!=='iptal'&&o.date&&o.date.slice(0,4)===yil);
  const byM={};os.forEach(o=>{const m=o.date.slice(5,7);(o.lines||[]).forEach(l=>{if(l.code)byM[m]=(byM[m]||0)+tonOf(l.code,l.qty);});});
  const rows=AYLAR_TR.map((ad,i)=>{const k=yil+'-'+String(i+1).padStart(2,'0');const hv=+H[k]||0,g=byM[String(i+1).padStart(2,'0')]||0;
    if(!hv&&!g)return '';
    return `<tr><td>${ad}</td><td class="n">${hv?fmtTon(hv):'—'}</td><td class="n">${g?fmtTon(g):'—'}</td><td class="n" style="font-weight:700">${hv?('%'+Math.round(g/hv*100)):'—'}</td></tr>`;}).join('');
  if(!rows)return card('Tonaj Hedefleri — '+yil,`<p class="ka-p">Henüz aylık ton hedefi girilmemiş. Hedefler <a class="ka-link" href="siparis-takip/#raporlar">Sipariş Takip → Raporlar → Tonaj &amp; Hedef</a> ekranından girilir.</p>`);
  return card('Tonaj Hedefleri — '+yil,table([{t:'Ay'},{t:'Hedef (t)',n:1},{t:'Gerçekleşen (t)',n:1},{t:'Oran',n:1}],rows)+`<a class="ka-link" href="siparis-takip/#raporlar">Tonaj &amp; Hedef raporunu aç</a>`);
}
function ansGenel(q){
  // serbest arama: tüm varlıklar
  const qt=tokensOf(q);if(!qt.length)return null;
  const out=[];
  const mCust=D().customers.filter(c=>nameScore(c.name,qt)>=1).slice(0,5);
  const mKom=D().koms.filter(k=>nameScore(k.name,qt)>=1).slice(0,5);
  const mPer=D().personeller.filter(p=>nameScore(p.ad,qt)>=1).slice(0,5);
  const nq=norm(q).replace(/[\s-]/g,'');
  const mProd=D().products.filter(p=>nq.includes(norm(p.code).replace(/[\s-]/g,''))||qt.some(t=>norm(p.code).replace(/[\s-]/g,'').includes(t))).slice(0,5);
  const li=(tip,ad,ek,href)=>`<tr><td><span class="ka-chip">${tip}</span></td><td><b>${esc(ad)}</b></td><td>${ek||''}</td><td><a class="ka-link" href="${href}">aç</a></td></tr>`;
  let rows='';
  mCust.forEach(c=>rows+=li('Müşteri',c.name,[telLink(c.phone),mapsLink(c)].filter(x=>x!=='—').join(' · ')||'',
    'siparis-takip/#musteriler'));
  mKom.forEach(k=>rows+=li(k.type==='bayi'?'Bayi':'Danışman',k.name,esc(k.city||''),'saha/'));
  mPer.forEach(p=>rows+=li('Personel',p.ad,esc(p.gorev||''),'hr/'));
  mProd.forEach(p=>rows+=li('Ürün',p.code,esc(p.pkg||''),'siparis-takip/#urunler'));
  if(!rows)return null;
  return card('Arama Sonuçları',table([{t:''},{t:'Ad'},{t:'Bilgi'},{t:''}],rows));
}
function ansBos(){
  return card('Sonuç Bulunamadı',`<p class="ka-p">Bu soruya karşılık gelen bir veri bulunamadı. Şunları deneyebilirsiniz:</p>
  <ul class="ka-ul"><li>"Afyon'da hangi bayimiz var?"</li><li>"BK-300 Plus fiyatı ne kadar?"</li><li>"Geçen ay kaç ton sattık?"</li><li>"[danışman adı] komisyon bakiyesi"</li><li>"[müşteri adı] telefon numarası"</li><li>"Kimin kaç gün izni kaldı?"</li></ul>`);
}

// ---------- ana akış ----------
async function search(q){
  q=String(q||'').trim();
  if(!q)return '';
  if(yasakMi(q))return ansYasak();
  await loadData();
  // niyet zinciri: özelden genele
  return ansSiparis(q)||ansTonaj(q)||ansIzin(q)||ansHedef(q)||ansKomisyon(q)||ansUrun(q)||ansBayiDanisman(q)||ansMusteri(q)||ansPersonel(q)||ansGenel(q)||ansBos();
}

// ---------- UI bağlama ----------
const $=id=>document.getElementById(id);
async function runSearch(){
  const q=$('ka-q').value;
  const out=$('ka-out');
  if(!q.trim()){out.innerHTML='';out.style.display='none';return;}
  out.style.display='block';
  out.innerHTML='<div class="ka-loading"><span class="ka-spin"></span> Aranıyor…</div>';
  try{out.innerHTML=(await search(q))+`<button class="ka-close" onclick="this.parentElement.style.display='none'">Kapat</button>`;}
  catch(e){out.innerHTML='<div class="ka-card ka-red"><div class="ka-card-t">Hata</div><p class="ka-p">Arama sırasında bir sorun oluştu. Lütfen tekrar deneyin.</p></div>';}
}
window.kaAsk=function(s){$('ka-q').value=s;runSearch();};
document.addEventListener('DOMContentLoaded',()=>{
  const inp=$('ka-q');if(!inp)return;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')runSearch();});
  $('ka-btn').addEventListener('click',runSearch);
});
