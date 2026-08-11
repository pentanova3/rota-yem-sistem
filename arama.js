// ============================================================
// ROTA SMI · Kurumsal Arama v3 ("site içi Google + portal rehberi")
// Canlı · çok-bölümlü · autocomplete · TMR+Yem+İK+Saha+Bakım rehberi.
// Soru çeşitleri: veri (tonaj/ciro/fiyat/hakediş) + "nerede/nasıl/hangi modül".
// Muhasebe & Finans KAPALI (YASAK + apps/muhasebe hiç okunmaz).
// ============================================================
import { initializeApp } from "/vendor/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "/vendor/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "/vendor/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig={apiKey:"AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8",authDomain:"rota-yem.firebaseapp.com",projectId:"rota-yem",storageBucket:"rota-yem.firebasestorage.app",messagingSenderId:"186408871052",appId:"1:186408871052:web:65791c132b2c1b525307a9"};
const app=initializeApp(firebaseConfig), db=getFirestore(app), auth=getAuth(app);
const authReady=new Promise(r=>{const un=onAuthStateChanged(auth,u=>{un();r(u||null);});});

// ---------- yardımcılar ----------
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtN=n=>(+n||0).toLocaleString('tr-TR',{maximumFractionDigits:2});
const fmtTL=n=>'₺'+(+n||0).toLocaleString('tr-TR',{maximumFractionDigits:0});
const fmtTon=t=>(+t||0).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1});
const fmtDate=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));return m?(m[3]+'.'+m[2]+'.'+m[1]):'—'};
const AYLAR=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
const AYLAR_TR=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function norm(s){return String(s||'').toLocaleLowerCase('tr-TR')
  .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
  .replace(/['’´`"]/g,' ').replace(/[^a-z0-9#\s-]/g,' ').replace(/\s+/g,' ').trim();}
const bare=s=>norm(s).replace(/[\s-]/g,'');
const STOP=new Set(['ne','kac','kaç','kadar','hangi','var','mi','mu','mı','kim','kimin','gun','gün','su','şu','bu','o','ve','ile','icin','en','ay','yil','the','a','de','da','ki','neydi','nedir','olan','simdi','an','miydi','acaba','bana','bize','goster','soyle','listele','ver','bul','kimdir','nerede','nerde','deki','daki','li','lu','den','dan','tane','toplam','sistemde','bizim','bizde']);
function tokensOf(q){return norm(q).split(' ').filter(t=>t.length>=2&&!STOP.has(t));}
function nameScore(name,qtoks){
  const nt=norm(name).split(' ').filter(Boolean);if(!nt.length)return 0;let hit=0;
  qtoks.forEach(qt=>{if(qt.length<3)return;if(nt.some(n=>n.startsWith(qt)||(qt.startsWith(n)&&n.length>=3)))hit++;});
  return hit;
}
function bestMatch(list,nameOf,qtoks,minScore){
  let best=null,bs=0;list.forEach(x=>{const s=nameScore(nameOf(x),qtoks);if(s>bs){bs=s;best=x;}});
  return bs>=(minScore||1)?{item:best,score:bs}:null;
}
const uniqBy=(arr,keyOf)=>{const seen=new Set();return arr.filter(x=>{const k=keyOf(x);if(seen.has(k))return false;seen.add(k);return true;});};

// ---------- veri katmanı (lazy + cache) ----------
let CACHE=null, IDX=null;
async function loadData(){
  if(CACHE)return CACHE;
  const read=async(id,key)=>{try{const s=await getDoc(doc(db,'apps',id));const d=s.exists()?s.data().data:null;return d&&d[key]?JSON.parse(d[key]):null;}catch(e){return null;}};
  // DİKKAT: apps/muhasebe bilinçli olarak OKUNMAZ — finans verileri aramaya kapalıdır.
  const [so,yem,saha,ik,bakim]=await Promise.all([
    read('siparis','rota_so_v1'), read('yem','rota_yem_v1'), read('saha','rota_saha_v1'),
    read('ik','rota_ik_v1'), read('bakim','rota_bakim_v1')]);
  CACHE={
    // TMR
    orders:(so&&so.orders)||[],customers:(so&&so.customers)||[],products:(so&&so.products)||[],
    priceLists:(so&&so.priceLists)||[],meta:(so&&so.meta)||{},odemeler:(so&&so.komisyonOdemeler)||[],
    preOrders:(so&&so.preOrders)||[],
    koms:(saha&&saha.komisyoncular)||(so&&so.komisyoncular)||[],
    // YEM (yeni)
    yemOrders:(yem&&yem.orders)||[],yemCustomers:(yem&&yem.customers)||[],yemProducts:(yem&&yem.products)||[],
    yemPlasiyerler:(yem&&yem.plasiyerler)||[],yemOzel:(yem&&yem.ozelListeler)||[],yemMeta:(yem&&yem.meta)||{},
    // İK
    personeller:(ik&&ik.personeller)||[],izinler:(ik&&ik.izinler)||[],izinBakiye:(ik&&ik.izinBakiye)||[],
    avanslar:(ik&&ik.avanslar)||[],tazminatAyar:(ik&&ik.tazminatAyar)||{},
    // Bakım (makine envanter) — tutar/maliyet satırları gösterilmez (finans sınırı)
    bakimKayitlar:(bakim&&bakim.kayitlar)||[],bakimKitaplar:(bakim&&bakim.kitaplar)||[],
  };
  buildIndex();
  return CACHE;
}
const D=()=>CACHE;

// ---------- TMR hesap portları (siparis-takip ile birebir) ----------
const prodByCode=c=>D().products.find(p=>norm(p.code)===norm(c))||null;
const komById=id=>D().koms.find(k=>k.id===id)||null;
const activePL=()=>D().priceLists.find(p=>p.id===D().meta.activePriceListId)||D().priceLists[D().priceLists.length-1]||null;
const plById=id=>id?(D().priceLists.find(p=>p.id===id)||null):null;
function priceListAsOf(iso){
  const d=String(iso||'').slice(0,10);
  const ls=(D().priceLists||[]).filter(p=>p&&p.date);
  if(!ls.length||!d)return activePL();
  let best=null;
  for(let i=0;i<ls.length;i++){const pd=String(ls[i].date).slice(0,10);if(pd<=d&&(!best||pd>=String(best.date).slice(0,10)))best=ls[i];}
  if(best)return best;
  return ls.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0]||activePL();
}
function orderPriceDate(o){
  if(!o)return '';
  if(satisMi(o)){const t=satisTarihi(o);if(t)return String(t).slice(0,10);}
  return String(o.date||'').slice(0,10);
}
const orderPL=o=>plById(o&&o.priceListId)||priceListAsOf(orderPriceDate(o))||activePL();
function orderPLForPrim(o){const d=orderPriceDate(o);if(d)return priceListAsOf(d)||activePL();return orderPL(o);}
function tariffPrice(pl,code,kad){if(!pl||!code)return 0;const it=(pl.items||[]).find(x=>norm(x.code)===norm(code));return it?(+it[kad||'fabrika']||0):0;}
function primTarifeFiyat(plAsOf,o,code,kad){
  const a=tariffPrice(plAsOf,code,kad); if(a>0)return a;
  const b=tariffPrice(orderPL(o),code,kad); if(b>0)return b;
  if(plAsOf&&(plAsOf.items||[]).length)return 0;
  const p=prodByCode(code); return p?(+p[kad]||0):0;
}
function round2(x){return Math.round((+x||0)*100)/100;}
function prodKg(code){const p=prodByCode(code);const m=/([\d.,]+)\s*kg/i.exec((p&&p.pkg)||'');const kg=m?parseFloat(m[1].replace(',','.')):25;return kg>0?kg:25;}
const tonOf=(code,qty)=>(+qty||0)*prodKg(code)/1000;
function lineUnit(l,kad){if(l.price==='')return 0;if(l.price!=null)return +l.price||0;const p=prodByCode(l.code);return p?(+p[kad||'fabrika']||0):0;}
// Ciro: panel orderTotal ile hizalı — manuel fatura > DBS’li net > satır toplamı. Damgalı o.total yoksa yeniden hesap.
function manuelFatura(o){
  if(!o||o.faturaManuel==null||o.faturaManuel==='')return null;
  const v=+o.faturaManuel; return (isFinite(v)&&v>0)?round2(v):null;
}
function orderNetHesap(o){
  if(o.lines&&o.lines.length){let t=0,fiyatli=false;o.lines.forEach(l=>{const u=lineUnit(l,o.fiyatKademe);if(u>0)fiyatli=true;t+=(+l.qty||0)*u;});return fiyatli?t:(t||o.total||0);}
  return o.total||0;
}
function dbsOran(o){if(!o)return 0;if(o.dbsOran!=null&&o.dbsOran!=='')return +o.dbsOran||0;return 0;} // arama: yalnız damga (canlı form yok)
function dbsIskonto(o){const r=dbsOran(o);if(!(r>0))return 0;return round2(orderNetHesap(o)*r/100);}
function orderNetDbs(o){return round2(orderNetHesap(o)-dbsIskonto(o));}
function orderTotal(o){const m=manuelFatura(o);return m!=null?m:orderNetDbs(o);}
function ordBayi(o){let id=o&&o.bayiId;if(!id&&o&&o.komisyoncuId){const k=komById(o.komisyoncuId);if(k&&k.type==='bayi')id=o.komisyoncuId;}return id?komById(id):null;}
// siparis-takip/index.html ordDanisman ile BİREBİR: damga yoksa müşteri/bayi kartına düşülür
// (Excel'den aktarılmış + ataması sonradan yapılmış siparişlerde danışman kaybolmasın).
function ordDanisman(o){
  let id=o&&o.danismanId;
  if(!id&&o&&o.komisyoncuId){const k=komById(o.komisyoncuId);if(k&&k.type==='danisman')id=o.komisyoncuId;}
  if(!id&&o){
    if(o.bayiId){const b=komById(o.bayiId);id=(b&&b.danismanId)||'';}
    else if(o.customerId){const c=custById(o.customerId);id=(c&&c.danismanId)||'';}
  }
  return id?komById(id):null;
}
const tmrTon=o=>{let t=0;(o.lines||[]).forEach(l=>{if(l.code)t+=tonOf(l.code,l.qty);});return t;};
const tmrTotal=o=>{const m=manuelFatura(o);if(m!=null)return m;if(o&&o.total!=null&&o.total!=='')return +o.total||0;return orderTotal(o);};
function effAyarVal(raw,ay){if(!ay||!ay.mode)return raw;if(ay.mode==='yok')return 0;if(ay.mode==='tutar')return +ay.tutar||0;return raw;}
function orderKomisyon(o,kom){
  if(!o||!kom)return {tutar:0};
  const isk=(D().meta&&D().meta.tdIskonto)||6;
  if(kom.type==='danisman'){
    let prim=0;
    if(o.aliciBayi){
      const bayi=ordBayi(o);if(!bayi)return {tutar:0};
      const bOzel=(o.ozelIskonto!=null&&o.ozelIskonto!=='')?+o.ozelIskonto:(+bayi.ozelIskonto||0);
      const bRate=(o.komisyonRate!=null&&o.komisyonRate!=='')?+o.komisyonRate:(+bayi.rate||0);const pl=orderPLForPrim(o);
      const bCarpan=(1-bOzel/100)*(1-bRate/100);
      (o.lines||[]).forEach(l=>{const fab=primTarifeFiyat(pl,o,l.code,'fabrika');const torb=primTarifeFiyat(pl,o,l.code,'danismanListe');if(fab>0&&torb>0)prim+=(fab*bCarpan-torb*(1-isk/100))*(+l.qty||0);});
      return {tutar:prim,viaBayi:true};
    }
    const plDir=orderPLForPrim(o);
    (o.lines||[]).forEach(l=>{
      const liste=primTarifeFiyat(plDir,o,l.code,'danismanListe');
      var satis=0; if(l.price==='')satis=0; else if(l.price!=null)satis=+l.price||0; else satis=liste;
      if(satis>0)prim+=(satis-liste*(1-isk/100))*(+l.qty||0);
    });
    return {tutar:prim-(+o.nakliye||0)};
  }
  return {tutar:0,rate:(o.komisyonRate!=null&&o.komisyonRate!=='')?+o.komisyonRate:(+kom.rate||0)};
}
function bayiAlimOzet(bayiId,yil){
  // SATIŞ KURALI + panel bayiAlimData ile hizalı: teslim + orderTotal + iskAyar
  const os=D().orders.filter(o=>o.aliciBayi&&satisMi(o)&&(ordBayi(o)||{}).id===bayiId&&satisTarihi(o).slice(0,4)===String(yil));
  let brut=0,fat=0,iskonto=0;const ceyrek=[0,0,0,0];
  os.forEach(o=>{
    // BRÜT: DAMGA ÖNCELİKLİ (denetim 12.08.2026) — panel bayiAlimData ve sunucu bayi ucuyla
    // AYNI kural. Eski as-of fabrika hesabı İMECE'de kredi kartı tabanını görmüyordu (iskonto 0
    // çıkıyordu) ve damgalı tarifeyi yok sayıyordu (panelden ±binlerce TL sapma). Damga yoksa
    // (23.07 öncesi eski kayıt) eski as-of hesabı yedek olarak kalır.
    let b=(+o.brutListe>0)?(+o.brutListe):0;
    if(!(b>0)){const pl=orderPLForPrim(o);
      (o.lines||[]).forEach(l=>{if(!l.code)return;b+=primTarifeFiyat(pl,o,l.code,'fabrika')*(+l.qty||0);});}
    const ft=tmrTotal(o);const iskHam=Math.max(0,b-ft);const isk=effAyarVal(iskHam,o.iskAyar);
    const q=Math.floor((+satisTarihi(o).slice(5,7)-1)/3);if(q>=0&&q<4)ceyrek[q]+=isk;
    brut+=b;fat+=ft;iskonto+=isk;
  });
  return {adet:os.length,brut,fatura:fat,iskonto,ceyrek};
}
function danismanHakedis(danId){
  // SATIŞ KURALI + primAyar (panel effPrim ile BİREBİR)
  let hak=0,adet=0;D().orders.forEach(o=>{const d=ordDanisman(o);if(d&&d.id===danId&&satisMi(o)){hak+=effAyarVal(orderKomisyon(o,d).tutar||0,o.primAyar);adet++;}});
  const odenen=D().odemeler.filter(p=>p.komisyoncuId===danId).reduce((s,p)=>s+(+p.odenenTutar||0),0);
  return {hak,odenen,bakiye:hak-odenen,adet};
}

// ---------- YEM hesap portları (yem/index.html ile birebir, AYRI isim) ----------
const yemProdByCode=c=>D().yemProducts.find(p=>norm(p.code)===norm(c))||null;
function yemKg(code){const p=yemProdByCode(code);if(p&&+p.kg>0)return +p.kg;const m=/([\d.,]+)\s*kg/i.exec((p&&p.pkg)||'');const kg=m?parseFloat(m[1].replace(',','.')):50;return kg>0?kg:50;}
const yemCuval=o=>(o.cuval!=null?+o.cuval:(o.lines||[]).reduce((s,l)=>s+(+l.qty||0),0));
const yemTon=o=>{let t=0;(o.lines||[]).forEach(l=>{if(l.code)t+=(+l.qty||0)*yemKg(l.code);});return t/1000;};
const yemNet=o=>(o.urunNet!=null?+o.urunNet:(o.lines||[]).reduce((s,l)=>s+(+l.qty||0)*(+l.price||0),0));
const yemBrut=o=>(o.brut!=null?+o.brut:(o.lines||[]).reduce((s,l)=>s+(+l.qty||0)*((l.liste!=null&&l.liste!=='')?+l.liste:(+l.price||0)),0));
const yemIskonto=o=>(o.iskontoTutar!=null?+o.iskontoTutar:Math.max(0,yemBrut(o)-yemNet(o)));
const yemNakliye=o=>(o.nakliyeTutar!=null?+o.nakliyeTutar:((o.nakliyeBirim!=null&&o.nakliyeBirim!=='')?(+o.nakliyeBirim||0)*yemCuval(o):(+o.nakliye||0)));
const yemHammaliye=o=>(o.hammaliyeTutar!=null?+o.hammaliyeTutar:((+o.hammaliyeBirim||0)*yemCuval(o)));
const yemTotal=o=>(o.total!=null?+o.total:yemNet(o)+yemNakliye(o)+yemHammaliye(o));
const yemPlasById=id=>D().yemPlasiyerler.find(p=>p.id===id)||null;
function yemOrdPlasiyer(o){const pid=(o&&o.plasiyerId)||((o&&o.customerId)?((D().yemCustomers.find(c=>c.id===o.customerId)||{}).plasiyerId):'');return pid?yemPlasById(pid):null;}

// ---------- iş günü / izin / avans / tazminat (İK portları) ----------
function yilFark(iso,ref){const d=iso?new Date(iso):null;if(!d||isNaN(d))return 0;const r=ref||new Date();let y=r.getFullYear()-d.getFullYear();const m=r.getMonth()-d.getMonth();if(m<0||(m===0&&r.getDate()<d.getDate()))y--;return y;}
function yillikHakGun(iseGiris,dogum,ref){const k=yilFark(iseGiris,ref);if(k<1)return 0;let g=k<=5?14:(k<15?20:26);if(dogum){const yas=yilFark(dogum,ref);if(yas<18||yas>=50)g=Math.max(g,20);}return g;}
function izinOzet(p,yil){
  const kayit=D().izinler.filter(z=>z.personelId===p.id&&(z.baslangic||'').slice(0,4)===String(yil));
  const kullanilan=kayit.filter(z=>z.tur==='yillik').reduce((s,z)=>s+(+z.gun||0),0);
  const bk=D().izinBakiye.find(x=>x.personelId===p.id&&+x.yil===+yil)||{};
  const devir=+bk.devir||0;const hak=(bk.hakEdilen!==''&&bk.hakEdilen!=null)?+bk.hakEdilen:yillikHakGun(p.iseGiris,p.dogum,new Date(yil,11,31));
  return {kullanilan,devir,hak,kalan:devir+hak-kullanilan};
}
function avansAylik(a){return (+a.tutar||0)/Math.max(1,+a.taksit||1);}
function avansAylarL(a){const out=[];if(!a.baslangicAy)return out;let[y,m]=a.baslangicAy.split('-').map(Number);for(let i=0;i<(+a.taksit||1);i++){out.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}return out;}
function avansKalanH(a){const ref=new Date().toISOString().slice(0,7);const kes=avansAylarL(a).filter(ym=>ym<=ref).length*avansAylik(a);return Math.max(0,(+a.tutar||0)-Math.min(+a.tutar||0,kes));}
function aylarFarki(iso){const d=new Date(iso);if(isNaN(d))return 0;const n2=new Date();let m=(n2.getFullYear()-d.getFullYear())*12+(n2.getMonth()-d.getMonth());if(n2.getDate()<d.getDate())m--;return Math.max(0,m);}
function ihbarHaftasi(iseGiris){const ay=aylarFarki(iseGiris);return ay<6?2:(ay<18?4:(ay<36?6:8));}

// ---------- varlık indeksi (autocomplete + şehir/isim çözümü) ----------
let CITIES=null;
function buildIndex(){
  const E=[];
  const add=(type,src,name,ek,obj,go)=>{if(name)E.push({type,src,name,nn:norm(name),ek:ek||'',obj,go});};
  D().customers.forEach(c=>add('Müşteri','tmr',c.name,c.city||'','musteri','siparis-takip/#musteriler'));
  D().yemCustomers.forEach(c=>add('Müşteri','yem',c.name,c.city||'','yem-musteri','yem/#musteriler'));
  D().koms.filter(k=>k.type==='bayi'&&k.active!==false).forEach(k=>add('Bayi','tmr',k.name,k.city||'','bayi','saha/'));
  D().koms.filter(k=>k.type==='danisman'&&k.active!==false).forEach(k=>add('Danışman','tmr',k.name,k.city||'','danisman','saha/'));
  D().products.filter(p=>p.active!==false).forEach(p=>add('Ürün','tmr',p.code,p.pkg||'','urun','siparis-takip/#urunler'));
  D().yemProducts.filter(p=>p.active!==false).forEach(p=>add('Ürün','yem',p.code,p.pkg||'','yem-urun','yem/#urunler'));
  D().personeller.filter(p=>(p.durum||'aktif')!=='ayrildi').forEach(p=>add('Personel','ik',p.ad,p.gorev||'','personel','hr/'));
  D().yemPlasiyerler.filter(p=>p.active!==false).forEach(p=>add('Plasiyer','yem',p.name,'yem satış','plasiyer','yem/#raporlar'));
  IDX=E;
  const cm=new Map();
  const addCity=c=>{const v=(c||'').trim();if(!v)return;const k=norm(v);if(!cm.has(k))cm.set(k,v);};
  D().customers.forEach(c=>addCity(c.city));D().yemCustomers.forEach(c=>addCity(c.city));D().koms.forEach(k=>addCity(k.city));
  CITIES=[...cm.entries()].map(([nn,ad])=>({nn,ad}));
}
// sorgudaki şehir(ler)
function sehirEslesme(q){
  const qn=norm(q),qt=tokensOf(q);
  const hits=[];
  CITIES.forEach(c=>{
    const okTok=qt.some(t=>t.length>=3&&(c.nn.startsWith(t)||t.startsWith(c.nn)||(c.nn.includes(t)&&t.length>=4)));
    if(okTok)hits.push(c);
  });
  return uniqBy(hits,c=>c.nn);
}

// ---------- YASAK: muhasebe & finans ----------
const YASAK=['muhasebe','kasa','banka','cek','senet','nakit','finans','bilanco','tahsilat','borc','kredi','maas','ucret','bordro','iban','vergi','fatura tutari','kar marji','kasa bakiye','pos','dbs','odendi mi','alacak','odeme yapti'];
function yasakMi(q){const n=norm(q);const toks=new Set(n.split(' '));
  // tek kelimeler tam-token (kasap≠kasa, gerçek≠çek); çok kelimeliler alt-dize
  return YASAK.some(k=>k.includes(' ')?n.includes(k):toks.has(k));}

// ---------- dönem ayrıştırma ----------
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
const telLink=p=>p?`<a href="tel:${esc(String(p).replace(/\s/g,''))}" class="ka-tel">${esc(p)}</a>`:'—';
function mapsLink(c){
  const adres=(c.adres||c.address||'').trim(), city=(c.city||'').trim();
  const txt=adres||city;if(!txt)return '—';
  const sorgu=encodeURIComponent(adres?(adres+(city?' '+city:'')):city);
  return `<a href="https://www.google.com/maps/search/?api=1&query=${sorgu}" target="_blank" rel="noopener" class="ka-maps" title="Google Haritalar'da aç">${esc(txt)}</a>`;
}
const srcBadge=s=>s==='yem'?'<span class="ka-src yem">Yem</span>':(s==='tmr'?'<span class="ka-src tmr">TMR</span>':'');
const card=(title,body,tone)=>`<div class="ka-card ${tone||''}"><div class="ka-card-t">${title}</div>${body}</div>`;
const row=(k,v)=>`<div class="ka-row"><span>${esc(k)}</span><b>${v}</b></div>`;
const table=(head,rows)=>`<div class="ka-tblwrap"><table class="ka-tbl"><thead><tr>${head.map(h=>`<th${h.n?' class="n"':''}>${esc(h.t)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
const STLBL={beklemede:'Beklemede',onay:'Onaylandı',hazir:'Hazır',sevk:'Sevk Edildi',teslim:'Teslim Edildi',iptal:'İptal'};

// ============================================================
//  ANALİZÖRLER — her biri eşleşmezse null döner (self-gating)
// ============================================================

function ansYasak(){
  return card('Erişim Engellendi',`<p class="ka-p">Muhasebe ve finans verileri (kasa, banka, tahsilat, maaş vb.) kurumsal aramaya <b>kapalıdır</b>. Bu bilgiler yalnızca yetkili kullanıcıların erişebildiği <a href="muhasebe/">Muhasebe &amp; Finans</a> modülünde yer alır.</p>
  <p class="ka-p">Diğer modüller için <a href="#" onclick="kaAsk('Yardım');return false">portal rehberine</a> bakın (sipariş, yem, saha, İK, bakım, toplantı).</p>`,'ka-red');
}

// ---- Sipariş numarası (TMR + Yem) ----
function ansSiparis(q){
  const n=norm(q);
  const my=/#?y\s*(\d{1,5})\b/i.exec(q.replace(/\s+/g,' '));      // #Y12 → yem
  const mm=/#?\b(\d{1,5})\b/.exec(q);
  if(!my&&!mm)return null;
  if(!/siparis|#/.test(n)&&!q.includes('#'))return null;
  const out=[];
  if(my){const o=D().yemOrders.find(x=>String(x.no)===my[1]);if(o)out.push(yemSiparisKart(o));}
  if(mm){
    const oT=D().orders.find(x=>String(x.no)===mm[1]);if(oT)out.push(tmrSiparisKart(oT));
    if(!my){const oY=D().yemOrders.find(x=>String(x.no)===mm[1]);if(oY)out.push(yemSiparisKart(oY));}
  }
  return out.length?out.join(''):null;
}
function tmrSiparisKart(o){
  return card('Sipariş #'+esc(o.no)+' '+srcBadge('tmr'),
    row('Müşteri',esc(o.customer||'—'))+row('Durum',esc(STLBL[o.status]||o.status||'—'))+
    row('Sipariş Tarihi',fmtDate(o.date))+row('Teslim Tarihi',fmtDate(o.teslimTarihi))+
    row('Ürünler',esc((o.lines||[]).map(l=>l.code+' × '+fmtN(l.qty)).join(', ')||'—'))+
    row('Tonaj',fmtTon(tmrTon(o))+' t')+
    (o.plaka?row('Araç / Şoför',esc(o.plaka+(o.sofor?' · '+o.sofor:''))):'')+
    `<a class="ka-link" href="siparis-takip/#siparis=${esc(o.no)}">Siparişi aç →</a>`);
}
function yemSiparisKart(o){
  return card('Yem Siparişi #Y'+esc(o.no)+' '+srcBadge('yem'),
    row('Müşteri',esc(o.customer||'—'))+row('Durum',esc(STLBL[o.status]||o.status||'—'))+
    (o.crossFrom==='tmr'?row('Kaynak','TMR çapraz siparişi'):'')+
    row('Sipariş Tarihi',fmtDate(o.date))+row('Teslim Tarihi',fmtDate(o.teslimTarihi))+
    row('Ürünler',esc((o.lines||[]).map(l=>l.code+' × '+fmtN(l.qty)).join(', ')||'—'))+
    row('Tonaj',fmtTon(yemTon(o))+' t · '+fmtN(yemCuval(o))+' çuval')+
    `<a class="ka-link" href="yem/#siparis=${esc(o.no)}">Siparişi aç →</a>`);
}

// ---- Ortak veri kümesi tanımı (TMR + Yem raporları için) ----
function datasets(){
  return [
    {src:'tmr',lbl:'TMR',orders:D().orders,custs:D().customers,prods:D().products,ton:tmrTon,total:tmrTotal,custCity:o=>{const c=D().customers.find(x=>x.id===o.customerId);return c?c.city:'';}},
    {src:'yem',lbl:'Yem',orders:D().yemOrders,custs:D().yemCustomers,prods:D().yemProducts,ton:yemTon,total:yemTotal,custCity:o=>{const c=D().yemCustomers.find(x=>x.id===o.customerId);return c?c.city:'';}},
  ].filter(ds=>ds.orders.length);
}
// ══ SATIŞ KURALI (firma kararı 07.08.2026) — siparis-takip/index.html satisMi/satisTarihi ile BİREBİR
// Teslim edilmeyen sipariş satış değildir: tonaj, ciro, hakediş yalnız status==='teslim' olanı sayar.
// Tarih = fiilen teslim günü; eski kayıtta teslimTarihi → date sırasıyla düşülür.
// İKİ TARAF AYRIŞIRSA aynı soruya iki ekran farklı cevap verir (test bölüm 29 eşliği denetler).
const satisMi=o=>!!o&&o.status==='teslim';
const satisTarihi=o=>satisMi(o)?String(o.teslimEdildiTarih||o.teslimTarihi||o.date||''):'';
const donemFiltre=(orders,P)=>orders.filter(o=>{const t=satisTarihi(o);return t&&t.slice(0,4)===P.yil&&(P.tip!=='ay'||t.slice(5,7)===P.ay);});

// ---- Sipariş durumları (TMR + Yem) ----
function ansDurumSayim(q){
  const n=norm(q);
  if(!/siparis|onay bek|fabrika onay|uretim onay/.test(n))return null;
  if(!/bekleyen|onay bekle|kac siparis|siparis sayisi|sevk|teslim|hazir|acik siparis|durum|uretim|onay/.test(n))return null;
  return datasets().map(ds=>{
    const say={};ds.orders.forEach(o=>{say[o.status||'beklemede']=(say[o.status||'beklemede']||0)+1;});
    const rows=Object.keys(STLBL).filter(k=>say[k]).map(k=>row(STLBL[k],say[k]+' sipariş')).join('');
    if(!rows)return '';
    const acik=(say.beklemede||0)+(say.onay||0)+(say.hazir||0);
    return card('Sipariş Durumları '+srcBadge(ds.src),
      row('Toplam',ds.orders.length+' sipariş')+rows+row('Açık (üretim/sevk sürecinde)',`<span class="ka-big">${acik}</span>`)+
      `<a class="ka-link" href="${ds.src==='yem'?'yem/#siparisler':'siparis-takip/#siparisler'}">Sipariş listesini aç →</a>`);
  }).filter(Boolean).join('')||null;
}

// ---- Tonaj (TMR + Yem, müşteri/ürün filtreli) ----
function ansTonaj(q){
  const n=norm(q);
  if(n.includes('hedef'))return null;
  if(!/(^|\s)(ton|tonaj)(\s|$)|uret|satis miktar|kac ton|kac cuval/.test(n))return null;
  const P=parsePeriod(q),qt=tokensOf(q);
  return datasets().map(ds=>{
    let os=donemFiltre(ds.orders,P);let etiket='';
    const mc=bestMatch(ds.custs,c=>c.name,qt,2);
    if(mc){os=os.filter(o=>o.customerId===mc.item.id);etiket=' · '+mc.item.name;}
    const nq=bare(q);
    const mp=ds.prods.filter(pp=>pp.active!==false&&nq.includes(bare(pp.code))).sort((a,b)=>b.code.length-a.code.length)[0];
    if(mp&&!mc){os=os.map(o=>({...o,lines:(o.lines||[]).filter(l=>norm(l.code)===norm(mp.code))})).filter(o=>o.lines.length);etiket=' · '+mp.code;}
    let ton=0,cuval=0;const byP={},byC={};
    os.forEach(o=>{const t=ds.ton(o);ton+=t;byC[o.customer||'—']=(byC[o.customer||'—']||0)+t;(o.lines||[]).forEach(l=>{if(l.code){cuval+=(+l.qty||0);byP[l.code]=(byP[l.code]||0)+(+l.qty||0);}});});
    if(!os.length)return '';
    const top=Object.entries(mp&&!mc?byC:byP).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return card('Satış Tonajı — '+esc(P.lbl)+esc(etiket)+' '+srcBadge(ds.src),
      row('Toplam',`<span class="ka-big">${fmtTon(ton)} ton</span>`)+row('Çuval',fmtN(cuval)+' adet')+row('Sipariş',os.length+' adet')+
      (top.length?`<div class="ka-sub">${mp&&!mc?'Müşteri kırılımı':'Ürün kırılımı (çuval)'}</div>`+top.map(([c,v])=>row(c,mp&&!mc?fmtTon(v)+' t':fmtN(v)+' çuval')).join(''):'')+
      `<div class="ka-note">yalnız teslim edilen siparişler (satış kuralı) · detay: <a href="${ds.src==='yem'?'yem/#raporlar':'siparis-takip/#raporlar'}">Raporlar</a></div>`);
  }).filter(Boolean).join('')||card('Satış Tonajı — '+esc(P.lbl),'<p class="ka-p">Bu dönemde kayıt bulunamadı.</p>');
}

// ---- Ciro (TMR + Yem) ----
function ansCiro(q){
  const n=norm(q);
  if(!/ciro|satis tutari|toplam satis|kac tl.*sat|kac lira.*sat|hasilat|kazanc/.test(n))return null;
  const P=parsePeriod(q);
  return datasets().map(ds=>{
    const os=donemFiltre(ds.orders,P);if(!os.length)return '';
    const ciro=os.reduce((s,o)=>s+ds.total(o),0);let ton=0;os.forEach(o=>ton+=ds.ton(o));
    return card('Satış Cirosu — '+esc(P.lbl)+' '+srcBadge(ds.src),
      row('Toplam Ciro',`<span class="ka-big">${fmtTL(ciro)}</span>`)+row('Sipariş',os.length+' adet')+row('Tonaj',fmtTon(ton)+' t')+
      row('Ortalama Sipariş',os.length?fmtTL(ciro/os.length):'—')+
      `<div class="ka-note">Yalnız TESLİM EDİLEN siparişlerin tutarı (satış kuralı). Kasa/tahsilat muhasebe modülündedir, aramaya kapalıdır.</div>`);
  }).filter(Boolean).join('')||null;
}

// ---- En çok satan/alan (TMR + Yem) ----
function ansEnCok(q){
  const n=norm(q);
  if(!/en cok|en fazla|en iyi|en buyuk|lider|top ?\d|hangi urun|hangi musteri|hangi il|hangi sehir/.test(n))return null;
  if(/bakiyor|bakar|atanmis|bagli|musterileri|musterilerine/.test(n))return null;
  let tip=null;
  if(/urun|satan|satilan/.test(n))tip='urun';
  if(/musteri|alici|alan/.test(n))tip='musteri';
  if(/bayi/.test(n))tip='bayi';
  if(/danisman/.test(n))tip='danisman';
  if(/\bil\b|ilde|sehir|bolge|nerede/.test(n))tip='il';
  if(!tip)return null;
  const P=parsePeriod(q);
  const baslik={urun:'En Çok Satan Ürünler',musteri:'En Çok Alan Müşteriler',bayi:'En Yüksek Hacimli Bayiler',danisman:'En Yüksek Hacimli Danışmanlar',il:'En Çok Satış Yapılan İller'}[tip];
  // bayi/danışman yalnız TMR'de var
  const dss=(tip==='bayi'||tip==='danisman')?datasets().filter(d=>d.src==='tmr'):datasets();
  return dss.map(ds=>{
    const os=donemFiltre(ds.orders,P);if(!os.length)return '';
    const agg={};
    os.forEach(o=>{
      if(tip==='urun'){(o.lines||[]).forEach(l=>{if(l.code)agg[l.code]=(agg[l.code]||0)+(ds.src==='yem'?(+l.qty||0)*yemKg(l.code)/1000:tonOf(l.code,l.qty));});return;}
      let key=null,t=ds.ton(o);
      if(tip==='musteri')key=o.customer||'—';
      if(tip==='bayi'){const b=ordBayi(o);key=b?b.name:null;}
      if(tip==='danisman'){const d2=ordDanisman(o);key=d2?d2.name:null;}
      if(tip==='il')key=ds.custCity(o)||null;
      if(key)agg[key]=(agg[key]||0)+t;
    });
    const top=Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,5);if(!top.length)return '';
    const toplam=Object.values(agg).reduce((s,v)=>s+v,0);
    const rows=top.map(([k,v],i)=>`<tr><td><b>${i+1}.</b></td><td><b>${esc(k)}</b></td><td class="n">${fmtTon(v)} t</td><td class="n">${toplam?('%'+Math.round(v/toplam*100)):''}</td></tr>`).join('');
    return card(baslik+' — '+esc(P.lbl)+' '+srcBadge(ds.src),
      table([{t:''},{t:tip==='urun'?'Ürün':(tip==='il'?'İl':'Ad')},{t:'Tonaj',n:1},{t:'Pay',n:1}],rows)+
      `<div class="ka-note">Sıralama ton bazlıdır · yalnız teslim edilen siparişler.</div>`);
  }).filter(Boolean).join('')||null;
}

// ---- Bu ay / geçen ay karşılaştırma (TMR + Yem) ----
function ansKiyas(q){
  const n=norm(q);
  if(!/gore|karsilastir|kiyasla|fark|artis|dusus/.test(n))return null;
  if(!/ton|satis|sat|ciro|uret/.test(n))return null;
  const now=new Date();
  const bu={tip:'ay',yil:String(now.getFullYear()),ay:String(now.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[now.getMonth()]+' '+now.getFullYear()};
  const g=new Date(now.getFullYear(),now.getMonth()-1,1);
  const on={tip:'ay',yil:String(g.getFullYear()),ay:String(g.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[g.getMonth()]+' '+g.getFullYear()};
  const pct=(x,y)=>y?Math.round((x-y)/y*100):null;const ok=v=>v==null?'—':(v>=0?'+':'')+v+'%';
  return datasets().map(ds=>{
    const oa=donemFiltre(ds.orders,bu),ob=donemFiltre(ds.orders,on);
    if(!oa.length&&!ob.length)return '';
    const ta=oa.reduce((s,o)=>s+ds.ton(o),0),tb=ob.reduce((s,o)=>s+ds.ton(o),0);
    const ca=oa.reduce((s,o)=>s+ds.total(o),0),cb=ob.reduce((s,o)=>s+ds.total(o),0);
    return card('Karşılaştırma — '+esc(bu.lbl)+' / '+esc(on.lbl)+' '+srcBadge(ds.src),
      row('Tonaj',fmtTon(ta)+' t / '+fmtTon(tb)+' t · <b style="color:'+((ta>=tb)?'#15803d':'#B91C1C')+'">'+ok(pct(ta,tb))+'</b>')+
      row('Sipariş',oa.length+' / '+ob.length)+
      row('Ciro',fmtTL(ca)+' / '+fmtTL(cb)+' · <b style="color:'+((ca>=cb)?'#15803d':'#B91C1C')+'">'+ok(pct(ca,cb))+'</b>')+
      `<div class="ka-note">İçinde bulunulan ay tamamlanmadığı için fark ay sonuna kadar değişir.</div>`);
  }).filter(Boolean).join('')||null;
}

// ---- Tonaj hedefi (TMR) ----
function ansHedef(q){
  if(!norm(q).includes('hedef'))return null;
  const H=(D().meta&&D().meta.tonajHedef)||{};const yil=String(new Date().getFullYear());
  const os=D().orders.filter(o=>satisMi(o)&&satisTarihi(o).slice(0,4)===yil);
  const byM={};os.forEach(o=>{const m=satisTarihi(o).slice(5,7);byM[m]=(byM[m]||0)+tmrTon(o);});
  const rows=AYLAR_TR.map((ad,i)=>{const k=yil+'-'+String(i+1).padStart(2,'0');const hv=+H[k]||0,g=byM[String(i+1).padStart(2,'0')]||0;if(!hv&&!g)return '';return `<tr><td>${ad}</td><td class="n">${hv?fmtTon(hv):'—'}</td><td class="n">${g?fmtTon(g):'—'}</td><td class="n" style="font-weight:700">${hv?('%'+Math.round(g/hv*100)):'—'}</td></tr>`;}).join('');
  if(!rows)return card('Tonaj Hedefleri — '+yil,`<p class="ka-p">Henüz aylık ton hedefi girilmemiş. Hedefler <a class="ka-link" href="siparis-takip/#raporlar">Sipariş Takip → Raporlar → Tonaj &amp; Hedef</a> ekranından girilir.</p>`);
  return card('Tonaj Hedefleri — '+yil+' '+srcBadge('tmr'),table([{t:'Ay'},{t:'Hedef (t)',n:1},{t:'Gerçekleşen (t)',n:1},{t:'Oran',n:1}],rows)+`<a class="ka-link" href="siparis-takip/#raporlar">Tonaj &amp; Hedef raporunu aç →</a>`);
}

// ---- Plasiyer performansı (Yem plasiyerleri) ----
function ansPlasiyerPerf(q){
  const n=norm(q);const kw=/plasiyer|saha temsilci|saha satis/.test(n);const qt=tokensOf(q);
  const mt=bestMatch(D().yemPlasiyerler,p=>p.name,qt.filter(t=>!/plasiyer|saha/.test(t)),kw?1:2);
  if(!kw&&!(mt&&mt.score>=2))return null;   // anahtar kelime YA DA güçlü plasiyer-adı eşleşmesi
  const P=parsePeriod(q),os=donemFiltre(D().yemOrders,P);
  const agg={};
  os.forEach(o=>{const pl=yemOrdPlasiyer(o);const key=pl?pl.id:'_merkez';const g=agg[key]||(agg[key]={ad:pl?pl.name:'Plasiyersiz (merkez)',ton:0,ciro:0,adet:0,mus:new Set()});g.ton+=yemTon(o);g.ciro+=yemTotal(o);g.adet++;if(o.customerId)g.mus.add(o.customerId);});
  const list=Object.values(agg).map(g=>({...g,mus:g.mus.size})).sort((a,b)=>b.ciro-a.ciro);
  if(!list.length)return null;
  if(mt){const g=agg[mt.item.id];if(g)return card('Plasiyer — '+esc(mt.item.name)+' ('+esc(P.lbl)+') '+srcBadge('yem'),
    row('Tonaj',`<span class="ka-big">${fmtTon(g.ton)} t</span>`)+row('Ciro',fmtTL(g.ciro))+row('Sipariş',g.adet+' adet')+row('Müşteri',g.mus.size+' müşteri')+
    `<a class="ka-link" href="yem/#raporlar">Plasiyer Raporu →</a>`);}
  const rows=list.map((g,i)=>`<tr><td><b>${i+1}.</b></td><td><b>${esc(g.ad)}</b></td><td class="n">${g.mus}</td><td class="n">${g.adet}</td><td class="n">${fmtTon(g.ton)} t</td><td class="n" style="font-weight:700">${fmtTL(g.ciro)}</td></tr>`).join('');
  return card('Plasiyer Performansı — '+esc(P.lbl)+' '+srcBadge('yem'),table([{t:''},{t:'Plasiyer'},{t:'Müşteri',n:1},{t:'Sipariş',n:1},{t:'Tonaj',n:1},{t:'Ciro',n:1}],rows)+`<a class="ka-link" href="yem/#raporlar">Plasiyer Raporu →</a>`);
}

// ---- Ürün fiyatı: TMR ----
function ansUrun(q){
  const nq=bare(q);
  let hits=D().products.filter(p=>p.active!==false&&nq.includes(bare(p.code)));
  hits.sort((a,b)=>b.code.length-a.code.length);
  hits=hits.filter(p=>!hits.some(o=>o!==p&&bare(o.code).includes(bare(p.code))));
  if(!hits.length)return null;
  const pl=activePL();
  return hits.slice(0,3).map(p=>{
    const bayiNot=/bayi/.test(norm(q))?`<div class="ka-note">Bayi alış fiyatı = Fabrika × (1 − bayi iskontosu). Örn. %3 iskontolu: ${fmtN((+p.fabrika||0)*0.97)} ₺</div>`:'';
    return card('Ürün Fiyatı — '+esc(p.code)+' ('+esc(p.pkg||'25 kg')+') '+srcBadge('tmr'),
      row('Fabrika Teslim',fmtN(p.fabrika)+' ₺')+row('Yakın Bayi Satış',fmtN(p.yakin)+' ₺')+row('Uzak Bayi Satış',fmtN(p.uzak)+' ₺')+
      (p.danismanListe?row('Danışman Liste (Torbalı)',fmtN(p.danismanListe)+' ₺'):'')+
      bayiNot+`<div class="ka-note">Güncel tarife: ${esc(D().meta.priceDate||(pl?fmtDate(pl.date):'—'))}</div>`);
  }).join('');
}
// ---- Ürün fiyatı: YEM (vade bazlı çuval/birim fiyatı) ----
function ansYemUrun(q){
  const nq=bare(q);
  let hits=D().yemProducts.filter(p=>p.active!==false&&bare(p.code)&&nq.includes(bare(p.code)));
  hits.sort((a,b)=>b.code.length-a.code.length);
  hits=hits.filter(p=>!hits.some(o=>o!==p&&bare(o.code).includes(bare(p.code))));
  if(!hits.length)return null;
  const VLBL={pesin:'Peşin','15':'15 gün','30':'30 gün','45':'45 gün','60':'60 gün','90':'90 gün'};
  return hits.slice(0,3).map(p=>{
    const cv=p.cuval||{},br=p.birim||{};
    let body='';
    const vd=['pesin','15','30','45','60','90'].filter(v=>(cv[v]!=null&&cv[v]!=='')||(br[v]!=null&&br[v]!==''));
    if(vd.length){body+=`<div class="ka-sub">Vade fiyatları (çuval / ${esc(p.pkg||'')})</div>`;
      vd.forEach(v=>{const c=(cv[v]!=null&&cv[v]!=='')?+cv[v]:((br[v]!=null&&br[v]!=='')?(+br[v]*(+p.kg||1)):null);if(c!=null)body+=row(VLBL[v]||v,fmtN(c)+' ₺');});
    } else body+=`<p class="ka-p">Bu ürün için sabit vade fiyatı tanımlı değil (elle girilir${p.kanatli?' · kanatlı':''}).</p>`;
    return card('Yem Ürün Fiyatı — '+esc(p.code)+' ('+esc(p.pkg||'')+') '+srcBadge('yem'),
      body+`<div class="ka-note">Müşteriye göre iskonto/nakliye/hammaliye ayrıca uygulanır · tarife: ${esc(D().yemMeta.fiyatTarihi||'—')} · <a href="yem/#urunler">Yem ürünleri</a></div>`);
  }).join('');
}

// ---- Kaç müşteri (TMR + Yem) ----
function ansKacMusteri(q){
  const n=norm(q);
  if(!/kac (tane )?musteri|musteri sayisi|toplam musteri|kac firma|musteri envanter/.test(n))return null;
  return datasets().map(ds=>{
    const cs=ds.custs.filter(c=>!c.arsiv);const iller={};cs.forEach(c=>{if(c.city)iller[c.city]=(iller[c.city]||0)+1;});
    const topIl=Object.entries(iller).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const bayili=ds.src==='tmr'?cs.filter(c=>c.bayiId).length:0,danli=ds.src==='tmr'?cs.filter(c=>!c.bayiId&&c.danismanId).length:0;
    return card('Müşteri Envanteri '+srcBadge(ds.src),
      row('Toplam Müşteri',`<span class="ka-big">${cs.length}</span>`)+
      (ds.src==='tmr'?row('Bayiye bağlı',bayili)+row('Danışmana bağlı',danli)+row('Fabrika (direkt)',cs.length-bayili-danli):'')+
      (topIl.length?`<div class="ka-sub">En çok müşteri olan iller</div>`+topIl.map(([il,adet])=>row(il,adet+' müşteri')).join(''):'')+
      `<a class="ka-link" href="${ds.src==='yem'?'yem/#musteriler':'siparis-takip/#musteriler'}">Müşteri listesini aç →</a>`);
  }).join('')||null;
}

// ---- ŞEHİR MODU: bir il yazılınca o ildeki HER ŞEY (çok bölüm) ----
function ansSehir(q){
  const hits=sehirEslesme(q);if(!hits.length)return [];
  const qt=tokensOf(q);
  // şehir dışında güçlü bir isim eşleşmesi varsa (ör. "afyonlu ahmet") şehir modunu bastırma
  const c=hits[0];const cadd=(x)=>norm(x||'').includes(c.nn);
  const out=[];
  // Müşteriler (TMR + Yem)
  [['tmr','TMR',D().customers,'siparis-takip/#musteriler'],['yem','Yem',D().yemCustomers,'yem/#musteriler']].forEach(([src,lbl,list,href])=>{
    const ms=list.filter(m=>!m.arsiv&&cadd(m.city));if(!ms.length)return;
    const rows=ms.slice(0,25).map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${telLink(m.phone)}</td><td>${mapsLink(m)}</td></tr>`).join('');
    out.push(card(esc(c.ad)+' Müşterileri ('+ms.length+') '+srcBadge(src),
      table([{t:'Müşteri'},{t:'Telefon'},{t:'Adres'}],rows)+(ms.length>25?`<div class="ka-note">İlk 25 gösterildi · <a href="${href}">tümü</a></div>`:'')));
  });
  // Bayiler + Danışmanlar (TMR / saha)
  [['bayi','Bayiler'],['danisman','Danışmanlar']].forEach(([tip,bas])=>{
    const ks=D().koms.filter(k=>k.type===tip&&k.active!==false&&cadd(k.city));if(!ks.length)return;
    const rows=ks.map(k=>`<tr><td><b>${esc(k.name)}</b></td><td>${telLink(k.phone)}</td><td>${mapsLink({adres:k.adres||(k.sz&&k.sz.adres)||'',city:k.city})}</td>${tip==='bayi'?`<td class="n">%${fmtN(k.rate||0)}</td>`:''}</tr>`).join('');
    out.push(card(esc(c.ad)+' — '+bas+' ('+ks.length+')',
      table(tip==='bayi'?[{t:'Ad'},{t:'Telefon'},{t:'Adres'},{t:'İskonto',n:1}]:[{t:'Ad'},{t:'Telefon'},{t:'Adres'}],rows)+`<a class="ka-link" href="saha/">Saha modülünde aç →</a>`));
  });
  // Şehir satış özeti (TMR + Yem)
  const P=parsePeriod(q);
  datasets().forEach(ds=>{
    const os=donemFiltre(ds.orders,P).filter(o=>cadd(ds.custCity(o)));if(!os.length)return;
    let ton=0,ciro=0;os.forEach(o=>{ton+=ds.ton(o);ciro+=ds.total(o);});
    out.push(card(esc(c.ad)+' Satış Özeti — '+esc(P.lbl)+' '+srcBadge(ds.src),
      row('Tonaj',`<span class="ka-big">${fmtTon(ton)} t</span>`)+row('Ciro',fmtTL(ciro))+row('Sipariş',os.length+' adet')));
  });
  return out;
}

// ---- Bayi/danışmana atanmış müşteriler + il müşterileri ----
function ansAtanmisMusteriler(q){
  const n=norm(q);if(!/musteri/.test(n))return null;
  const qt=tokensOf(q);const mt=bestMatch(D().koms,k=>k.name,qt);
  if(mt){const k=mt.item;const list=D().customers.filter(c=>k.type==='bayi'?c.bayiId===k.id:c.danismanId===k.id);
    const rows=list.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.city||'—')}</td><td>${telLink(c.phone)}</td></tr>`).join('');
    return card((k.type==='bayi'?'Bayi':'Danışman')+' Müşterileri — '+esc(k.name)+' ('+list.length+')',
      rows?table([{t:'Müşteri'},{t:'İl'},{t:'Telefon'}],rows):'<p class="ka-p">Bu '+(k.type==='bayi'?'bayiye':'danışmana')+' atanmış müşteri yok.</p>');}
  return null;
}

// ---- Bayi / Danışman detay ----
function ansBayiDanisman(q){
  const n=norm(q);if(!/bayi|danisman/.test(n))return null;
  const tip=/danisman/.test(n)?'danisman':'bayi';
  const list=D().koms.filter(k=>k.type===tip&&k.active!==false);const qt=tokensOf(q);
  const mt=bestMatch(list,k=>k.name,qt);
  if(mt){const k=mt.item;const dan=k.danismanId?komById(k.danismanId):null;
    const musSay=D().customers.filter(c=>tip==='bayi'?c.bayiId===k.id:c.danismanId===k.id).length;
    return card((tip==='bayi'?'Bayi':'Teknik Danışman')+' — '+esc(k.name),
      row('Şehir',esc(k.city||'—'))+row('Telefon',telLink(k.phone))+row('Adres',mapsLink({adres:k.adres||(k.sz&&k.sz.adres)||'',city:k.city}))+
      (tip==='bayi'?row('İskonto Oranı',(+k.ozelIskonto>0?('%'+fmtN(k.ozelIskonto)+' özel + %'+fmtN(k.rate||0)+' iskonto'):('%'+fmtN(k.rate||0)))):'')+(dan?row('Bağlı Danışman',esc(dan.name)):'')+row('Atanmış Müşteri',musSay+' müşteri')+
      `<a class="ka-link" href="saha/">Saha modülünde aç →</a>`);}
  if(/kimler|listesi|hepsi|tum|kac (tane )?bayi|kac (tane )?danisman/.test(n)||qt.length<=1){
    const rows=list.slice(0,30).map(k=>`<tr><td><b>${esc(k.name)}</b></td><td>${esc(k.city||'—')}</td><td>${esc(k.phone||'—')}</td></tr>`).join('');
    return card((tip==='bayi'?'Bayiler':'Danışmanlar')+' ('+list.length+')',table([{t:'Ad'},{t:'Şehir'},{t:'Telefon'}],rows)+`<a class="ka-link" href="saha/">Saha modülünde aç →</a>`);
  }
  return null;
}

// ---- Müşteri detay (TMR + Yem) ----
function ansMusteri(q){
  const qt=tokensOf(q);if(!qt.length)return null;const minS=Math.min(2,qt.filter(t=>t.length>=3).length)||1;
  const out=[];
  const mt=bestMatch(D().customers,c=>c.name,qt,minS);
  if(mt&&mt.score>=minS){const c=mt.item;const os=D().orders.filter(o=>o.customerId===c.id);
    const son=os.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
    const bayi=c.bayiId?komById(c.bayiId):null,dan=c.danismanId?komById(c.danismanId):null;
    out.push(card('Müşteri — '+esc(c.name)+(c.arsiv?' <span class="ka-src" style="background:#eef2f7;color:#8aa0b8">ARŞİV</span>':'')+' '+srcBadge('tmr'),
      row('Telefon',telLink(c.phone))+row('Adres',mapsLink(c))+row('Şehir',esc(c.city||'—'))+(c.firma?row('Firma',esc(c.firma)):'')+
      (bayi?row('Bayisi',esc(bayi.name)):'')+(dan?row('Danışmanı',esc(dan.name)):'')+(!bayi&&!dan?row('Bağlantı','Fabrika (direkt)'):'')+
      row('Sipariş Sayısı',os.length+(c.orderCount?' (+'+c.orderCount+' arşiv)':''))+(son?row('Son Sipariş',fmtDate(son.date)+' · #'+son.no):'')+
      `<a class="ka-link" href="siparis-takip/#musteriler">Müşteriler sayfasında aç →</a>`));}
  const my=bestMatch(D().yemCustomers,c=>c.name,qt,minS);
  if(my&&my.score>=minS){const c=my.item;const os=D().yemOrders.filter(o=>o.customerId===c.id);
    const son=os.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];const pl=c.plasiyerId?yemPlasById(c.plasiyerId):null;
    out.push(card('Müşteri — '+esc(c.name)+' '+srcBadge('yem'),
      row('Telefon',telLink(c.phone))+row('Adres',mapsLink(c))+row('Şehir / İlçe',esc([c.city,c.ilce].filter(Boolean).join(' / ')||'—'))+
      (c.grup?row('Grup',esc(c.grup)):'')+(pl?row('Plasiyeri',esc(pl.name)):'')+
      (c.iskonto?row('İskonto','%'+fmtN(c.iskonto)+(c.iskontoTL?' + '+fmtN(c.iskontoTL)+' ₺/çuval':'')):'')+
      row('Sipariş Sayısı',os.length+' adet')+(son?row('Son Sipariş',fmtDate(son.date)+' · #Y'+son.no):'')+
      `<a class="ka-link" href="yem/#musteriler">Yem müşterileri →</a>`));}
  return out.length?out.join(''):null;
}

// ---- Personel ----
function ansPersonel(q){
  const ps=D().personeller;if(!ps.length)return null;
  const mt=bestMatch(ps,p=>p.ad,tokensOf(q),2);if(!mt)return null;
  const p=mt.item;const s=izinOzet(p,new Date().getFullYear());
  return card('Personel — '+esc(p.ad),
    row('Görev',esc(p.gorev||'—'))+row('Departman',esc(p.departman||'—'))+row('Telefon',esc(p.telefon||'—'))+row('İşe Giriş',fmtDate(p.iseGiris))+row('Kalan Yıllık İzin',s.kalan+' gün')+
    `<div class="ka-note">Ücret ve mali bilgiler aramaya kapalıdır.</div><a class="ka-link" href="hr/">İK modülünde aç →</a>`);
}
function ansIzin(q){
  const n=norm(q);if(!n.includes('izin')&&!n.includes('izn'))return null;
  const yil=new Date().getFullYear();const ps=D().personeller.filter(p=>(p.durum||'aktif')!=='ayrildi');
  if(!ps.length)return card('Yıllık İzin',`<p class="ka-p">İK modülünde henüz personel kaydı yok. <a class="ka-link" href="hr/">İK modülünü aç</a></p>`);
  const mt=bestMatch(ps,p=>p.ad,tokensOf(q));
  if(mt){const p=mt.item,s=izinOzet(p,yil);
    return card('Yıllık İzin — '+esc(p.ad)+' ('+yil+')',
      row('Devir',s.devir+' gün')+row('Hak Ediş',s.hak+' gün')+row('Kullanılan',s.kullanilan+' gün')+
      row('Kalan',`<span class="ka-big" style="color:${s.kalan<0?'#B91C1C':'#15803d'}">${s.kalan} gün</span>`)+`<a class="ka-link" href="hr/">İK modülünde aç →</a>`);}
  const rows=ps.map(p=>({p,s:izinOzet(p,yil)})).sort((a,b)=>b.s.kalan-a.s.kalan).map(({p,s})=>`<tr><td>${esc(p.ad)}</td><td class="n">${s.hak+s.devir}</td><td class="n">${s.kullanilan}</td><td class="n" style="font-weight:700;color:${s.kalan<0?'#B91C1C':'#15803d'}">${s.kalan}</td></tr>`).join('');
  return card('Yıllık İzin Durumu — '+yil,table([{t:'Personel'},{t:'Toplam Hak',n:1},{t:'Kullanılan',n:1},{t:'Kalan',n:1}],rows)+`<a class="ka-link" href="hr/">İK modülünde aç →</a>`);
}
function ansAvans(q){
  const n=norm(q);if(!/avans/.test(n))return null;
  const av=D().avanslar;if(!av.length)return card('Avanslar','<p class="ka-p">İK modülünde henüz avans kaydı yok. <a class="ka-link" href="hr/">İK modülünü aç</a></p>');
  const mt=bestMatch(D().personeller,p=>p.ad,tokensOf(q));const list=mt?av.filter(a=>a.personelId===mt.item.id):av;
  const pAd=id=>{const p=D().personeller.find(x=>x.id===id);return p?p.ad:'—';};
  const rows=list.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).slice(0,15).map(a=>`<tr><td><b>${esc(pAd(a.personelId))}</b></td><td>${fmtDate(a.tarih)}</td><td class="n">${fmtTL(a.tutar)}</td><td class="n">${a.taksit||1} ay</td><td class="n" style="font-weight:700">${fmtTL(avansKalanH(a))}</td></tr>`).join('');
  const acik=list.reduce((s,a)=>s+avansKalanH(a),0);
  return card('Avanslar'+(mt?' — '+esc(mt.item.ad):''),row('Açık Avans Bakiyesi',`<span class="ka-big">${fmtTL(acik)}</span>`)+table([{t:'Personel'},{t:'Tarih'},{t:'Tutar',n:1},{t:'Taksit',n:1},{t:'Kalan',n:1}],rows)+`<a class="ka-link" href="hr/">İK modülünde aç →</a>`);
}
function ansTazminat(q){
  const n=norm(q);if(!/kidem|ihbar|tazminat/.test(n))return null;
  const ps=D().personeller.filter(p=>(p.durum||'aktif')!=='ayrildi');if(!ps.length)return card('Kıdem / İhbar','<p class="ka-p">İK modülünde henüz personel kaydı yok. <a class="ka-link" href="hr/">İK modülünü aç</a></p>');
  const tavan=+(D().tazminatAyar.kidemTavan)||0;
  const hesap=p=>{const ay=aylarFarki(p.iseGiris),yil=Math.floor(ay/12),kalanAy=ay%12;const hafta=ihbarHaftasi(p.iseGiris);const brut=+String(p.ucret||'').replace(/[^\d.,]/g,'').replace(',','.')||0;const esas=tavan?Math.min(brut,tavan):brut;return {ay,yil,kalanAy,hafta,brut,kidemT:brut?esas*(ay/12):0,ihbarT:brut?(brut/30)*(hafta*7):0};};
  const mt=bestMatch(ps,p=>p.ad,tokensOf(q));
  if(mt){const p=mt.item,r=hesap(p);
    return card('Kıdem & İhbar — '+esc(p.ad),
      row('İşe Giriş',fmtDate(p.iseGiris))+row('Kıdem',(r.yil?r.yil+' yıl ':'')+(r.kalanAy?r.kalanAy+' ay':(r.yil?'':'1 yıldan az')))+row('Yasal İhbar',r.hafta+' hafta ('+(r.hafta*7)+' gün)')+
      (r.brut?row('Tahmini Kıdem (brüt)',fmtTL(r.kidemT))+row('Tahmini İhbar (brüt)',fmtTL(r.ihbarT)):'')+
      `<div class="ka-note">${r.brut?'Kıdem tavanı uygulanmıştır. Tutarlar brüt tahmindir.':'Ücret girilmediği için tutar hesaplanamadı.'} 4857 m.17 & 1475 m.14.</div><a class="ka-link" href="hr/">İK modülünde aç →</a>`);}
  const rows=ps.map(p=>{const r=hesap(p);return `<tr><td><b>${esc(p.ad)}</b></td><td>${fmtDate(p.iseGiris)}</td><td>${r.yil} yıl ${r.kalanAy} ay</td><td class="n">${r.hafta} hafta</td><td class="n">${r.brut?fmtTL(r.kidemT):'—'}</td></tr>`;}).join('');
  return card('Kıdem & İhbar Özeti',table([{t:'Personel'},{t:'İşe Giriş'},{t:'Kıdem'},{t:'İhbar',n:1},{t:'Tahmini Kıdem',n:1}],rows)+`<div class="ka-note">Tutarlar brüt tahmindir (tavan uygulanır).</div>`);
}
function ansKomisyon(q){
  const n=norm(q);if(!/komisyon|hakedis|hak edis|prim|iskonto/.test(n))return null;
  const mt=bestMatch(D().koms,k=>k.name,tokensOf(q));
  if(mt){const k=mt.item;
    if(k.type==='danisman'){const h=danismanHakedis(k.id);return card('Danışman Hakedişi — '+esc(k.name),row('Hak Edilen (toplam)',fmtTL(h.hak))+row('Ödenen',fmtTL(h.odenen))+row('Kalan Bakiye',`<span class="ka-big" style="color:${h.bakiye>0?'#B91C1C':'#15803d'}">${fmtTL(h.bakiye)}</span>`)+row('Sipariş',h.adet+' adet')+`<div class="ka-note">Prim fatura karşılığı ödenir · <a href="siparis-takip/#komisyon">İskonto &amp; Komisyon</a></div>`);}
    const yil=new Date().getFullYear();const A=bayiAlimOzet(k.id,yil);
    return card('Bayi İskonto Raporu — '+esc(k.name)+' ('+yil+')',row('Alım',A.adet+' sipariş · '+fmtTL(A.fatura))+row('Yararlanılan İskonto'+(+k.ozelIskonto>0?(' (%'+fmtN(k.ozelIskonto)+' özel + %'+fmtN(k.rate||0)+')'):(' (%'+fmtN(k.rate||0)+')')),`<span class="ka-big" style="color:#B45309">${fmtTL(A.iskonto)}</span>`)+`<div class="ka-sub">Çeyrek kırılımı</div>`+['Ç1 (Oca–Mar)','Ç2 (Nis–Haz)','Ç3 (Tem–Eyl)','Ç4 (Eki–Ara)'].map((cl,i)=>row(cl,fmtTL(A.ceyrek[i]))).join('')+`<div class="ka-note">Bayi iskontosu fatura anında uygulanır; birikme yoktur. <a href="siparis-takip/#komisyon">İskonto &amp; Komisyon</a></div>`);}
  const ds=D().koms.filter(k=>k.type==='danisman').map(k=>({k,h:danismanHakedis(k.id)})).filter(x=>x.h.adet>0);
  if(!ds.length)return null;
  const rows=ds.sort((a,b)=>b.h.bakiye-a.h.bakiye).map(({k,h})=>`<tr><td>${esc(k.name)}</td><td class="n">${fmtTL(h.hak)}</td><td class="n">${fmtTL(h.odenen)}</td><td class="n" style="font-weight:700">${fmtTL(h.bakiye)}</td></tr>`).join('');
  return card('Danışman Komisyon Bakiyeleri',table([{t:'Danışman'},{t:'Hak Edilen',n:1},{t:'Ödenen',n:1},{t:'Bakiye',n:1}],rows));
}
function ansPersonelSayisi(q){
  const n=norm(q);if(!/kac (tane )?personel|personel sayisi|kac calisan|calisan sayisi/.test(n))return null;
  const ps=D().personeller;if(!ps.length)return card('Personel','<p class="ka-p">İK modülünde henüz personel kaydı yok. <a class="ka-link" href="hr/">İK modülünü aç</a></p>');
  const aktif=ps.filter(p=>(p.durum||'aktif')!=='ayrildi');const dep={};aktif.forEach(p=>{const d2=p.departman||'Belirsiz';dep[d2]=(dep[d2]||0)+1;});
  return card('Personel',row('Aktif Personel',`<span class="ka-big">${aktif.length}</span>`)+(ps.length>aktif.length?row('Ayrılan',ps.length-aktif.length):'')+Object.entries(dep).sort((a,b)=>b[1]-a[1]).map(([d2,adet])=>row(d2,adet)).join('')+`<a class="ka-link" href="hr/">İK modülünde aç →</a>`);
}

// ---- Serbest çok-varlık arama (fallback) ----
function ansGenel(q){
  const qt=tokensOf(q);if(!qt.length)return null;const nq=bare(q);
  const mCust=D().customers.filter(c=>nameScore(c.name,qt)>=1).slice(0,6);
  const mYCust=D().yemCustomers.filter(c=>nameScore(c.name,qt)>=1).slice(0,6);
  const mKom=D().koms.filter(k=>k.active!==false&&nameScore(k.name,qt)>=1).slice(0,6);
  const mPer=D().personeller.filter(p=>nameScore(p.ad,qt)>=1).slice(0,6);
  const mProd=D().products.filter(p=>p.active!==false&&(nq.includes(bare(p.code))||qt.some(t=>bare(p.code).includes(t)))).slice(0,4);
  const mYProd=D().yemProducts.filter(p=>p.active!==false&&(nq.includes(bare(p.code))||qt.some(t=>bare(p.code).includes(t)))).slice(0,4);
  const li=(tip,src,ad,ek,href)=>`<tr><td><span class="ka-chip">${tip}</span></td><td><b>${esc(ad)}</b>${srcBadge(src)}</td><td>${ek||''}</td><td><a class="ka-link" href="${href}">aç</a></td></tr>`;
  let rows='';
  mCust.forEach(c=>rows+=li('Müşteri','tmr',c.name,[telLink(c.phone),mapsLink(c)].filter(x=>x!=='—').join(' · ')||'','siparis-takip/#musteriler'));
  mYCust.forEach(c=>rows+=li('Müşteri','yem',c.name,[telLink(c.phone),esc(c.city||'')].filter(x=>x&&x!=='—').join(' · ')||'','yem/#musteriler'));
  mKom.forEach(k=>rows+=li(k.type==='bayi'?'Bayi':'Danışman','tmr',k.name,[telLink(k.phone),esc(k.city||'')].filter(x=>x&&x!=='—').join(' · ')||'','saha/'));
  mPer.forEach(p=>rows+=li('Personel','ik',p.ad,esc(p.gorev||''),'hr/'));
  mProd.forEach(p=>rows+=li('Ürün','tmr',p.code,esc(p.pkg||''),'siparis-takip/#urunler'));
  mYProd.forEach(p=>rows+=li('Ürün','yem',p.code,esc(p.pkg||''),'yem/#urunler'));
  if(!rows)return null;
  return card('Eşleşen Kayıtlar',table([{t:''},{t:'Ad'},{t:'Bilgi'},{t:''}],rows));
}

// ============================================================
//  SİTE REHBERİ — portal içi Google: modül + nasıl/nerede + örnek sorular
//  Muhasebe & Finans katalogda YOKTUR (finans verisi döndürülmez).
// ============================================================
const SITE_MODULLER=[
  {id:'siparis',ad:'Sipariş Takip (TMR)',href:'siparis/',kw:['siparis takip','tmr','siparis sistemi','siparis paneli','siparis modul'],
   ne:'TMR siparişleri, müşteri/bayi, ürün tarifeleri, raporlar, komisyon & iskonto, ön sipariş.',
   ornek:['Bekleyen siparişler','Bu ay tonaj','#123 sipariş','En çok satan ürün']},
  {id:'tmr',ad:'TMR Sipariş Detay',href:'siparis-takip/',kw:['siparis takip detay','tmr panel','kanban'],
   ne:'Sipariş listesi, müşteriler, ürünler, raporlar, İskonto & Komisyon ekranı.',
   ornek:['Danışman hakedişi','Bayi iskonto','Tonaj hedefi']},
  {id:'yem',ad:'Yem Sipariş',href:'yem/',kw:['yem siparis','yem panel','yem modul','kanatli'],
   ne:'Yem hattı siparişleri, plasiyer performansı, vade fiyatları, Yem müşterileri.',
   ornek:['Plasiyer performansı','Yem ürün fiyatı','Yem müşteri sayısı']},
  {id:'saha',ad:'Bayi & Teknik Danışman (Saha)',href:'saha/',kw:['saha','bayi harita','danisman harita','sozlesme','evrak takip','belge takip'],
   ne:'Bayi/danışman listesi, Türkiye haritası, sözleşme paketi, evrak gönderim/yükleme takibi, portal erişimi.',
   ornek:['Afyon bayileri','Evrak durumu','Sözleşme nerede']},
  {id:'ik',ad:'İnsan Kaynakları',href:'ik/',kw:['insan kaynak','ik modul','ik paneli','hr','isg','kvkk'],
   ne:'Personel, izin, avans, kıdem/ihbar, İSG & KVKK kartları (ücret bordrosu aramaya kapalı).',
   ornek:['Kimin izni kaldı','Personel sayısı','Kıdem hesabı']},
  {id:'hr',ad:'İK Uygulaması',href:'hr/',kw:['izin takip','avans yonet','personel listesi','kidem ihbar'],
   ne:'İzin bakiyeleri, avans taksitleri, kıdem & ihbar tahmini, personel kartları.',
   ornek:['Yıllık izin durumu','Açık avans bakiyesi']},
  {id:'bakim',ad:'Makine Envanter / Bakım',href:'bakim/',kw:['bakim','makine','envanter','ariza','yedek parca','pbs'],
   ne:'Bakım/arıza kayıtları, makine etiketleri, kullanım kılavuzu linkleri. (Maliyet tutarları aramada gizlenir.)',
   ornek:['Açık arızalar','Hangi makineler var','Bakım modülü']},
  {id:'toplanti',ad:'Haftalık Yönetim Toplantısı',href:'haftalik-toplanti/',kw:['toplanti','haftalik yonetim','kontrol listesi','yonetim kurulu','fabrika insaat'],
   ne:'Haftalık kontrol listesi, üretim istatistikleri, inşaat takibi, yönetim kurulu raporu.',
   ornek:['Haftalık toplantı nerede','Toplantı kontrol listesi']},
  {id:'bayi-portal',ad:'Bayi Portalı (dış)',href:'bayi-site/',kw:['bayi portal','bayi site','dis erisim','bayi giris'],
   ne:'Bayilerin kendi siparişlerini verdiği dış portal. İç personel Saha’dan portal açar/kapatır.',
   ornek:['Bayi portalı nasıl açılır']},
  {id:'onay',ad:'Sipariş Onay Akışı',href:'fabrika-onay/',kw:['fabrika onay','uretim onay','siparis onay','onay sureci','telegram onay'],
   ne:'TMR: sipariş önce finans onayına, sonra üretime gider. Yem: tek kapı. Telegram’dan onaylanır.',
   ornek:['Onay bekleyen siparişler','Fabrika onay']},
];
// Sık sorulan “nasıl / nerede / ne işe yarar” — veri değil rehber
const SITE_SSS=[
  {kw:['nasil siparis','siparis nasil','yeni siparis','siparis ac'],bas:'Yeni sipariş nasıl açılır?',
   cevap:'Portal → <b>Sipariş Takip</b> (TMR) veya <b>Yem Sipariş</b>. Listede “Yeni Sipariş” ile müşteri/ürün seçilir; kayıt sonrası onay akışı başlar.',href:'siparis/'},
  {kw:['on siparis','onsiparis','ileri tarihli siparis'],bas:'Ön sipariş nedir?',
   cevap:'Henüz kesinleşmemiş / ileri tarihli talep. <code>preOrders</code> dizisinde yaşar; tonaj ve ciroya <b>karışmaz</b>. Panel hafta görünümünde ayrı şeritte.',href:'siparis-takip/'},
  {kw:['fiyat listesi','tarife','fiyat tarife','guncel fiyat'],bas:'Fiyat tarifesi nerede?',
   cevap:'TMR: Sipariş Takip → Ürünler / sipariş modalındaki tarife seçici. Yem: Yem → Ürünler (vade fiyatları). Arama kutusuna ürün kodu yazınca güncel fiyat gelir.',href:'siparis-takip/#urunler'},
  {kw:['komisyon nerede','prim nerede','hakedis nerede','iskonto ekran'],bas:'İskonto & Komisyon ekranı',
   cevap:'Sipariş Takip → <b>İskonto & Komisyon</b>. Danışman primi (teslim edilen sipariş) ve bayi alım iskontosu burada. Dönem filtresi prim ile ödemeyi aynı pencerede tutar.',href:'siparis-takip/#komisyon'},
  {kw:['rapor nerede','tonaj rapor','ciro rapor','yonetici rapor'],bas:'Raporlar',
   cevap:'TMR: Sipariş Takip → Raporlar (tonaj, hedef, müşteri, yönetici). Yem: Yem → Raporlar (plasiyer). Aramada “bu ay tonaj / ciro” diye de sorabilirsiniz.',href:'siparis-takip/#raporlar'},
  {kw:['evrak','belge takip','sozlesme gonder','whatsapp sozlesme'],bas:'Saha evrak & sözleşme',
   cevap:'Saha → Sözleşmeler / bayi kartı: antetli sözleşme indir, WA/Mail gönder, yüklenen imzalı belgeleri takip et (Bekliyor → Gönderildi → Yüklendi).',href:'saha/'},
  {kw:['yetki','erisim yonet','kullanici ekle','arama izni','portal yonetici'],bas:'Erişim / yetki yönetimi',
   cevap:'Portal sağ üst çark (yalnız portal yöneticisi) → kullanıcı, modül seviyesi, <b>Arama</b> izni, fiyat görme, bölüm sekmeleri.',href:'./'},
  {kw:['sifre','sifremi unuttum','sifre degistir'],bas:'Şifre',
   cevap:'Giriş sonrası üst bardaki profil/şifre alanı. Süresi dolan şifre uyarı verir; yönetici sıfırlayabilir.',href:'./'},
  {kw:['kalite','iso','laboratuvar','brcgs'],bas:'Kalite Kontrol',
   cevap:'Portal kartında <b>Yakında</b>. Henüz canlı modül yok — arama da yönlendirmez.',href:null},
  {kw:['dbs nedir','imece nedir','vade fark'],bas:'DBS / İMECE (kısa bilgi)',
   cevap:'DBS: banka iskontosu sipariş netine işler (oran siparişe damgalanır). İMECE: vadeli KK farkı (TMR’de açık olabilir). Kasa/tahsilat aramaya kapalıdır; detay sipariş modalında.',href:'siparis-takip/'},
];

function rehberSkor(entry,n){
  let sc=0;(entry.kw||[]).forEach(k=>{if(n.includes(norm(k)))sc+=Math.max(3,norm(k).split(' ').length*2);});
  const adn=norm(entry.ad||entry.bas||'');
  if(adn&&n.includes(adn))sc+=8;
  return sc;
}
function ansRehber(q){
  const n=norm(q);
  const yardim=/^(yardim|yardım|rehber|ne sor|ne yapabilir|nasil kullan|site ici|google|ornek soru|ne sorabilirim)\b/.test(n)
    ||/ne sorabilir|ornek sorular|site rehberi|portal rehberi|hangi modul|moduller neler|ne var bu sitede/.test(n);
  const nere=/nerede|nerde|hangi ekran|hangi modul|nasil ac|nasil gir|ne ise yarar|ne is|acilir mi/.test(n);

  const modHits=SITE_MODULLER.map(m=>({m,sc:rehberSkor(m,n)})).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc);
  const sssHits=SITE_SSS.map(s=>({s,sc:rehberSkor(s,n)})).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc);

  if(!yardim&&!nere&&!modHits.length&&!sssHits.length)return null;

  // Tek SSS net eşleşme
  if(!yardim&&sssHits.length&&sssHits[0].sc>=4&&(!modHits.length||sssHits[0].sc>=modHits[0].sc)){
    const s=sssHits[0].s;
    return card('Rehber — '+esc(s.bas),`<p class="ka-p">${s.cevap}</p>`+(s.href?`<a class="ka-link" href="${s.href}">Modülü aç →</a>`:''));
  }
  // Tek modül
  if(!yardim&&modHits.length&&modHits[0].sc>=4){
    const m=modHits[0].m;
    return card('Modül — '+esc(m.ad),
      `<p class="ka-p">${esc(m.ne)}</p>`+
      (m.ornek&&m.ornek.length?`<div class="ka-sub">Örnek sorular</div><ul class="ka-ul">${m.ornek.map(o=>`<li><a href="#" onclick="kaAsk(${JSON.stringify(o)});return false">${esc(o)}</a></li>`).join('')}</ul>`:'')+
      `<a class="ka-link" href="${m.href}">${esc(m.ad)} aç →</a>`);
  }
  // Tam rehber / yardım
  if(yardim||(nere&&!modHits.length&&!sssHits.length)||(modHits.length+sssHits.length>=2)){
    const rows=SITE_MODULLER.map(m=>`<tr><td><b>${esc(m.ad)}</b></td><td>${esc(m.ne)}</td><td><a class="ka-link" href="${m.href}">aç</a></td></tr>`).join('');
    const ornekler=[
      'Bekleyen siparişler','Bu ay tonaj','Bu yıl ciro','En çok satan ürün','Afyon',
      'Plasiyer performansı','Kimin izni kaldı','Açık arızalar','Evrak durumu','Yardım'
    ];
    return card('Portal Rehberi — Ne sorabilirsiniz?',
      `<p class="ka-p">Bu arama, Rota portalındaki <b>açık modüllerin</b> site içi Google’ıdır. Muhasebe &amp; finans (kasa, banka, tahsilat, maaş) <b>kapalıdır</b>.</p>`+
      `<div class="ka-sub">Modüller</div>`+table([{t:'Modül'},{t:'Ne işe yarar'},{t:''}],rows)+
      `<div class="ka-sub">Hızlı örnekler</div><ul class="ka-ul">${ornekler.map(o=>`<li><a href="#" onclick="kaAsk(${JSON.stringify(o)});return false">${esc(o)}</a></li>`).join('')}</ul>`+
      (sssHits.slice(0,3).map(({s})=>card('SSS — '+esc(s.bas),`<p class="ka-p">${s.cevap}</p>`+(s.href?`<a class="ka-link" href="${s.href}">Aç →</a>`:''))).join('')));
  }
  return null;
}

// ---- Ön sipariş (TMR) ----
function ansOnSiparis(q){
  const n=norm(q);if(!/on siparis|onsiparis|ileri tarih|on talep/.test(n))return null;
  const list=(D().preOrders||[]).filter(p=>(p.durum||'acik')==='acik');
  if(!list.length)return card('Ön Siparişler','<p class="ka-p">Açık ön sipariş yok. Ön siparişler kesin siparişe dönüşmeden tonaj/ciroya girmez. <a class="ka-link" href="siparis-takip/">Sipariş Takip</a></p>');
  const rows=list.slice().sort((a,b)=>(a.tarih||'').localeCompare(b.tarih||'')).slice(0,20).map(p=>{
    let ton=0;(p.lines||[]).forEach(l=>{if(l.code)ton+=tonOf(l.code,l.qty);});
    return `<tr><td><b>#Ö${esc(p.no||'—')}</b></td><td>${esc(p.customer||'—')}</td><td>${fmtDate(p.tarih)}</td><td class="n">${fmtTon(ton)} t</td></tr>`;
  }).join('');
  return card('Açık Ön Siparişler ('+list.length+') '+srcBadge('tmr'),
    table([{t:'No'},{t:'Müşteri'},{t:'Tarih'},{t:'Tonaj',n:1}],rows)+
    `<div class="ka-note">Ön sipariş ayrı dizidedir; satış raporlarına sızmaz. <a href="siparis-takip/">Panelde aç</a></div>`);
}

// ---- Tarife özeti ----
function ansTarife(q){
  const n=norm(q);if(!/tarife|fiyat listesi|guncel fiyat|hangi tarife|aktif tarife/.test(n))return null;
  const pl=activePL();const ls=(D().priceLists||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!ls.length)return card('Fiyat Tarifeleri','<p class="ka-p">Henüz tarife kaydı yok. <a class="ka-link" href="siparis-takip/#urunler">Ürünler</a></p>');
  const rows=ls.slice(0,8).map(p=>`<tr><td><b>${fmtDate(p.date)}</b>${p.id===(D().meta.activePriceListId||(pl&&pl.id))?' · <span class="ka-chip">Güncel</span>':''}</td><td>${esc(p.note||'—')}</td><td class="n">${(p.items||[]).length} kalem</td></tr>`).join('');
  return card('TMR Fiyat Tarifeleri '+srcBadge('tmr'),
    row('Aktif tarife',pl?fmtDate(pl.date)+(pl.note?' · '+esc(pl.note):''):'—')+
    table([{t:'Tarih'},{t:'Not'},{t:'Kalem',n:1}],rows)+
    `<div class="ka-note">Prim hesabı teslim günü as-of tarifeyi kullanır. Ürün kodu yazarak fiyat da sorabilirsiniz.</div>`);
}

// ---- Saha evrak özeti ----
function ansSahaEvrak(q){
  const n=norm(q);if(!/evrak|belge durum|sozlesme durum|belge takip|yuklenmeyen|gonderilmeyen/.test(n))return null;
  const defs=t=>t==='bayi'
    ?[['sozlesme'],['ekform'],['kvkk'],['vergi']]:[['sozlesme'],['kvkk'],['vergi']];
  const yuklu=b=>!!(b&&b.url);const gonderildi=b=>!!(b&&(b.gonderildi||b.gonderTs));
  const ks=D().koms.filter(k=>(k.type==='bayi'||k.type==='danisman')&&k.active!==false);
  let tot=0,yuk=0,gon=0,bek=0;const eksik=[];
  ks.forEach(k=>{
    defs(k.type).forEach(([key])=>{
      tot++;const b=((k.belgeler)||{})[key];
      if(yuklu(b))yuk++;else if(gonderildi(b)){gon++;eksik.push({k,key,st:'Gönderildi'});}
      else{bek++;eksik.push({k,key,st:'Bekliyor'});}
    });
  });
  const mt=bestMatch(ks,k=>k.name,tokensOf(q),2);
  if(mt){
    const k=mt.item;const rows=defs(k.type).map(([key])=>{
      const b=((k.belgeler)||{})[key];const st=yuklu(b)?'Yüklendi':(gonderildi(b)?'Gönderildi':'Bekliyor');
      return `<tr><td>${esc(key)}</td><td><b>${st}</b></td></tr>`;
    }).join('');
    return card('Evrak — '+esc(k.name),table([{t:'Belge'},{t:'Durum'}],rows)+`<a class="ka-link" href="saha/">Saha’da aç →</a>`);
  }
  const topEksik=eksik.filter(x=>x.st!=='Yüklendi').slice(0,12)
    .map(x=>`<tr><td>${esc(x.k.name)}</td><td>${esc(x.k.type)}</td><td>${esc(x.key)}</td><td>${esc(x.st)}</td></tr>`).join('');
  return card('Saha Evrak Özeti',
    row('Toplam kalem',tot)+row('Yüklendi',yuk)+row('Gönderildi (bekleyen yükleme)',gon)+row('Bekliyor',bek)+
    (topEksik?`<div class="ka-sub">Eksik / bekleyen (örnek)</div>`+table([{t:'Ad'},{t:'Tip'},{t:'Belge'},{t:'Durum'}],topEksik):'')+
    `<a class="ka-link" href="saha/">Saha evrak takibi →</a>`);
}

// ---- Bakım / makine ----
function ansBakim(q){
  const n=norm(q);if(!/bakim|makine|ariza|envanter|yedek parca/.test(n))return null;
  // Rehber “bakım modülü” → ansRehber; burada veri
  const kay=D().bakimKayitlar||[];
  if(!kay.length&&!/modul|nerede|nasil/.test(n))return card('Makine Bakım','<p class="ka-p">Henüz bakım kaydı yok. <a class="ka-link" href="bakim/">Makine Envanter</a></p>');
  if(/modul|nerede|nasil/.test(n)&&!/ariza|acik|bekleyen|hangi makine/.test(n))return null;
  const acik=kay.filter(k=>/bekle|devam|acik/i.test(String(k.durum||'')));
  const mc={};kay.forEach(k=>{const m=k.makine||'Genel';if(m!=='Genel')mc[m]=(mc[m]||0)+1;});
  const topM=Object.entries(mc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const rowsAcik=acik.slice(0,10).map(k=>`<tr><td>${fmtDate(k.tarih)}</td><td><b>${esc(k.makine||'—')}</b></td><td>${esc((k.sorun||'').slice(0,60))}</td><td>${esc(k.durum||'')}</td></tr>`).join('');
  return card('Makine Bakım Özeti',
    row('Toplam kayıt',kay.length)+row('Açık / beklemede',`<span class="ka-big">${acik.length}</span>`)+
    (topM.length?`<div class="ka-sub">En çok kayıtlı makineler</div>`+topM.map(([m,a])=>row(m,a+' kayıt')).join(''):'')+
    (rowsAcik?`<div class="ka-sub">Açık kayıtlar</div>`+table([{t:'Tarih'},{t:'Makine'},{t:'Sorun'},{t:'Durum'}],rowsAcik):'')+
    `<div class="ka-note">Maliyet tutarları aramada gösterilmez. <a href="bakim/">Bakım modülü</a></div>`);
}

// ---- Haftalık toplantı (rehber ağırlıklı; canlı checklist apps/toplanti ayrı) ----
function ansToplanti(q){
  const n=norm(q);if(!/toplanti|haftalik yonetim|yonetim kurulu|kontrol listesi/.test(n))return null;
  if(/siparis|tonaj|ciro|musteri|bayi|izin|avans/.test(n)&&!/toplanti|haftalik/.test(n))return null;
  return card('Haftalık Yönetim Toplantısı',
    `<p class="ka-p">Kontrol listesi, üretim istatistikleri, fabrika inşaat takibi ve yönetim kurulu raporu bu modülde doldurulur.</p>`+
    `<a class="ka-link" href="haftalik-toplanti/">Toplantı modülünü aç →</a>`);
}

function ansBos(){
  return card('Sonuç Bulunamadı',`<p class="ka-p">Bu soruya karşılık gelen bir veri bulunamadı. Portal rehberinden deneyin:</p>
  <ul class="ka-ul">
    <li><a href="#" onclick="kaAsk('Yardım');return false">Yardım / ne sorabilirim?</a></li>
    <li>"Bekleyen siparişler" · "Bu ay tonaj" · "Bu yıl ciro"</li>
    <li>"En çok satan ürün" · "Afyon" (il yazın)</li>
    <li>"Plasiyer performansı" · "Evrak durumu" · "Açık arızalar"</li>
    <li>"Kimin izni kaldı" · "Ön siparişler" · "Aktif tarife"</li>
    <li>"[ürün kodu] fiyatı" · "[danışman] komisyon"</li>
  </ul>
  <div class="ka-note">Muhasebe &amp; finans (kasa, banka, tahsilat, maaş) aramaya kapalıdır.</div>`);
}

// ============================================================
//  ORKESTRASYON — çok bölümlü sonuç
// ============================================================
function analyze(q){
  const secs=[];  // {w, h}
  const push=(w,h)=>{if(h)secs.push({w,h});};
  // Rehber / SSS / modül — yüksek öncelik (site içi Google)
  push(98, ansRehber(q));
  push(100, ansSiparis(q));
  push(94, ansOnSiparis(q)); push(94, ansSahaEvrak(q)); push(93, ansBakim(q)); push(92, ansToplanti(q));
  push(92, ansTarife(q));
  // Raporlar (yüksek değer)
  push(92, ansDurumSayim(q)); push(92, ansKiyas(q)); push(92, ansEnCok(q)); push(92, ansCiro(q)); push(92, ansTonaj(q));
  push(90, ansHedef(q)); push(90, ansKomisyon(q)); push(90, ansPlasiyerPerf(q));
  push(88, ansKacMusteri(q)); push(88, ansPersonelSayisi(q));
  // İK
  push(86, ansIzin(q)); push(86, ansAvans(q)); push(86, ansTazminat(q));
  // Ürün fiyatı
  push(84, ansUrun(q)); push(84, ansYemUrun(q));
  // Şehir modu (çok bölüm)
  ansSehir(q).forEach(h=>push(70,h));
  // Atanmış müşteriler + varlık detayları
  push(76, ansAtanmisMusteriler(q));
  push(74, ansBayiDanisman(q)); push(72, ansMusteri(q)); push(70, ansPersonel(q));
  // Fallback serbest arama — yalnız hiç özel sonuç yoksa (tekrarı önler)
  if(secs.length===0) push(30, ansGenel(q));
  secs.sort((a,b)=>b.w-a.w);
  // aynı HTML tekrarını ele
  const seen=new Set();const uniq=secs.filter(s=>{if(seen.has(s.h))return false;seen.add(s.h);return true;});
  return uniq.map(s=>s.h);
}

// ---------- yetki + ana arama ----------
let PROFIL=null;
async function portalProfil(au){
  if(PROFIL!==null)return PROFIL;
  try{const s=await getDoc(doc(db,'apps','portal'));const d=s.exists()?s.data().data:null;const p=d&&d.rota_portal_v1?JSON.parse(d.rota_portal_v1):null;const ad=String(au.email||'').split('@')[0].toLowerCase();PROFIL=(p&&Array.isArray(p.users))?(p.users.find(u=>String(u.username||'').toLowerCase()===ad)||false):false;}catch(e){PROFIL=false;}
  return PROFIL;
}
async function search(q){
  q=String(q||'').trim();if(!q)return '';
  const au=await authReady;
  if(!au)return card('Giriş Gerekli','<p class="ka-p">Kurumsal arama yalnızca giriş yapmış kullanıcılara açıktır. Sağ üstten <b>Giriş Yap</b> ile oturum açın.</p>');
  const prof=await portalProfil(au);
  // BEYAZ-LİSTE: arama tüm modülleri (sipariş, yem, İK, saha) tarar; başlık-bazlı filtre yerine
  // yalnız açıkça yetkilendirilmiş kişiler kullanabilir. Portal Yöneticisi VEYA "Arama" izni.
  if(!(prof&&(prof.portalYonetici===true||prof.arama===true)))
    return card('Arama Yetkiniz Yok','<p class="ka-p">Kurumsal arama tüm modüllerdeki verilerde arama yaptığı için yalnızca yetkilendirilmiş kullanıcılara açıktır. Erişim için yöneticinizin <b>Portal → Erişim Yönetimi</b> ekranından hesabınıza <b>Arama</b> iznini vermesi gerekir.</p>');
  if(yasakMi(q))return ansYasak();
  await loadData();
  const cards=analyze(q);
  if(!cards.length)return ansBos();
  const bilgi=`<div class="ka-hd"><span>${cards.length} sonuç bölümü</span><span>“${esc(q)}”</span></div>`;
  return bilgi+cards.join('');
}

// ---------- autocomplete önerileri ----------
function suggest(q){
  q=String(q||'').trim();if(q.length<2||!IDX)return [];
  const qt=tokensOf(q),qn=norm(q),nq=bare(q);if(!qt.length&&qn.length<2)return [];
  const scored=[];
  // Rehber / SSS önerileri
  if(/yardim|rehber|modul|nasil|nerede|ne sor/.test(qn)){
    scored.push({e:{type:'Rehber',src:'',name:'Yardım',nn:'yardim',ek:'ne sorabilirim?',go:'Yardım'},sc:95});
    SITE_MODULLER.slice(0,5).forEach(m=>scored.push({e:{type:'Modül',src:'',name:m.ad,nn:norm(m.ad),ek:'açıklama',go:m.ad},sc:75}));
  }
  IDX.forEach(e=>{
    let sc=0;
    if(e.nn===qn)sc=100;
    else if(e.nn.startsWith(qn))sc=80;
    else if((' '+e.nn).includes(' '+qn))sc=60;                       // kelime başı
    else if(e.type==='Ürün'&&bare(e.name).includes(nq)&&nq.length>=2)sc=55;
    else {const ns=nameScore(e.name,qt);if(ns>0)sc=30+ns*8;}
    if(sc>0)scored.push({e,sc});
  });
  // şehir önerileri
  sehirEslesme(q).forEach(c=>scored.push({e:{type:'İl',src:'',name:c.ad,ek:'ildeki her şey',go:c.ad},sc:70}));
  scored.sort((a,b)=>b.sc-a.sc||a.e.name.length-b.e.name.length);
  return uniqBy(scored,x=>x.e.type+'|'+x.e.nn+'|'+x.e.name).slice(0,8).map(x=>x.e);
}

// ============================================================
//  UI BAĞLAMA — canlı + autocomplete
// ============================================================
const $=id=>document.getElementById(id);
let seq=0, acItems=[], acSel=-1, dataPrimed=false;

function hiName(name,q){
  const qn=norm(q);if(!qn)return esc(name);const nn=norm(name);const i=nn.indexOf(qn.split(' ')[0]||qn);
  if(i<0)return esc(name);const len=(qn.split(' ')[0]||qn).length;
  return esc(name.slice(0,i))+'<b>'+esc(name.slice(i,i+len))+'</b>'+esc(name.slice(i+len));
}
function renderAC(){
  const box=$('ka-ac');if(!box)return;
  if(!acItems.length){box.style.display='none';box.innerHTML='';return;}
  box.style.display='block';
  const q=$('ka-q').value;
  box.innerHTML=acItems.map((e,i)=>`<div class="ka-ac-item${i===acSel?' sel':''}" data-i="${i}">
    <span class="ka-ac-cat${e.src==='yem'?' yem':''}">${esc(e.type)}</span>
    <span class="ka-ac-nm">${hiName(e.name,q)}</span>${e.ek?`<span class="ka-ac-ek">${esc(e.ek)}</span>`:''}</div>`).join('')
    +`<div class="ka-ac-hint">↑↓ gez · Enter ara · Esc kapat</div>`;
  box.querySelectorAll('.ka-ac-item').forEach(el=>el.addEventListener('mousedown',ev=>{ev.preventDefault();pick(+el.dataset.i);}));
}
function pick(i){const e=acItems[i];if(!e)return;$('ka-q').value=e.name;closeAC();runSearch();}
function closeAC(){acItems=[];acSel=-1;renderAC();}

let araYetki=null;
async function aramaYetkili(){
  if(araYetki!==null)return araYetki;
  const au=await authReady;if(!au){araYetki=false;return false;}
  try{const prof=await portalProfil(au);araYetki=!!(prof&&(prof.portalYonetici===true||prof.arama===true));}catch(e){araYetki=false;}
  return araYetki;
}
async function primeData(){
  if(dataPrimed)return;
  if(!(await aramaYetkili()))return;   // yetkisiz kullanıcı → veri yüklenmez, öneri/autocomplete çıkmaz
  try{await loadData();dataPrimed=true;refreshAC();}catch(e){}
}
function refreshAC(){
  const q=$('ka-q').value;
  if(!dataPrimed||q.trim().length<2){closeAC();return;}
  acItems=suggest(q);acSel=-1;renderAC();
}

let liveTimer=null;
async function runSearch(){
  const q=$('ka-q').value;const out=$('ka-out');const my=++seq;
  closeAC();
  if(!q.trim()){out.innerHTML='';out.style.display='none';return;}
  out.style.display='block';
  if(!out.innerHTML)out.innerHTML='<div class="ka-loading"><span class="ka-spin"></span> Aranıyor…</div>';
  try{
    const html=await search(q);
    if(my!==seq)return;                 // eski sonuç — güncel değilse yansıtma
    out.innerHTML=html+`<button class="ka-close" onclick="this.parentElement.style.display='none'">Kapat</button>`;
  }catch(e){if(my===seq)out.innerHTML='<div class="ka-card ka-red"><div class="ka-card-t">Hata</div><p class="ka-p">Arama sırasında bir sorun oluştu. Lütfen tekrar deneyin.</p></div>';}
}
function liveInput(){
  refreshAC();
  clearTimeout(liveTimer);
  const q=$('ka-q').value.trim();
  if(q.length<2){$('ka-out').innerHTML='';$('ka-out').style.display='none';return;}
  liveTimer=setTimeout(runSearch,260);   // yazdıkça (debounce)
}

window.kaAsk=function(s){$('ka-q').value=s;closeAC();runSearch();};
document.addEventListener('DOMContentLoaded',()=>{
  const inp=$('ka-q');if(!inp)return;
  // autocomplete kutusunu arama çubuğunun altına ekle
  if(!$('ka-ac')){const ac=document.createElement('div');ac.id='ka-ac';ac.className='ka-ac';ac.style.display='none';const bar=inp.closest('.ka-bar')||inp.parentElement;bar.appendChild(ac);}
  inp.addEventListener('focus',primeData);
  inp.addEventListener('input',liveInput);
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'&&acItems.length){e.preventDefault();acSel=(acSel+1)%acItems.length;renderAC();return;}
    if(e.key==='ArrowUp'&&acItems.length){e.preventDefault();acSel=(acSel-1+acItems.length)%acItems.length;renderAC();return;}
    if(e.key==='Enter'){e.preventDefault();if(acSel>=0&&acItems[acSel]){pick(acSel);}else{clearTimeout(liveTimer);runSearch();}return;}
    if(e.key==='Escape'){closeAC();}
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.ka-box'))closeAC();});
  $('ka-btn').addEventListener('click',()=>{clearTimeout(liveTimer);runSearch();});
});
