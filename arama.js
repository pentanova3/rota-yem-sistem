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
    avanslar:(ik&&ik.avanslar)||[],tazminatAyar:(ik&&ik.tazminatAyar)||{},
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
  // BAYİ: iskonto fatura anında uygulanır (fiyata gömülü) — sipariş üzerinden ayrıca tutar işlenmez.
  return {tutar:0,rate:(o.komisyonRate!=null&&o.komisyonRate!=='')?+o.komisyonRate:(+kom.rate||0)};
}
// Bayi iskontosu fatura anında uygulanır (birikme/mahsup yok) — yıl içi yararlanılan iskonto raporu.
function bayiAlimOzet(bayiId,yil){
  const os=D().orders.filter(o=>o.aliciBayi&&o.status!=='iptal'&&(ordBayi(o)||{}).id===bayiId&&(o.date||'').slice(0,4)===String(yil));
  let brut=0,fat=0;const ceyrek=[0,0,0,0];
  os.forEach(o=>{
    const pl=orderPL(o);let b=0;
    (o.lines||[]).forEach(l=>{if(!l.code)return;const f=tariffPrice(pl,l.code,'fabrika')||((prodByCode(l.code)||{}).fabrika||0);b+=f*(+l.qty||0);});
    const ft=orderTotal(o);const isk=Math.max(0,b-ft);
    const q=Math.floor((+(o.date||'').slice(5,7)-1)/3);if(q>=0&&q<4)ceyrek[q]+=isk;
    brut+=b;fat+=ft;
  });
  return {adet:os.length,brut,fatura:fat,iskonto:Math.max(0,brut-fat),ceyrek};
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
const YASAK=['muhasebe','kasa','banka','cek','senet','nakit','finans','bilanco','tahsilat','borc','kredi','maas','ucret','bordro','iban','vergi','fatura tutari','kar marji','kasa bakiye'];
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
  return card('Erişim Engellendi',`<p class="ka-p">Muhasebe ve finans verileri (kasa, banka, tahsilat, maaş vb.) kurumsal aramaya <b>kapalıdır</b>. Bu bilgiler yalnızca yetkili kullanıcıların erişebildiği <a href="muhasebe/">Muhasebe &amp; Finans</a> modülünde yer alır.</p>`,'ka-red');
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
  let os=D().orders.filter(o=>o.status!=='iptal'&&o.date&&o.date.slice(0,4)===P.yil&&(P.tip!=='ay'||o.date.slice(5,7)===P.ay));
  let etiket='';
  // müşteri filtresi: "AKHİSARLI İSMAİL bu yıl kaç ton aldı"
  const qt=tokensOf(q);
  const mc=bestMatch(D().customers,c=>c.name,qt,2);
  if(mc){os=os.filter(o=>o.customerId===mc.item.id);etiket=' · '+mc.item.name;}
  // ürün filtresi: "BK-300 Plus'tan kaç ton sattık"
  const nq=norm(q).replace(/[\s-]/g,'');
  const mp=D().products.filter(pp=>pp.active!==false&&nq.includes(norm(pp.code).replace(/[\s-]/g,''))).sort((a,b)=>b.code.length-a.code.length)[0];
  if(mp&&!mc){os=os.map(o=>({...o,lines:(o.lines||[]).filter(l=>norm(l.code)===norm(mp.code))})).filter(o=>o.lines.length);etiket=' · '+mp.code;}
  let ton=0,cuval=0;const byP={},byC={};
  os.forEach(o=>(o.lines||[]).forEach(l=>{if(!l.code)return;const t=tonOf(l.code,l.qty);ton+=t;cuval+=(+l.qty||0);byP[l.code]=(byP[l.code]||0)+t;byC[o.customer||'—']=(byC[o.customer||'—']||0)+t;}));
  if(!os.length)return card('Satış Tonajı — '+esc(P.lbl)+esc(etiket),'<p class="ka-p">Bu dönemde kayıt bulunamadı.</p>');
  const top=Object.entries(mp&&!mc?byC:byP).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return card('Satış Tonajı — '+esc(P.lbl)+esc(etiket),
    row('Toplam',`<span class="ka-big">${fmtTon(ton)} ton</span>`)+row('Çuval',fmtN(cuval)+' adet')+row('Sipariş',os.length+' adet')+
    (top.length?`<div class="ka-sub">${mp&&!mc?'Müşteri kırılımı':'Ürün kırılımı'}</div>`+top.map(([c,t])=>row(c,fmtTon(t)+' t')).join(''):'')+
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
    const yil=new Date().getFullYear();
    const A=bayiAlimOzet(k.id,yil);
    return card('Bayi İskonto Raporu — '+esc(k.name)+' ('+yil+')',
      row('Alım',A.adet+' sipariş · '+fmtTL(A.fatura))+
      row('Yararlanılan İskonto (%'+fmtN(k.rate||0)+')',`<span class="ka-big" style="color:#B45309">${fmtTL(A.iskonto)}</span>`)+
      `<div class="ka-sub">Çeyrek kırılımı</div>`+
      ['Ç1 (Oca–Mar)','Ç2 (Nis–Haz)','Ç3 (Tem–Eyl)','Ç4 (Eki–Ara)'].map((cl,i)=>row(cl,fmtTL(A.ceyrek[i]))).join('')+
      `<div class="ka-note">Bayi iskontosu fatura anında uygulanır; birikme veya mahsup yoktur. Detay: <a href="siparis-takip/#komisyon">İskonto &amp; Komisyon</a></div>`);}
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
    const rows=cityHits.map(k=>`<tr><td><b>${esc(k.name)}</b></td><td>${telLink(k.phone)}</td><td>${mapsLink({adres:k.adres||(k.sz&&k.sz.adres)||'',city:k.city})}</td><td class="n">${k.type==='bayi'?('%'+fmtN(k.rate||0)):'—'}</td></tr>`).join('');
    return card((tip==='bayi'?'Bayiler':'Danışmanlar')+' — '+esc(cityHits[0].city),
      table([{t:'Ad'},{t:'Telefon'},{t:'Adres'},{t:tip==='bayi'?'İskonto':'',n:1}],rows)+`<a class="ka-link" href="saha/">Saha modülünde aç</a>`);
  }
  // ad eşleşmesi
  const mt=bestMatch(list,k=>k.name,qt);
  if(mt){const k=mt.item;const dan=k.danismanId?komById(k.danismanId):null;
    return card((tip==='bayi'?'Bayi':'Teknik Danışman')+' — '+esc(k.name),
      row('Şehir',esc(k.city||'—'))+row('Telefon',telLink(k.phone))+
      row('Adres',mapsLink({adres:k.adres||(k.sz&&k.sz.adres)||'',city:k.city}))+
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
// ============ RAPOR & ANALİZ SORULARI ============
function donemOrders(P){return D().orders.filter(o=>o.status!=='iptal'&&o.date&&o.date.slice(0,4)===P.yil&&(P.tip!=='ay'||o.date.slice(5,7)===P.ay));}
function tonajOzet(os){let ton=0,cuval=0;const byP={};os.forEach(o=>(o.lines||[]).forEach(l=>{if(!l.code)return;const t=tonOf(l.code,l.qty);ton+=t;cuval+=(+l.qty||0);byP[l.code]=(byP[l.code]||0)+t;}));return {ton,cuval,byP,adet:os.length};}
function custOf(o){return D().customers.find(c=>c.id===o.customerId)||null;}
function veriYokKart(P){return card('Veri Yok — '+esc(P.lbl),'<p class="ka-p">Bu dönemde sipariş kaydı bulunmuyor.</p>');}

// "Bekleyen siparişler / kaç sipariş var" — durum sayımı
function ansDurumSayim(q){
  const n=norm(q);
  if(!/siparis/.test(n))return null;
  if(!/bekleyen|onay bekle|kac siparis|siparis sayisi|sevk edilen|teslim edilen|hazir|acik siparis|durum/.test(n))return null;
  const ST={beklemede:'Beklemede',onay:'Onaylandı',hazir:'Hazırlanıyor',sevk:'Sevk Edildi',teslim:'Teslim Edildi',iptal:'İptal'};
  const say={};D().orders.forEach(o=>{say[o.status||'beklemede']=(say[o.status||'beklemede']||0)+1;});
  const rows=Object.keys(ST).filter(k=>say[k]).map(k=>row(ST[k],say[k]+' sipariş')).join('');
  const acik=(say.beklemede||0)+(say.onay||0)+(say.hazir||0);
  return card('Sipariş Durumları',
    row('Toplam',D().orders.length+' sipariş')+rows+
    row('Açık (üretim/sevk sürecinde)',`<span class="ka-big">${acik}</span>`)+
    `<a class="ka-link" href="siparis-takip/#siparisler">Sipariş listesini aç</a>`);
}
// "Bu ay geçen aya göre" — dönem karşılaştırma
function ansKiyas(q){
  const n=norm(q);
  if(!/gore|karsilastir|kiyasla|fark/.test(n))return null;
  if(!/ton|satis|sat|ciro|uret/.test(n))return null;
  const now=new Date();
  const bu={tip:'ay',yil:String(now.getFullYear()),ay:String(now.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[now.getMonth()]+' '+now.getFullYear()};
  const g=new Date(now.getFullYear(),now.getMonth()-1,1);
  const on={tip:'ay',yil:String(g.getFullYear()),ay:String(g.getMonth()+1).padStart(2,'0'),lbl:AYLAR_TR[g.getMonth()]+' '+g.getFullYear()};
  const a=tonajOzet(donemOrders(bu)),b=tonajOzet(donemOrders(on));
  const ciroA=donemOrders(bu).reduce((s,o)=>s+(+o.total||0),0),ciroB=donemOrders(on).reduce((s,o)=>s+(+o.total||0),0);
  const pct=(x,y)=>y?Math.round((x-y)/y*100):null;
  const ok=v=>v==null?'—':(v>=0?'+':'')+v+'%';
  return card('Karşılaştırma — '+esc(bu.lbl)+' / '+esc(on.lbl),
    row('Tonaj',fmtTon(a.ton)+' t / '+fmtTon(b.ton)+' t · <b style="color:'+((a.ton>=b.ton)?'#15803D':'#B91C1C')+'">'+ok(pct(a.ton,b.ton))+'</b>')+
    row('Çuval',fmtN(a.cuval)+' / '+fmtN(b.cuval))+
    row('Sipariş',a.adet+' / '+b.adet)+
    row('Ciro',fmtTL(ciroA)+' / '+fmtTL(ciroB)+' · <b>'+ok(pct(ciroA,ciroB))+'</b>')+
    `<div class="ka-note">İçinde bulunulan ay henüz tamamlanmadığı için fark ay sonuna kadar değişir.</div>`);
}
// "En çok satan ürün / en iyi müşteri / en iyi bayi / hangi ilde" — sıralamalar
function ansEnCok(q){
  const n=norm(q);
  if(!/en cok|en fazla|en iyi|en buyuk|lider|hangi/.test(n))return null;
  if(/bakiyor|bakar|atanmis|bagli|musterileri|musterilerine/.test(n))return null;   // kişiye atanmış müşteri sorusu — sıralama değil
  if(bestMatch(D().koms,k=>k.name,tokensOf(q),2))return null;                        // belirli bir bayi/danışman soruluyor
  let tip=null;
  if(/urun|satan|satilan/.test(n))tip='urun';
  if(/musteri|alici|alan/.test(n))tip='musteri';
  if(/bayi/.test(n))tip='bayi';
  if(/danisman/.test(n))tip='danisman';
  if(/\bil\b|ilde|sehir|bolge|nerede/.test(n))tip='il';
  if(!tip)return null;
  const P=parsePeriod(q);const os=donemOrders(P);
  if(!os.length)return veriYokKart(P);
  const agg={};
  os.forEach(o=>{
    let key=null;
    if(tip==='urun'){(o.lines||[]).forEach(l=>{if(l.code)agg[l.code]=(agg[l.code]||0)+tonOf(l.code,l.qty);});return;}
    if(tip==='musteri')key=o.customer||'—';
    if(tip==='bayi'){const b=ordBayi(o);key=b?b.name:null;}
    if(tip==='danisman'){const d2=ordDanisman(o);key=d2?d2.name:null;}
    if(tip==='il'){const c=custOf(o);key=(c&&c.city)?c.city:null;}
    if(!key)return;
    let t=0;(o.lines||[]).forEach(l=>{if(l.code)t+=tonOf(l.code,l.qty);});
    agg[key]=(agg[key]||0)+t;
  });
  const top=Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!top.length)return card('Sonuç — '+esc(P.lbl),'<p class="ka-p">Bu dönemde '+({urun:'ürün',musteri:'müşteri',bayi:'bayi bağlantılı',danisman:'danışman bağlantılı',il:'il bilgisi olan'})[tip]+' satışı bulunamadı.</p>');
  const toplam=Object.values(agg).reduce((s,v)=>s+v,0);
  const baslik={urun:'En Çok Satan Ürünler',musteri:'En Çok Alan Müşteriler',bayi:'En Yüksek Hacimli Bayiler',danisman:'En Yüksek Hacimli Danışmanlar',il:'En Çok Satış Yapılan İller'}[tip];
  const rows=top.map(([k,v],i)=>`<tr><td><b>${i+1}.</b></td><td><b>${esc(k)}</b></td><td class="n">${fmtTon(v)} t</td><td class="n">${toplam?('%'+Math.round(v/toplam*100)):''}</td></tr>`).join('');
  return card(baslik+' — '+esc(P.lbl),
    table([{t:''},{t:tip==='urun'?'Ürün':'Ad'},{t:'Tonaj',n:1},{t:'Pay',n:1}],rows)+
    `<div class="ka-note">Sıralama ton bazlıdır · iptal siparişler hariç.</div>`);
}
// "Ciro / toplam satış tutarı"
function ansCiro(q){
  const n=norm(q);
  if(!/ciro|satis tutari|toplam satis|kac tl.*sat|kac lira.*sat/.test(n))return null;
  const P=parsePeriod(q);const os=donemOrders(P);
  if(!os.length)return veriYokKart(P);
  const ciro=os.reduce((s,o)=>s+(+o.total||0),0);const oz=tonajOzet(os);
  return card('Satış Cirosu — '+esc(P.lbl),
    row('Toplam Ciro',`<span class="ka-big">${fmtTL(ciro)}</span>`)+
    row('Sipariş',oz.adet+' adet')+row('Tonaj',fmtTon(oz.ton)+' t')+
    row('Ortalama Sipariş',oz.adet?fmtTL(ciro/oz.adet):'—')+
    `<div class="ka-note">Sipariş satış tutarları toplamıdır (iptal hariç). Kasa/tahsilat bilgisi muhasebe modülündedir ve aramaya kapalıdır.</div>`);
}
// "Kaç müşterimiz var" — müşteri envanteri
function ansKacMusteri(q){
  const n=norm(q);
  if(!/kac (tane )?musteri|musteri sayisi|toplam musteri|kac firma/.test(n))return null;
  const cs=D().customers;
  const bayili=cs.filter(c=>c.bayiId).length,danli=cs.filter(c=>!c.bayiId&&c.danismanId).length;
  const iller={};cs.forEach(c=>{if(c.city)iller[c.city]=(iller[c.city]||0)+1;});
  const topIl=Object.entries(iller).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return card('Müşteri Envanteri',
    row('Toplam Müşteri',`<span class="ka-big">${cs.length}</span>`)+
    row('Bayiye bağlı',bayili)+row('Danışmana bağlı',danli)+row('Fabrika (direkt)',cs.length-bayili-danli)+
    (topIl.length?`<div class="ka-sub">En çok müşteri olan iller</div>`+topIl.map(([il,adet])=>row(il,adet+' müşteri')).join(''):'')+
    `<a class="ka-link" href="siparis-takip/#musteriler">Müşteri listesini aç</a>`);
}
// "[bayi/danışman] müşterileri" ve "[il]'deki müşteriler"
function ansAtanmisMusteriler(q){
  const n=norm(q);
  if(!/musteri/.test(n))return null;
  const qt=tokensOf(q);
  const mt=bestMatch(D().koms,k=>k.name,qt);
  if(mt){
    const k=mt.item;
    const list=D().customers.filter(c=>k.type==='bayi'?c.bayiId===k.id:c.danismanId===k.id);
    const rows=list.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.city||'—')}</td><td>${telLink(c.phone)}</td></tr>`).join('');
    return card((k.type==='bayi'?'Bayi':'Danışman')+' Müşterileri — '+esc(k.name)+' ('+list.length+')',
      rows?table([{t:'Müşteri'},{t:'İl'},{t:'Telefon'}],rows):'<p class="ka-p">Bu '+(k.type==='bayi'?'bayiye':'danışmana')+' atanmış müşteri yok.</p>');
  }
  // il eşleşmesi
  const ilHit=qt.find(t=>t.length>=4&&D().customers.some(c=>norm(c.city||'').includes(t)));
  if(ilHit){
    const list=D().customers.filter(c=>norm(c.city||'').includes(ilHit));
    if(list.length){
      const rows=list.slice(0,25).map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${telLink(c.phone)}</td><td>${mapsLink(c)}</td></tr>`).join('');
      return card('Müşteriler — '+esc(list[0].city)+' ('+list.length+')',table([{t:'Müşteri'},{t:'Telefon'},{t:'Adres'}],rows));
    }
  }
  return null;
}
// ============ İK SORULARI (veri girildikçe zenginleşir) ============
function ikYok(baslik){return card(baslik,'<p class="ka-p">İK modülünde henüz bu veriler girilmemiş. Kayıtlar eklendikçe bu soru otomatik cevaplanır. <a class="ka-link" href="hr/">İK modülünü aç</a></p>');}
// Avanslar: tutar / taksit / kalan
function avansAylik(a){return (+a.tutar||0)/Math.max(1,+a.taksit||1);}
function avansAylarL(a){const out=[];if(!a.baslangicAy)return out;let[y,m]=a.baslangicAy.split('-').map(Number);for(let i=0;i<(+a.taksit||1);i++){out.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}return out;}
function avansKalanH(a){const ref=new Date().toISOString().slice(0,7);const kes=avansAylarL(a).filter(ym=>ym<=ref).length*avansAylik(a);return Math.max(0,(+a.tutar||0)-Math.min(+a.tutar||0,kes));}
function ansAvans(q){
  const n=norm(q);if(!/avans/.test(n))return null;
  const av=D().avanslar;if(!av.length)return ikYok('Avanslar');
  const qt=tokensOf(q);
  const mt=bestMatch(D().personeller,p=>p.ad,qt);
  const list=mt?av.filter(a=>a.personelId===mt.item.id):av;
  const pAd=id=>{const p=D().personeller.find(x=>x.id===id);return p?p.ad:'—';};
  const rows=list.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).slice(0,15)
    .map(a=>`<tr><td><b>${esc(pAd(a.personelId))}</b></td><td>${fmtDate(a.tarih)}</td><td class="n">${fmtTL(a.tutar)}</td><td class="n">${a.taksit||1} ay</td><td class="n" style="font-weight:700">${fmtTL(avansKalanH(a))}</td></tr>`).join('');
  const acik=list.reduce((s,a)=>s+avansKalanH(a),0);
  return card('Avanslar'+(mt?' — '+esc(mt.item.ad):''),
    row('Açık Avans Bakiyesi',`<span class="ka-big">${fmtTL(acik)}</span>`)+
    table([{t:'Personel'},{t:'Tarih'},{t:'Tutar',n:1},{t:'Taksit',n:1},{t:'Kalan',n:1}],rows)+
    `<a class="ka-link" href="hr/">İK modülünde aç</a>`);
}
// Kıdem / İhbar tazminatı (4857): süreler + ücret kayıtlıysa tahmini tutar
function aylarFarki(iso){const d=new Date(iso);if(isNaN(d))return 0;const n2=new Date();let m=(n2.getFullYear()-d.getFullYear())*12+(n2.getMonth()-d.getMonth());if(n2.getDate()<d.getDate())m--;return Math.max(0,m);}
function ihbarHaftasi(iseGiris){const ay=aylarFarki(iseGiris);return ay<6?2:(ay<18?4:(ay<36?6:8));}
function ansTazminat(q){
  const n=norm(q);if(!/kidem|ihbar|tazminat/.test(n))return null;
  const ps=D().personeller.filter(p=>(p.durum||'aktif')!=='ayrildi');
  if(!ps.length)return ikYok('Kıdem / İhbar Tazminatı');
  const tavan=+(D().tazminatAyar.kidemTavan)||0;
  const hesap=p=>{
    const ay=aylarFarki(p.iseGiris),yil=Math.floor(ay/12),kalanAy=ay%12;
    const hafta=ihbarHaftasi(p.iseGiris);
    const brut=+String(p.ucret||'').replace(/[^\d.,]/g,'').replace(',','.')||0;
    const esas=tavan?Math.min(brut,tavan):brut;
    const kidemT=brut?esas*(ay/12):0;
    const ihbarT=brut?(brut/30)*(hafta*7):0;
    return {ay,yil,kalanAy,hafta,brut,kidemT,ihbarT};
  };
  const qt=tokensOf(q);
  const mt=bestMatch(ps,p=>p.ad,qt);
  if(mt){const p=mt.item,r=hesap(p);
    return card('Kıdem & İhbar — '+esc(p.ad),
      row('İşe Giriş',fmtDate(p.iseGiris))+
      row('Kıdem',(r.yil?r.yil+' yıl ':'')+(r.kalanAy?r.kalanAy+' ay':(r.yil?'':'1 yıldan az')))+
      row('Yasal İhbar Süresi',r.hafta+' hafta ('+(r.hafta*7)+' gün)')+
      (r.brut?row('Tahmini Kıdem Tazminatı (brüt)',fmtTL(r.kidemT))+row('Tahmini İhbar Tazminatı (brüt)',fmtTL(r.ihbarT)):'')+
      `<div class="ka-note">${r.brut?'Kıdem tavanı uygulanmıştır ('+fmtTL(tavan)+'). Tutarlar brüt tahmindir; kesin hesap İK modülünde yapılır.':'Ücret kaydı girilmediği için tutar hesaplanamadı — süreler gösterildi.'} 4857 sayılı İş Kanunu m.17 & 1475 m.14.</div>`+
      `<a class="ka-link" href="hr/">İK modülünde aç</a>`);}
  const rows=ps.map(p=>{const r=hesap(p);return `<tr><td><b>${esc(p.ad)}</b></td><td>${fmtDate(p.iseGiris)}</td><td>${r.yil} yıl ${r.kalanAy} ay</td><td class="n">${r.hafta} hafta</td><td class="n">${r.brut?fmtTL(r.kidemT):'—'}</td></tr>`;}).join('');
  return card('Kıdem & İhbar Özeti',
    table([{t:'Personel'},{t:'İşe Giriş'},{t:'Kıdem'},{t:'İhbar',n:1},{t:'Tahmini Kıdem Tazm.',n:1}],rows)+
    `<div class="ka-note">Tutarlar brüt tahmindir (tavan uygulanır); ücret girilmeyenlerde gösterilmez.</div>`);
}
// "Kaç personelimiz var"
function ansPersonelSayisi(q){
  const n=norm(q);
  if(!/kac (tane )?personel|personel sayisi|kac calisan|calisan sayisi/.test(n))return null;
  const ps=D().personeller;if(!ps.length)return ikYok('Personel');
  const aktif=ps.filter(p=>(p.durum||'aktif')!=='ayrildi');
  const dep={};aktif.forEach(p=>{const d2=p.departman||'Belirsiz';dep[d2]=(dep[d2]||0)+1;});
  return card('Personel',
    row('Aktif Personel',`<span class="ka-big">${aktif.length}</span>`)+
    (ps.length>aktif.length?row('Ayrılan',ps.length-aktif.length):'')+
    Object.entries(dep).sort((a,b)=>b[1]-a[1]).map(([d2,adet])=>row(d2,adet)).join('')+
    `<a class="ka-link" href="hr/">İK modülünde aç</a>`);
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
  mKom.forEach(k=>rows+=li(k.type==='bayi'?'Bayi':'Danışman',k.name,[telLink(k.phone),mapsLink({adres:k.adres||(k.sz&&k.sz.adres)||'',city:k.city})].filter(x=>x!=='—').join(' · ')||esc(k.city||''),'saha/'));
  mPer.forEach(p=>rows+=li('Personel',p.ad,esc(p.gorev||''),'hr/'));
  mProd.forEach(p=>rows+=li('Ürün',p.code,esc(p.pkg||''),'siparis-takip/#urunler'));
  if(!rows)return null;
  return card('Arama Sonuçları',table([{t:''},{t:'Ad'},{t:'Bilgi'},{t:''}],rows));
}
function ansBos(){
  return card('Sonuç Bulunamadı',`<p class="ka-p">Bu soruya karşılık gelen bir veri bulunamadı. Şunları deneyebilirsiniz:</p>
  <ul class="ka-ul"><li>"En çok satan ürün hangisi?"</li><li>"Bu ay geçen aya göre satış nasıl?"</li><li>"En iyi 5 müşterimiz kim?"</li><li>"[bayi adı] hangi müşterilere bakıyor?"</li><li>"Balıkesir'deki müşteriler"</li><li>"[müşteri adı] bu yıl kaç ton aldı?"</li><li>"Bekleyen siparişler"</li><li>"Bu yıl ciro ne kadar?"</li><li>"[danışman adı] komisyon bakiyesi"</li><li>"Kimin kaç gün izni kaldı?"</li><li>"[personel] kıdem tazminatı"</li><li>"Avans bakiyeleri"</li></ul>`);
}

// ---------- ana akış ----------
async function search(q){
  q=String(q||'').trim();
  if(!q)return '';
  if(yasakMi(q))return ansYasak();
  await loadData();
  // niyet zinciri: özelden genele
  return ansSiparis(q)||ansDurumSayim(q)||ansKiyas(q)||ansEnCok(q)||ansCiro(q)||ansTonaj(q)||ansIzin(q)||ansAvans(q)||ansTazminat(q)||ansPersonelSayisi(q)||ansHedef(q)||ansKomisyon(q)||ansUrun(q)||ansKacMusteri(q)||ansAtanmisMusteriler(q)||ansBayiDanisman(q)||ansMusteri(q)||ansPersonel(q)||ansGenel(q)||ansBos();
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
