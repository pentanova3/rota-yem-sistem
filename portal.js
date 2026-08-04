// ============================================================
// ROTA SMI · Portal Giriş + Erişim Yönetimi (çark paneli)
// Tek giriş: kullanıcı portalda oturum açar; modül kartları
// yetkiye göre açılır/kilitlenir. Yönetici çarktan kullanıcı
// ve modül yetkilerini düzenler (apps/portal · rota_portal_v1).
// ============================================================
import { initializeApp } from "/vendor/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from "/vendor/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential } from "/vendor/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig={apiKey:"AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8",authDomain:"rota-yem.firebaseapp.com",projectId:"rota-yem",storageBucket:"rota-yem.firebasestorage.app",messagingSenderId:"186408871052",appId:"1:186408871052:web:65791c132b2c1b525307a9"};
const app=initializeApp(firebaseConfig), db=getFirestore(app), auth=getAuth(app);
const EPOSTA_SON='@rota-yem.firebaseapp.com';
const sifreDolgu=p=>(p&&p.length>=6)?p:String(p)+'.rota';   // Firebase 6 karakter ister; kullanıcı kısa şifresini aynen yazar
const YONETIM_URL='https://yonetim-gdzmodep5q-uc.a.run.app';
const SIFRE_URL='https://sifredegistir-gdzmodep5q-uc.a.run.app';
const YEDEK_URL='https://us-central1-rota-yem.cloudfunctions.net/yedekYonet';
const SES='rota_portal_session';
const DOKSAN_GUN=90*24*3600*1000;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Denetim izi (Faz 2.2) — kayıt metnini insan-okur Türkçeye çevirir (çıktı row'da esc'lenir)
function denetimTarih(iso){const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso||''));return m?(m[3]+'.'+m[2]+'.'+m[1]+' '+m[4]+':'+m[5]):'—';}
function denetimMetin(d){
  const x=(d&&d.detay)||{}, k=x.kullanici||'', rolAd=x.rol==='danisman'?'danışman':'bayi';
  switch(d&&d.islem){
    case 'yetki-degisti': return k+' kullanıcısının yetkisi değiştirildi'+(Array.isArray(x.degisen)&&x.degisen.length?' ('+x.degisen.join(', ')+')':'');
    case 'hesap-acildi': return k+' adında yeni kullanıcı hesabı açıldı';
    case 'giris-acildi': return k+' kullanıcısının girişi yeniden açıldı';
    case 'giris-kapatildi': return k+' kullanıcısının girişi kapatıldı';
    case 'sifre-admin-degisti': return k+' kullanıcısının şifresi (yönetici) sıfırlandı';
    case 'sifre-kullanici-degisti': return 'kendi şifresini değiştirdi';
    case 'portal-hesap-acildi': return rolAd+' portal hesabı açıldı: '+k;
    case 'portal-sifre-sifirlandi': return k+' ('+rolAd+') portal geçici şifresi verildi';
    case 'portal-hesap-kapatildi': return k+' ('+rolAd+') portal hesabı kapatıldı';
    case 'toptan-silme-engellendi': return 'TOPTAN SİLME DENEMESİ ENGELLENDİ — modül: '+(x.app||'?')+(x.eski!=null?' ('+x.eski+'→'+x.yeni+' kayıt)':'');
    default: return (d&&d.islem)||'';
  }
}

// Modül tanımları: kart href → yetki anahtarı + seviye seçenekleri
const MODS=[
 {key:'siparis', href:'siparis/', ad:'Sipariş Takip (TMR)', seviyeler:[['yok','Girmez'],['plasiyer','Plasiyer (Saha)'],['siparis','Sipariş Personeli'],['admin','Yönetici']]},
 {key:'yem', href:'yem/', ad:'Yem Sipariş', seviyeler:[['yok','Girmez'],['plasiyer','Plasiyer (Saha)'],['siparis','Sipariş Personeli'],['admin','Yönetici']]},
 {key:'muhasebe',href:'muhasebe/',ad:'Muhasebe & Finans', seviyeler:[['yok','Girmez'],['yonetici','Yönetici']]},
 {key:'ik', href:'ik/', ad:'İnsan Kaynakları', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'bakim', href:'bakim/', ad:'Makine Envanter', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'saha', href:'saha/', ad:'Bayi & Danışman', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'toplanti',href:'haftalik-toplanti/',ad:'Haftalık Toplantı', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
];

// Modül İÇİ bölümler — kapatılanlar kullanıcı.bolum{'mod.bolum':false} olarak saklanır (varsayılan: hepsi açık)
// Üçüncü eleman (varsa) o bölümün ALT sekmeleridir: anahtar 'mod.bolum.alt'
const BOLUMLER=[
 {mod:'siparis',ad:'Sipariş Takip (TMR)',list:[['panel','Panel'],['siparisler','Siparişler'],
   ['musteriler','Müşteriler',[['liste','Müşteri Listesi'],['rapor','Müşteri Raporu'],['arsiv','Müşteri Arşivi']]],
   ['bayimusteri','Bayi Müşterileri'],
   ['komisyoncular','Bayi & Danışman'],['plasiyerler','Plasiyerler'],['komisyon','İskonto & Komisyon'],['urunler','Ürünler & Fiyat'],['stok','Stok'],
   ['raporlar','Raporlar',[['tonaj','Tonaj & Hedef'],['genel','Genel Rapor'],['yonetici','Yönetici Raporu']]],
   ['ayarlar','Ayarlar']]},
 {mod:'yem',ad:'Yem Sipariş',list:[['panel','Panel'],['siparisler','Siparişler'],['musteriler','Müşteriler'],['plasiyerler','Plasiyerler'],['urunler','Ürünler & Fiyat'],['araci','Aracı Hesabı'],['raporlar','Raporlar'],['ayarlar','Ayarlar']]},
 {mod:'muhasebe',ad:'Muhasebe & Finans',list:[['hafta','Haftalık Akış'],['kasa','Kasa Defteri'],['alacak','Alacaklar'],['borc','Borçlar'],['pos','POS'],['dbs','DBS'],['ayar','Ayarlar']]},
 {mod:'ik',ad:'İnsan Kaynakları',list:[['hr','İK Uygulaması (kart)'],['isg','İSG (kart)'],['kvkk','KVKK (kart)'],['personel','Personeller'],['sablon','Sözleşme & Şablonlar'],['ilan','Personel İlanı'],['basvuru','Başvuru Evrakları'],['kabul','İşe Kabul'],['cikis','Çıkış Evrakları'],['izin','İzin Takibi'],['avans','Avans Yönetimi'],['tazminat','Kıdem & İhbar'],['puantaj','Puantaj'],['talimat','Talimatlar'],['diger','Diğer Evraklar']]},
 {mod:'saha',ad:'Saha (Bayi & Danışman)',list:[['harita','Bayi Haritası'],['musteri','Müşteri Haritası'],['firsat','Bayi Fırsatı'],['liste','Bayi & Danışman Listesi'],['sozlesme','Sözleşmeler']]},
 {mod:'bakim',ad:'Makine Envanter',list:[['bakim','Bakım / Arıza Takip'],['sozlesme','Bakım Sözleşmeleri'],['kitap','Bakım Kitapları'],['pbs','Planlı Bakım Sistemi (PBS)']]},
];
let PDATA=null, PUSER=null;

async function loadPortal(force){
  if(PDATA&&!force)return PDATA;
  try{const s=await getDoc(doc(db,'apps','portal'));const d=s.exists()?s.data().data:null;
    PDATA=d&&d.rota_portal_v1?JSON.parse(d.rota_portal_v1):null;}catch(e){PDATA=null;}
  return PDATA;
}
async function savePortal(){
  await setDoc(doc(db,'apps','portal'),{data:{rota_portal_v1:JSON.stringify(PDATA)},updatedAt:new Date().toISOString()},{merge:true});
}
function session(){try{const s=JSON.parse(localStorage.getItem(SES)||'null');if(s&&s.u&&(!s.ts||(Date.now()-s.ts)<30*24*3600*1000))return s;}catch(e){}return null;}

// ---------- şifre yaşam döngüsü (Bloker #3: geçici→zorunlu kurulum · 90 gün rotasyon · self-servis) ----------
function sifreGecerliMi(p){return typeof p==='string'&&p.length>=8&&/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p)&&/[0-9]/.test(p);}
function sifreDurumu(u){
  // zorunlu = admin geçici verdi VEYA hiç metadata yok (mevcut kullanıcılar) VEYA 90 gün doldu
  if(!u)return {zorunlu:false,gunKalan:null,sebep:'yok'};
  if(u.sifreZorunlu===true||!u.sifreDegisim)return {zorunlu:true,gunKalan:0,sebep:'yeni'};
  const gecen=Date.now()-Date.parse(u.sifreDegisim);
  if(isNaN(gecen))return {zorunlu:true,gunKalan:0,sebep:'yeni'};
  const kalan=Math.ceil((DOKSAN_GUN-gecen)/(24*3600*1000));
  return {zorunlu:gecen>DOKSAN_GUN,gunKalan:kalan,sebep:gecen>DOKSAN_GUN?'suredoldu':'aktif'};
}
async function sifreSunucudaDegistir(mevcut,yeni){
  // reauth (kimlik + son 5 dk tazeliği) → sunucu ucundan Firebase şifresi + tarih güncellenir. Şifre saklanmaz/loglanmaz.
  const u=auth.currentUser;if(!u||!u.email){const e=new Error('oturum yok');e.code='no-session';throw e;}
  await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,sifreDolgu(mevcut)));
  const t=await u.getIdToken(true);
  const r=await fetch(SIFRE_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({yeni})});
  let j={};try{j=await r.json();}catch(e){}
  if(!r.ok||!j.ok){const e=new Error(j.hata||('sunucu '+r.status));e.srv=j.hata;throw e;}
  return true;
}
function sifreDegistirModal(opt){
  opt=opt||{};const zorunlu=!!opt.zorunlu, mevcutHazir=!!opt.mevcut, next=opt.next||'';
  closeModals();
  document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg" id="pa-modal">
    <div class="pa-box">
      <div class="pa-t">${zorunlu?'Şifrenizi Yenileyin':'Şifre Değiştir'}</div>
      <div class="pa-s">${zorunlu?'Güvenliğiniz için kendi şifrenizi belirlemelisiniz. Bu şifreyi <b>yalnız siz</b> bileceksiniz — yönetici dahil kimse göremez.':'Yeni şifreniz en az 8 karakter olmalı, harf ve rakam içermelidir.'}</div>
      ${mevcutHazir?'':'<label class="pa-l">Mevcut Şifre</label><input id="sd-cur" type="password" autocomplete="current-password">'}
      <label class="pa-l">Yeni Şifre</label><input id="sd-new" type="password" autocomplete="new-password">
      <label class="pa-l">Yeni Şifre (Tekrar)</label><input id="sd-new2" type="password" autocomplete="new-password">
      <div class="pa-err" id="sd-err"></div>
      <button class="pa-btn pa-go" id="sd-do">${zorunlu?'Kaydet ve Devam Et':'Kaydet'}</button>
      ${zorunlu?`<button class="pa-btn pa-out" id="sd-cikis" style="margin-top:8px;width:100%">Vazgeç ve Çıkış Yap</button>${(PUSER&&PUSER.portalYonetici)?'<button class="pa-btn pa-out" id="sd-admin" style="margin-top:6px;width:100%;font-size:11px;opacity:.7">Yönetici: bu oturumda şimdilik atla</button>':''}`:'<button class="pa-x" id="sd-x">✕</button>'}
    </div></div>`);
  const err=document.getElementById('sd-err');
  const xb=document.getElementById('sd-x');if(xb)xb.onclick=closeModals;
  const cb=document.getElementById('sd-cikis');if(cb)cb.onclick=async()=>{try{await signOut(auth);}catch(e){}localStorage.removeItem(SES);location.reload();};
  // Acil kaçış (break-glass): endpoint çökse bile yönetici tam kilitlenmesin — bu oturumda modalı geçici kapat.
  const ab=document.getElementById('sd-admin');if(ab)ab.onclick=()=>{closeModals();applyAuthUI();};
  document.getElementById('sd-do').onclick=async()=>{
    const mevcut=opt.mevcut||(document.getElementById('sd-cur')?document.getElementById('sd-cur').value:'');
    const y1=document.getElementById('sd-new').value, y2=document.getElementById('sd-new2').value;
    if(!mevcut){err.textContent='Mevcut şifrenizi girin.';return;}
    if(!sifreGecerliMi(y1)){err.textContent='Yeni şifre en az 8 karakter olmalı, harf ve rakam içermeli.';return;}
    if(y1!==y2){err.textContent='Yeni şifreler eşleşmiyor.';return;}
    err.textContent='Kaydediliyor…';
    try{
      await sifreSunucudaDegistir(mevcut,y1);
      if(PUSER){PUSER.sifreZorunlu=false;PUSER.sifreDegisim=new Date().toISOString();}
      closeModals();
      if(zorunlu){
        if(next){const mod=MODS.find(m=>next.indexOf(m.href)>=0);location.href=(!mod||permOf(PUSER,mod.key)!=='yok')?next:'/';}
        else location.reload();
      }else{alert('Şifreniz güncellendi.');applyAuthUI();}
    }catch(e){
      const c=(e&&(e.code||e.srv))||'';
      err.textContent=(c==='auth/wrong-password'||c==='auth/invalid-credential')?'Mevcut şifre hatalı.'
        :(c==='zayif-parola')?'Yeni şifre politikayı karşılamıyor (8+ karakter, harf ve rakam).'
        :(c==='oturum-eski')?'Oturum tazeliği doldu — çıkıp tekrar girin.'
        :(c==='no-session')?'Oturum bulunamadı — tekrar giriş yapın.'
        :('Değiştirilemedi: '+(e.srv||e.message||c));
    }
  };
  const f=document.getElementById(mevcutHazir?'sd-new':'sd-cur');if(f)f.focus();
}
window.sifreDegistirAc=()=>sifreDegistirModal({zorunlu:false});
function sifreDurumEtiketi(u){
  if(!u||!u.username)return '<span style="font-size:10px;color:#94a3b8">— yeni —</span>';
  if(u.sifreZorunlu===true||!u.sifreDegisim)return '<span style="color:#b45309;font-weight:600;font-size:11px">Geçici</span><div style="font-size:9.5px;color:#94a3b8">kullanıcı kuracak</div>';
  const d=sifreDurumu(u), tarih=new Date(u.sifreDegisim).toLocaleDateString('tr-TR');
  if(d.sebep==='suredoldu')return '<span style="color:#dc2626;font-weight:600;font-size:11px">Süresi doldu</span><div style="font-size:9.5px;color:#94a3b8">'+esc(tarih)+'</div>';
  const renk=d.gunKalan<=7?'#b45309':'#16a34a';
  return '<span style="font-size:11px;color:#334155">'+esc(tarih)+'</span><div style="font-size:9.5px;color:'+renk+'">'+d.gunKalan+' gün kaldı</div>';
}

// ---------- kart kilitleme + üst bar ----------
function permOf(u,key){return (u&&u.perms&&u.perms[key])||'yok';}
function applyAuthUI(){
  const bar=document.getElementById('pa-bar');if(!bar)return;
  if(PUSER){
    bar.innerHTML=`<span class="pa-user">${esc(PUSER.name||PUSER.username)}</span>
      ${PUSER.portalYonetici?`<button class="pa-ic" id="pa-gear" title="Erişim Yönetimi"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>`:''}
      <button class="pa-btn pa-sm pa-out" id="pa-sifre">Şifre</button>
      <button class="pa-btn pa-out" id="pa-logout">Çıkış</button>`;
    const g=document.getElementById('pa-gear');if(g)g.onclick=openPanel;
    const sb=document.getElementById('pa-sifre');
    if(sb){const dm=sifreDurumu(PUSER);
      sb.title=(dm.sebep==='aktif'&&dm.gunKalan<=7)?('Şifrenizin süresi '+dm.gunKalan+' gün sonra dolacak — yenileyin'):'Şifreni değiştir';
      if(dm.sebep==='aktif'&&dm.gunKalan<=7){sb.style.borderColor='#f59e0b';sb.style.color='#b45309';sb.textContent='Şifre ⚠';}
      sb.onclick=()=>sifreDegistirModal({zorunlu:false});}
    document.getElementById('pa-logout').onclick=async()=>{try{await signOut(auth);}catch(e){}localStorage.removeItem(SES);location.reload();};
  }else{
    bar.innerHTML=`<button class="pa-btn" id="pa-login">Giriş Yap</button>`;
    document.getElementById('pa-login').onclick=()=>openLogin('');
  }
  // Kart görünürlüğü: kullanıcı yalnızca YETKİLİ olduğu kartları görür (site mimarisi sızmaz).
  // Portal yöneticisi tümünü görür (yetkisizler kilit rozetiyle). Oturum yoksa kartlar gizlenir.
  const isAdminP=!!(PUSER&&PUSER.portalYonetici);
  let gorunen=0;
  document.querySelectorAll('.app').forEach(a=>{
    const href=a.getAttribute('href')||'';
    const mod=MODS.find(m=>m.href===href);
    a.classList.remove('pa-locked');a.style.display='';a.onclick=null;
    if(!PUSER){a.style.display='none';return;}
    if(a.classList.contains('soon')){if(!isAdminP)a.style.display='none';else gorunen++;return;}
    if(!mod){gorunen++;return;}
    // "Sipariş Takip" kartı TMR + Yem hub'ıdır: yalnız Yem yetkisi olan da bu kartı görüp hub'a girebilmeli
    const yetki=(mod.key==='siparis'&&permOf(PUSER,'yem')!=='yok')?'var':permOf(PUSER,mod.key);
    if(yetki==='yok'){
      if(isAdminP){gorunen++;a.classList.add('pa-locked');a.onclick=e=>{e.preventDefault();alert('Bu modüle erişim yetkiniz yok.');};}
      else a.style.display='none';
    } else gorunen++;
  });
  // Oturum yok / hiç yetki yok → bilgi kartı
  const appsEl=document.getElementById('apps');
  let ph=document.getElementById('pa-apps-ph');if(ph)ph.remove();
  if(appsEl&&(!PUSER||gorunen===0)){
    ph=document.createElement('div');ph.id='pa-apps-ph';
    ph.style.cssText='grid-column:1/-1;background:#f6f9fc;border:1px dashed #c9d6e5;border-radius:16px;padding:34px 20px;text-align:center';
    ph.innerHTML=PUSER
      ?'<div style="font:700 14px var(--font);color:#0c2340;margin-bottom:6px">Yetkili olduğunuz uygulama bulunmuyor</div><div style="font-size:12.5px;color:#5b6b80">Erişim için yöneticinizle görüşün.</div>'
      :'<div style="font:700 14px var(--font);color:#0c2340;margin-bottom:6px">Uygulamalar giriş yaptıktan sonra görüntülenir</div><div style="font-size:12.5px;color:#5b6b80;margin-bottom:14px">Yetkili olduğunuz modüller otomatik listelenir.</div><button class="pa-btn" onclick="document.getElementById(\'pa-login\')?document.getElementById(\'pa-login\').click():null">Giriş Yap</button>';
    appsEl.appendChild(ph);
  }
  if(appsEl)appsEl.classList.remove('pa-gizli');   // yetki uygulandı → kartları GÖSTER (yetkisiz kart parlaması engellendi)
}

// ---------- giriş ----------
function openLogin(nextHref){
  closeModals();
  document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg" id="pa-modal">
    <div class="pa-box">
      <div class="pa-t">Portal Girişi</div>
      <div class="pa-s">Tek girişle yetkili olduğunuz tüm modüller açılır.</div>
      <label class="pa-l">Kullanıcı Adı</label><input id="pa-u" autocomplete="username">
      <label class="pa-l">Şifre</label><input id="pa-p" type="password" autocomplete="current-password">
      <div class="pa-err" id="pa-err"></div>
      <button class="pa-btn pa-go" id="pa-do">Giriş Yap</button>
      <button class="pa-x" id="pa-close">✕</button>
    </div></div>`);
  document.getElementById('pa-close').onclick=closeModals;
  document.getElementById('pa-p').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin(nextHref);});
  document.getElementById('pa-do').onclick=()=>doLogin(nextHref);
  document.getElementById('pa-u').focus();
}
async function doLogin(nextHref){
  const u=document.getElementById('pa-u').value.trim(), p=document.getElementById('pa-p').value;
  const err=document.getElementById('pa-err');
  if(!u||!p){err.textContent='Kullanıcı adı ve şifre giriniz.';return;}
  err.textContent='Doğrulanıyor…';
  try{await signInWithEmailAndPassword(auth,u.toLowerCase()+EPOSTA_SON,sifreDolgu(p));}
  catch(e){err.textContent=(e&&e.code==='auth/too-many-requests')?'Çok fazla deneme — bir süre bekleyin.':'Kullanıcı adı veya şifre hatalı.';return;}
  const d=await loadPortal(true);
  const usr=d&&d.users&&d.users.find(x=>x.username.toLowerCase()===u.toLowerCase());
  if(!usr){err.textContent='Kullanıcı profili bulunamadı.';return;}
  localStorage.setItem(SES,JSON.stringify({u:usr.username,ts:Date.now()}));
  PUSER=usr;
  // Bloker #3: geçici/dolmuş şifre → önce kendi güçlü şifresini kursun (girişte yeni şifreyi kur)
  if(sifreDurumu(usr).zorunlu){closeModals();sifreDegistirModal({zorunlu:true,mevcut:p,next:nextHref||''});return;}
  closeModals();applyAuthUI();
  if(nextHref){
    const mod=MODS.find(m=>m.href===nextHref||('/'+m.href).indexOf(nextHref)>=0||nextHref.indexOf(m.href)>=0);
    if(!mod||permOf(usr,mod.key)!=='yok')location.href=nextHref;
    else alert('Giriş yapıldı ancak bu modüle erişim yetkiniz yok.');
  }
}
function closeModals(){document.querySelectorAll('.pa-bg').forEach(x=>x.remove());}

// ---------- erişim yönetim paneli (çark) ----------
function openPanel(){
  // KAYDIRMA KORUMASI: panel her işaretlemede (15 çağrı noktası) baştan çiziliyor; konum
  // korunmazsa kullanıcı her tıkta en üste fırlıyordu. Sil-ve-yeniden-kur mimarisi korunuyor,
  // yalnız scrollTop taşınıyor.
  const _kaydirma=(function(){const b=document.querySelector('#pa-modal .pa-box');return b?b.scrollTop:0;})();
  closeModals();
  const M=PDATA.muhasebeOnay||(PDATA.muhasebeOnay={alicilar:[],gerekli:1});
  const YM=PDATA.yemOnay||(PDATA.yemOnay={alicilar:[]});   // yem üretim onaycıları [{username,chatId,ad}]
  const MSO=PDATA.muhasebeSiparisOnay||(PDATA.muhasebeSiparisOnay={alicilar:[]});
  // TMR ÜRETİM onaycıları — PANELDEN onay için (Telegram'daki confirm: akışında liste yoktu).
  // Telegram adayı ZORUNLU DEĞİL: bu onay panelden veriliyor, Telegram'ı olmayan da onaycı olabilir.
  const FBO=PDATA.fabrikaOnay||(PDATA.fabrikaOnay={alicilar:[]});   // [{username,ad,chatId?}]   // muhasebe SİPARİŞ onaycıları [{username,chatId,ad}] — sipariş akışının 1. kapısı
  const userRows=PDATA.users.map((u,i)=>`<tr>
    <td><input value="${esc(u.name||'')}" onchange="PA.set(${i},'name',this.value)" style="width:130px"></td>
    <td><input value="${esc(u.username)}" onchange="PA.set(${i},'username',this.value)" style="width:90px"></td>
    <td><input type="password" placeholder="geçici ver…" value="${esc(u._yeniSifre||'')}" onchange="PA.sifre(${i},this.value)" style="width:150px" title="GEÇİCİ şifre verir — kullanıcı ilk girişte kendi şifresini kurar (sen göremezsin). En az 8 karakter, harf ve rakam. Boş bırak = değişmez."></td>
    <td style="text-align:center;white-space:nowrap">${sifreDurumEtiketi(u)}</td>
    ${MODS.map(m=>{
      const cur=permOf(u,m.key);
      // Kaldırılmış eski bir seviye kayıtlıysa (ör. sevkiyat) sessizce sıfırlanmasın diye listeye eklenir
      const bilinen=m.seviyeler.some(([v])=>v===cur);
      const opts=m.seviyeler.map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')
        +(bilinen?'':`<option value="${esc(cur)}" selected>${esc(cur)} (eski)</option>`);
      return `<td><select onchange="PA.perm(${i},'${m.key}',this.value)">${opts}</select></td>`;
    }).join('')}
    <td style="text-align:center"><input type="checkbox" ${u.fiyatGor?'checked':''} onchange="PA.set(${i},'fiyatGor',this.checked)" title="Sipariş modülünde fiyatları görebilir"></td>
    <td style="text-align:center"><input type="checkbox" ${u.siparisSil?'checked':''} onchange="PA.set(${i},'siparisSil',this.checked)" title="Sipariş Takip (TMR) ve Yem'de sipariş SİLEBİLİR — yönetici olmasa da. Silme geri alınamaz; işlem kaydı tutulur."></td>
    <td style="text-align:center"><input type="checkbox" ${u.portalYonetici?'checked':''} onchange="PA.set(${i},'portalYonetici',this.checked)" title="Bu paneli açabilir, kullanıcı yönetir"></td>
    <td style="text-align:center"><input type="checkbox" ${u.arama?'checked':''} onchange="PA.set(${i},'arama',this.checked)" title="Kurumsal arama motorunu kullanabilir — TÜM modüllerde (sipariş, yem, İK, saha) arama yapar. Yalnız güvenilir kişilere açın."></td>
    <td style="white-space:nowrap"><button class="pa-btn pa-sm pa-out" onclick="PA.bolumAc(${i})">${(PDATA._acik&&PDATA._acik[i])?'Bölümler ▴':'Bölümler ▾'}</button> <button class="pa-del" onclick="PA.del(${i})">Sil</button></td>
  </tr>${(PDATA._acik&&PDATA._acik[i])?`<tr class="pa-brow"><td colspan="16">${bolumGridHTML(u,i)}</td></tr>`:''}`).join('');
  const adayOpts=(PDATA.adaylar||[]).map(a=>`<option value="${esc(a.chatId)}">${esc(a.ad||a.chatId)} (${esc(a.chatId)})</option>`).join('');
  document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg" id="pa-modal">
    <div class="pa-box pa-wide">
      <div class="pa-t">Erişim Yönetimi</div>
      <div class="pa-s">Kim hangi modüle girebilir, neleri yapabilir — buradan yönetilir. Değişiklikler Kaydet ile yayınlanır.</div>
      <div style="margin:2px 0 12px;display:flex;gap:8px;flex-wrap:wrap"><button class="pa-btn pa-sm pa-out" onclick="PA.denetim()">Denetim İzi — kim, ne zaman, ne yaptı</button><button class="pa-btn pa-sm pa-out" onclick="PA.hesapDurum()">Hesap Durumu — son giriş & atıl hesaplar</button><button class="pa-btn pa-sm pa-out" onclick="PA.yedek()">Yedek & Geri Yükleme Provası</button></div>
      <div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;border:1px solid ${PDATA.disKilit===true?'#eecfcc':'#cfe6d8'};background:${PDATA.disKilit===true?'#fbeeed':'#f2f8f4'};display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:13px;color:${PDATA.disKilit===true?'#b3261e':'#2f7d52'}">Acil Durum Şalteri — Dış erişim şu an ${PDATA.disKilit===true?'KAPALI':'AÇIK'}</div>
          <div style="font-size:11.5px;color:#5b6b80;margin-top:2px">${PDATA.disKilit===true?'Bayi, danışman ve müşteri erişimi kapalı. İç personel etkilenmez. Sorun çözülünce yeniden açın.':'Bir saldırı fark ederseniz TÜM bayi/danışman/müşteri erişimini tek tuşla kesebilirsiniz. İç personel etkilenmez, veri silinmez.'}</div>
        </div>
        ${PDATA.disKilit===true
          ? `<button class="pa-btn pa-sm" style="background:#2f7d52;color:#fff;border-color:#2f7d52;white-space:nowrap" onclick="PA.disKilit(false)">Dış Erişimi Yeniden Aç</button>`
          : `<button class="pa-btn pa-sm" style="background:#b3261e;color:#fff;border-color:#b3261e;white-space:nowrap" onclick="PA.disKilit(true)">Tüm Dış Erişimi Kes</button>`}
      </div>
      <div class="pa-tblwrap"><table class="pa-tbl">
        <thead><tr><th>Ad</th><th>Kullanıcı</th><th>Geçici Şifre</th><th>Şifre Durumu</th>${MODS.map(m=>`<th>${esc(m.ad)}</th>`).join('')}<th>Fiyat Görür</th><th>Sipariş Siler</th><th>Portal Yön.</th><th>Arama</th><th></th></tr></thead>
        <tbody id="pa-rows">${userRows}</tbody>
      </table></div>
      <button class="pa-btn pa-sm" onclick="PA.add()">+ Kullanıcı Ekle</button>
      <div class="pa-t" style="margin-top:22px;font-size:14px">Muhasebe Giriş Onayı</div>
      <div class="pa-s">Muhasebeye her girişte aşağıdaki Telegram alıcılarına onay mesajı gider; ${'onay gelmeden ekran açılmaz'}. Alıcı eklemek için kişi, telefonundan bota (<b>@</b> fabrika onay botu) özel mesajdan <b>/start</b> yazmalı; ardından burada listeden seçilir.</div>
      <div class="pa-onay">
        <div><b>Alıcılar:</b> <span id="pa-alicilar">${(M.alicilar||[]).map(a=>esc(a.ad||a.chatId)).join(' · ')||'— tanımlı değil (eski ortak şifre geçerli)'}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <select id="pa-aday">${adayOpts||'<option value="">aday yok — bota /start yazılmalı</option>'}</select>
          <button class="pa-btn pa-sm" onclick="PA.addAlici()">Alıcı Ekle</button>
          <button class="pa-btn pa-sm pa-out" onclick="PA.clearAlici()">Alıcıları Temizle</button>
          <label style="font-size:12px;color:#5b6b80">Gerekli onay: <select id="pa-gerekli" onchange="PA.gerekli(this.value)"><option value="1" ${(+M.gerekli||1)===1?'selected':''}>1 kişi yeterli</option><option value="2" ${(+M.gerekli||1)===2?'selected':''}>2 kişi de onaylamalı</option></select></label>
        </div>
      </div>
      <div class="pa-t" style="margin-top:22px;font-size:14px">Yem Üretim Onayı</div>
      <div class="pa-s">Her yem siparişi (çapraz siparişler dahil) önce muhasebe onayından geçer; muhasebe onaylayınca <b>üretim onayı</b> için Telegram'a mesaj gider ve <b>yalnız aşağıdaki üretim onaycıları</b> onaylayabilir. Yedek onaycı (yönetici) mücbir sebep içindir. Onaycı önce bota <b>/start</b> yazıp aday olmalı; sonra kullanıcı + aday eşleştirilir.</div>
      <div class="pa-onay">
        <div><b>Onaycılar:</b> <span id="pa-yemonaycilar">${(YM.alicilar||[]).map(a=>esc((a.ad||a.chatId)+(a.username?' ('+a.username+')':''))).join(' · ')||'— tanımlı değil (şimdilik herkes onaylayabilir)'}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <select id="pa-yem-user"><option value="">— kullanıcı —</option>${PDATA.users.map(u=>`<option value="${esc(u.username)}">${esc(u.name||u.username)} (${esc(u.username)})</option>`).join('')}</select>
          <select id="pa-yem-aday">${adayOpts||'<option value="">aday yok — bota /start yazılmalı</option>'}</select>
          <button class="pa-btn pa-sm" onclick="PA.addYemOnayci()">Onaycı Ekle</button>
          <button class="pa-btn pa-sm pa-out" onclick="PA.clearYemOnay()">Temizle</button>
        </div>
      </div>
      <div class="pa-t" style="margin-top:22px;font-size:14px">Muhasebe Sipariş Onayı</div>
      <div class="pa-s">Her yeni sipariş (TMR ve Yem, çapraz siparişler dahil) önce <b>muhasebe onayına</b> düşer; <b>yalnız aşağıdaki onaycılar</b> onaylayabilir — Telegram'dan ya da sipariş kartındaki <b>Muhasebe Onayı Ver</b> düğmesinden. <b>Telegram adayı isteğe bağlıdır</b>: boş bırakılırsa kişi yalnız site üzerinden onaylar. Muhasebe onaylayınca üretim onay mesajı gider (katı sıra). Kim onayladığı sipariş kartında/kolonunda görünür. Onaycı önce bota <b>/start</b> yazıp aday olmalı; sonra kullanıcı + aday eşleştirilir. <b>Liste boşsa geçici olarak gruptaki herkes onaylayabilir — açılıştan önce doldurun.</b></div>
      <div class="pa-onay">
        <div><b>Onaycılar:</b> <span id="pa-msonaycilar">${(MSO.alicilar||[]).map(a=>esc((a.ad||a.chatId)+(a.username?' ('+a.username+')':''))).join(' · ')||'— tanımlı değil (şimdilik herkes onaylayabilir)'}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <select id="pa-mso-user"><option value="">— kullanıcı —</option>${PDATA.users.map(u=>`<option value="${esc(u.username)}">${esc(u.name||u.username)} (${esc(u.username)})</option>`).join('')}</select>
          <select id="pa-mso-aday">${adayOpts||'<option value="">aday yok — bota /start yazılmalı</option>'}</select>
          <button class="pa-btn pa-sm" onclick="PA.addMuhSipOnayci()">Onaycı Ekle</button>
          <button class="pa-btn pa-sm pa-out" onclick="PA.clearMuhSipOnay()">Temizle</button>
        </div>
      </div>
      <div class="pa-t" style="margin-top:22px;font-size:14px">TMR Üretim Onayı</div>
      <div class="pa-s">Sipariş kartındaki <b>Üretim Onayı Ver</b> düğmesini yalnız aşağıdaki kişiler görür ve kullanabilir. Muhasebe onayı verilmeden üretim onayı yazılamaz. <b>Liste boşken kimse panelden üretim onayı veremez</b> — en az bir kişi ekleyin.</div>
      <div class="pa-onay">
        <div><b>Onaycılar:</b> <span id="pa-fbonaycilar">${(FBO.alicilar||[]).map(a=>esc((a.ad||a.username)+(a.username?' ('+a.username+')':''))).join(' · ')||'— tanımlı değil (panelden üretim onayı KAPALI)'}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <select id="pa-fbo-user"><option value="">— kullanıcı —</option>${PDATA.users.map(u=>`<option value="${esc(u.username)}">${esc(u.name||u.username)} (${esc(u.username)})</option>`).join('')}</select>
          <button class="pa-btn pa-sm" onclick="PA.addFabOnayci()">Onaycı Ekle</button>
          <button class="pa-btn pa-sm pa-out" onclick="PA.clearFabOnay()">Temizle</button>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="pa-btn pa-out" onclick="document.querySelector('.pa-bg').remove()">Vazgeç</button>
        <button class="pa-btn pa-go" style="width:auto;padding:11px 26px" onclick="PA.save()">Kaydet</button>
      </div>
      <button class="pa-x" onclick="document.querySelector('.pa-bg').remove()">✕</button>
    </div></div>`);
  if(_kaydirma){const _b=document.querySelector('#pa-modal .pa-box');if(_b)_b.scrollTop=_kaydirma;}
}
function bolumKapali(u,mod,b){return !!(u.bolum&&u.bolum[mod+'.'+b]===false);}
function altKapali(u,key){return !!(u.bolum&&u.bolum[key]===false);}
function bolumChipHTML(u,i,mod,b){
  const [k,l,alt]=b;
  const kapali=bolumKapali(u,mod,k);
  const ana=`<label class="pa-chip ${kapali?'off':''}"><input type="checkbox" ${kapali?'':'checked'} onchange="PA.bolumSet(${i},'${mod}.${k}',this.checked)">${esc(l)}</label>`;
  if(!alt||!alt.length)return ana;
  const alts=alt.map(([ak,al])=>{
    const sk=mod+'.'+k+'.'+ak, sk_off=altKapali(u,sk);
    return `<label class="pa-chip pa-sub ${sk_off?'off':''}"><input type="checkbox" ${sk_off?'':'checked'} onchange="PA.bolumSet(${i},'${sk}',this.checked)">${esc(al)}</label>`;
  }).join('');
  return `<div class="pa-bgroup">${ana}<div class="pa-bsubs" ${kapali?'style="opacity:.35;pointer-events:none"':''}>${alts}</div></div>`;
}
function bolumGridHTML(u,i){
  const gruplar=BOLUMLER.filter(g=>permOf(u,g.mod)!=='yok');
  if(!gruplar.length)return '<div style="font-size:12px;color:#8aa0b8;padding:10px">Önce üstten en az bir modüle giriş yetkisi verin — bölüm izinleri ondan sonra açılır.</div>';
  return `<div class="pa-bwrap">
    <div class="pa-bhead">
      <b>${esc(u.name||u.username)}</b> için bölüm izinleri — işaretli bölümleri görür, işareti kaldırdıkların o kullanıcıda tamamen gizlenir. Girintili olanlar o bölümün <b>alt sekmeleridir</b>.
      <button class="pa-btn pa-sm" style="margin-left:auto" onclick="PA.bolumTum(${i},true)">Her Şeyi Aç</button>
      <button class="pa-btn pa-sm pa-out" onclick="PA.bolumTum(${i},false)">Her Şeyi Kapat</button>
    </div>
    <div class="pa-bgrid">
    ${gruplar.map(g=>`<div class="pa-bm">
      <div class="pa-bm-h">${esc(g.ad)}
        <span style="margin-left:auto;display:flex;gap:5px">
          <button class="pa-mini" onclick="PA.bolumModul(${i},'${g.mod}',true)" title="Bu kartın tüm bölümlerini aç">tümü</button>
          <button class="pa-mini pa-mini-k" onclick="PA.bolumModul(${i},'${g.mod}',false)" title="Bu kartın tüm bölümlerini kapat">hiçbiri</button>
        </span></div>
      <div class="pa-bl">${g.list.map(b=>bolumChipHTML(u,i,g.mod,b)).join('')}</div>
    </div>`).join('')}
    </div></div>`;
}
window.PA={
  bolumAc(i){PDATA._acik=PDATA._acik||{};PDATA._acik[i]=!PDATA._acik[i];openPanel();},
  bolumSet(i,key,acikMi){const u=PDATA.users[i];u.bolum=u.bolum||{};if(acikMi)delete u.bolum[key];else u.bolum[key]=false;openPanel();},
  bolumModul(i,mod,acikMi){const u=PDATA.users[i];u.bolum=u.bolum||{};const g=BOLUMLER.find(x=>x.mod===mod);
    g.list.forEach(([k,l,alt])=>{
      if(acikMi)delete u.bolum[mod+'.'+k];else u.bolum[mod+'.'+k]=false;
      (alt||[]).forEach(([ak])=>{const sk=mod+'.'+k+'.'+ak;if(acikMi)delete u.bolum[sk];else u.bolum[sk]=false;});
    });openPanel();},
  bolumTum(i,acikMi){const u=PDATA.users[i];u.bolum={};
    if(!acikMi)BOLUMLER.filter(g=>permOf(u,g.mod)!=='yok').forEach(g=>g.list.forEach(([k,l,alt])=>{
      u.bolum[g.mod+'.'+k]=false;
      (alt||[]).forEach(([ak])=>u.bolum[g.mod+'.'+k+'.'+ak]=false);
    }));openPanel();},
  set(i,f,v){PDATA.users[i][f]=v;},
  perm(i,k,v){(PDATA.users[i].perms=PDATA.users[i].perms||{})[k]=v;},
  del(i){if(!confirm(PDATA.users[i].username+' silinsin mi?'))return;PDATA.users.splice(i,1);openPanel();},
  add(){PDATA.users.push({id:'u'+Date.now().toString(36),username:'',password:'',name:'',perms:{siparis:'yok',yem:'yok',muhasebe:'yok',ik:'yok',saha:'yok',bakim:'yok',toplanti:'yok'},fiyatGor:false,siparisSil:false,portalYonetici:false,arama:false});openPanel();},
  async disKilit(kapali){
    const mesaj=kapali
      ? 'DİKKAT: TÜM dış erişimi (bayi, danışman, müşteri) kapatmak üzeresiniz.\n\nOnlar siteye girse bile hiçbir veri göremez, sipariş veremez. İç personel ETKİLENMEZ, veri SİLİNMEZ. İşlem denetim izine işlenir ve Telegram\'a bildirilir.\n\nDevam edilsin mi?'
      : 'Dış erişimi YENİDEN AÇMAK üzeresiniz. Bayi, danışman ve müşteriler tekrar girebilecek.\n\nDevam edilsin mi?';
    if(!confirm(mesaj))return;
    try{
      const t=await auth.currentUser.getIdToken();
      const r=await fetch(YONETIM_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({islem:'diskilit',kapali:kapali})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.ok)throw new Error(j.hata||('sunucu '+r.status));
      PDATA.disKilit=j.kapali;
      alert(j.kapali?'TÜM dış erişim KESİLDİ. Bayi/danışman/müşteri artık giremiyor.\n(Denetim izine işlendi, Telegram\'a bildirildi.)':'Dış erişim yeniden AÇILDI.');
      const m=document.getElementById('pa-modal');if(m)m.remove();openPanel();
    }catch(e){alert('İşlem başarısız: '+(e.message||e));}
  },
  addAlici(){const v=document.getElementById('pa-aday').value;if(!v)return;const a=(PDATA.adaylar||[]).find(x=>String(x.chatId)===String(v));const M=PDATA.muhasebeOnay;M.alicilar=M.alicilar||[];if(M.alicilar.length>=2){alert('En fazla 2 alıcı.');return;}if(!M.alicilar.some(x=>String(x.chatId)===String(v)))M.alicilar.push({chatId:v,ad:a?a.ad:v});openPanel();},
  clearAlici(){PDATA.muhasebeOnay.alicilar=[];openPanel();},
  gerekli(v){PDATA.muhasebeOnay.gerekli=+v||1;},
  addYemOnayci(){var u=document.getElementById('pa-yem-user').value;var c=document.getElementById('pa-yem-aday').value;if(!u||!c){alert('Kullanıcı ve Telegram adayını (bota /start yazan) seçin.');return;}var a=(PDATA.adaylar||[]).find(x=>String(x.chatId)===String(c));var YM=PDATA.yemOnay=PDATA.yemOnay||{alicilar:[]};YM.alicilar=YM.alicilar||[];if(YM.alicilar.length>=2){alert('En fazla 2 üretim onaycısı (asıl + yedek yönetici).');return;}if(!YM.alicilar.some(x=>x.username===u||String(x.chatId)===String(c)))YM.alicilar.push({username:u,chatId:c,ad:a?a.ad:c});openPanel();},
  clearYemOnay(){PDATA.yemOnay={alicilar:[]};openPanel();},
  // TELEGRAM ADAYI İSTEĞE BAĞLI (31.07): muhasebe onayı artık sipariş kartından da verilebiliyor.
  // Panel yolu username'e, Telegram yolu chatId'ye bakar. Adayı zorunlu tutmak, Telegram'ı
  // olmayan muhasebeciyi onaycı yapılamaz hâle getiriyordu — siteden de onaylayamıyordu.
  // chatId boş kalırsa: Telegram eşleşmesi olmaz (String(undefined) hiçbir id'ye eşit değil),
  // alıcı beyaz-listesi de chatId!=null süzdüğü için etkilenmez. Site onayı çalışır.
  addMuhSipOnayci(){
    var u=document.getElementById('pa-mso-user').value;
    var c=document.getElementById('pa-mso-aday').value;
    if(!u){alert('Kullanıcı seçin. (Telegram adayı isteğe bağlıdır — boş bırakılırsa yalnız site üzerinden onay verir.)');return;}
    var a=(PDATA.adaylar||[]).find(function(x){return String(x.chatId)===String(c);});
    var MSO=PDATA.muhasebeSiparisOnay=PDATA.muhasebeSiparisOnay||{alicilar:[]};MSO.alicilar=MSO.alicilar||[];
    if(MSO.alicilar.length>=6){alert('En fazla 6 muhasebe onaycısı.');return;}
    if(MSO.alicilar.some(function(x){return String(x.username||'').toLowerCase()===String(u).toLowerCase();})){alert('Bu kullanıcı zaten onaycı.');return;}
    var uy=(PDATA.users||[]).find(function(x){return x.username===u;});
    var kayit={username:u,ad:(a&&a.ad)||(uy&&(uy.name||uy.username))||u};
    if(c)kayit.chatId=c;   // yalnız seçildiyse yaz — boş dize chatId'yi 'tanımlı' göstermesin
    MSO.alicilar.push(kayit);openPanel();},
  clearMuhSipOnay(){PDATA.muhasebeSiparisOnay={alicilar:[]};openPanel();},
  addFabOnayci(){var u=document.getElementById('pa-fbo-user').value;if(!u){alert('Kullanıcı seçin.');return;}
    var F=PDATA.fabrikaOnay=PDATA.fabrikaOnay||{alicilar:[]};F.alicilar=F.alicilar||[];
    if(F.alicilar.length>=6){alert('En fazla 6 TMR üretim onaycısı.');return;}
    if(F.alicilar.some(function(x){return String(x.username||'').toLowerCase()===String(u).toLowerCase();})){alert('Bu kullanıcı zaten onaycı.');return;}
    var uy=(PDATA.users||[]).find(function(x){return x.username===u;});
    F.alicilar.push({username:u,ad:(uy&&(uy.name||uy.username))||u});openPanel();},
  clearFabOnay(){PDATA.fabrikaOnay={alicilar:[]};openPanel();},

  async denetim(){
    let list=[];
    try{
      const snap=await getDocs(query(collection(db,'denetim'),orderBy('ts','desc'),limit(150)));
      snap.forEach(x=>list.push(x.data()));
    }catch(e){alert('Denetim izi okunamadı: '+(e.code||e.message||e));return;}
    const satir=list.map(d=>`<tr><td style="white-space:nowrap;color:#5b6b80;font-size:12px">${esc(denetimTarih(d.ts))}</td><td style="font-weight:600;white-space:nowrap">${esc(d.aktor||'?')}</td><td>${esc(denetimMetin(d))}</td></tr>`).join('');
    document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg"><div class="pa-box pa-wide" style="max-width:820px">
      <div class="pa-t">Denetim İzi</div>
      <div class="pa-s">Kim, ne zaman, ne yaptı — güvenlik olayları (yetki değişimi, hesap açma/kapatma, şifre sıfırlama, toptan-silme denemesi). Bu kayıtlar sunucuda tutulur, kimse silemez/değiştiremez.</div>
      <div class="pa-tblwrap" style="max-height:60vh;overflow:auto"><table class="pa-tbl"><thead><tr><th>Tarih</th><th>Yapan</th><th>İşlem</th></tr></thead><tbody>${satir||'<tr><td colspan="3" style="padding:16px;color:#8aa0b8">Henüz kayıt yok — bir yetki/hesap değişikliği yapılınca burada görünür.</td></tr>'}</tbody></table></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="pa-btn pa-out" onclick="this.closest('.pa-bg').remove()">Kapat</button></div>
      <button class="pa-x" onclick="this.closest('.pa-bg').remove()">✕</button>
    </div></div>`);
  },
  // ---- Hesap Durumu / Atıl hesaplar (Faz 3.3) ----
  async hesapDurum(){
    let hesaplar=[];
    try{
      const t=await auth.currentUser.getIdToken();
      const r=await fetch(YONETIM_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({islem:'durum'})});
      const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.hata||('sunucu '+r.status));
      hesaplar=j.hesaplar||[];
    }catch(e){alert('Hesap durumu alınamadı: '+(e.message||e));return;}
    const now=Date.now();
    const gun=x=>x.sonGiris?Math.floor((now-new Date(x.sonGiris).getTime())/864e5):null;
    hesaplar.sort((a,b)=>{const ga=gun(a),gb=gun(b);return (gb==null?1e9:gb)-(ga==null?1e9:ga);});   // en atıl (veya hiç girmeyen) üstte
    const atil=hesaplar.filter(x=>!x.disabled&&(gun(x)==null||gun(x)>=60));
    const rolAd=r=>r==='bayi'?'Bayi':(r==='danisman'?'Danışman':'İç personel');
    const satir=hesaplar.map(x=>{
      const g=gun(x), kapali=x.disabled;
      const durumMetin=kapali?'kapalı':(g==null?'hiç giriş yok':(g>=60?g+' gündür atıl':(g<=0?'bugün':g+' gün önce')));
      const renk=kapali?'#94a3b8':((g==null||g>=60)?'#b45309':'#15803d');
      return `<tr style="${kapali?'opacity:.55':''}"><td><b>${esc(x.username)}</b></td><td style="font-size:11.5px;color:#8aa0b8">${esc(rolAd(x.rol))}</td><td style="font-weight:600;color:${renk};white-space:nowrap">${esc(durumMetin)}</td></tr>`;
    }).join('');
    document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg"><div class="pa-box pa-wide" style="max-width:620px">
      <div class="pa-t">Hesap Durumu</div>
      <div class="pa-s">Ayrılan/işi biten kişilerin hesabını kapatın; uzun süre giriş yapmayanları dönemsel gözden geçirin. Kapatma: iç personeli listeden çıkarıp Kaydet; bayi/danışmanı Bayi &amp; Danışman (saha) modülünden.</div>
      ${atil.length?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#92400e"><b>${atil.length} hesap</b> 60+ gündür giriş yapmadı (ya da hiç) — gözden geçirin.</div>`:''}
      <div class="pa-tblwrap" style="max-height:60vh;overflow:auto"><table class="pa-tbl" style="width:100%"><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Son Giriş</th></tr></thead><tbody>${satir||'<tr><td colspan="3" style="padding:14px;color:#8aa0b8">Hesap yok.</td></tr>'}</tbody></table></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="pa-btn pa-out" onclick="this.closest('.pa-bg').remove()">Kapat</button></div>
      <button class="pa-x" onclick="this.closest('.pa-bg').remove()">✕</button>
    </div></div>`);
  },
  // ---- Yedek & Geri Yükleme Provası (Faz 3.1) ----
  async _yedekCagir(payload){
    if(!auth.currentUser)throw new Error('oturum yok');
    const t=await auth.currentUser.getIdToken();
    const r=await fetch(YEDEK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.hata||('sunucu '+r.status));
    return j;
  },
  async yedek(){
    document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg"><div class="pa-box pa-wide" style="max-width:760px">
      <div class="pa-t">Yedek & Geri Yükleme</div>
      <div class="pa-s">Veriler her gece 03:00'te otomatik yedeklenir (Firestore + ayrı depolama sistemi, 30 gün saklanır). Buradan elle yedek alabilir; bir yedeğin gerçekten geri yüklenebildiğini <b>Prova</b> ile test edebilirsiniz. Prova canlı veriye <b>dokunmaz</b>.</div>
      <div style="display:flex;gap:8px;margin:6px 0 14px"><button class="pa-btn pa-sm" onclick="PA.yedekAl()">Şimdi Yedekle</button><button class="pa-btn pa-sm pa-out" onclick="PA.yedekListe()">Listeyi Yenile</button></div>
      <div id="pa-yedek-ic" style="font-size:13px;color:#5b6b80">Yükleniyor…</div>
      <button class="pa-x" onclick="this.closest('.pa-bg').remove()">✕</button>
    </div></div>`);
    this.yedekListe();
  },
  async yedekListe(){
    const ic=document.getElementById('pa-yedek-ic');if(!ic)return;ic.textContent='Yükleniyor…';
    try{
      const j=await this._yedekCagir({islem:'listele'});
      if(!j.liste||!j.liste.length){ic.innerHTML='Henüz yedek yok. “Şimdi Yedekle” ile ilk yedeği alın.';return;}
      ic.innerHTML='<table class="pa-tbl" style="width:100%"><thead><tr><th>Tarih</th><th>Modüller</th><th></th></tr></thead><tbody>'+
        j.liste.map(y=>`<tr><td style="white-space:nowrap"><b>${esc(y.tarih)}</b></td><td style="font-size:11.5px;color:#8aa0b8">${esc((y.moduller||[]).join(', '))}</td><td style="text-align:right;white-space:nowrap"><button class="pa-btn pa-sm pa-out" onclick="PA.yedekProva('${esc(y.tarih)}')">Geri Yükleme Provası</button></td></tr>`).join('')+
        '</tbody></table><div id="pa-prova-sonuc" style="margin-top:12px"></div>';
    }catch(e){ic.textContent='Yedek listesi alınamadı: '+(e.message||e);}
  },
  async yedekAl(){
    const ic=document.getElementById('pa-yedek-ic');if(ic)ic.textContent='Yedek alınıyor… (birkaç saniye)';
    try{const j=await this._yedekCagir({islem:'yedekle'});
      const ok=(j.sonuc||[]).filter(x=>x.durum==='ok'||x.durum==='ok-fs').length;
      alert('Yedek alındı ('+j.tarih+'): '+ok+'/'+(j.sonuc||[]).length+' modül başarılı.');
    }catch(e){alert('Yedeklenemedi: '+(e.message||e));}
    this.yedekListe();
  },
  async yedekProva(tarih){
    const el=document.getElementById('pa-prova-sonuc');if(el)el.innerHTML='<span style="color:#5b6b80">Prova çalışıyor…</span>';
    try{
      const j=await this._yedekCagir({islem:'prova',tarih});
      const hepOk=(j.rapor||[]).every(x=>x.durum==='ok'||x.durum==='yok');
      const satir=(j.rapor||[]).map(x=>`<tr><td>${esc(x.id)}</td><td style="font-weight:700;color:${x.durum==='ok'?'#15803d':(x.durum==='yok'?'#8aa0b8':'#b91c1c')}">${esc(x.durum==='ok'?'geri yüklendi':x.durum)}</td><td style="color:#8aa0b8">${(x.kayit!=null&&x.kayit>=0)?x.kayit+' kayıt':''}${x.kaynak?' · '+esc(x.kaynak):''}</td></tr>`).join('');
      if(el)el.innerHTML=`<div style="background:${hepOk?'#ecfdf5':'#fef2f2'};border:1px solid ${hepOk?'#a7f3d0':'#fecaca'};border-radius:10px;padding:12px 14px">
        <div style="font-weight:800;color:${hepOk?'#065f46':'#991b1b'};margin-bottom:8px">${hepOk?'Geri yükleme provası BAŞARILI':'Provada sorun var — kontrol edin'} · ${esc(tarih)}</div>
        <table class="pa-tbl" style="width:100%"><tbody>${satir}</tbody></table>
        <div style="font-size:11.5px;color:#8aa0b8;margin-top:8px">Prova, yedeği ayrı bir alana geri yükleyip doğruladı ve sildi — canlı verilere dokunulmadı.</div></div>`;
    }catch(e){if(el)el.innerHTML='<span style="color:#b91c1c">Prova başarısız: '+esc(e.message||String(e))+'</span>';}
  },
  sifre(i,val){PDATA.users[i]._yeniSifre=val;},   // satıra bağlı; kullanıcı adıyla eşleşme kayıt anında yapılır
  async save(){
    for(const u of PDATA.users){if(!u.username){alert('Kullanıcı adı boş olamaz.');return;}}
    const us=PDATA.users.map(u=>u.username.toLowerCase());
    if(new Set(us).size!==us.length){alert('Aynı kullanıcı adı iki kez kullanılamaz.');return;}
    if(!PDATA.users.some(u=>u.portalYonetici)){alert('En az bir Portal Yöneticisi kalmalı.');return;}
    // AÇILIŞ-BLOKERİ #3: yeni/değişen parolalar min-8 + harf + rakam olmalı (sunucu da zorlar; bu anında geri bildirim)
    for(const u of PDATA.users){const p=String(u._yeniSifre||'').trim();if(p&&!(p.length>=8&&/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p)&&/[0-9]/.test(p))){alert('"'+u.username+'" için şifre en az 8 karakter olmalı ve harf ile rakam içermeli.');return;}}
    if(!auth.currentUser){alert('Oturum doğrulanamadı — çıkıp tekrar giriş yapın.');return;}
    try{
      const t=await auth.currentUser.getIdToken();
      // DİKKAT: bu beyaz-liste kullanıcı kaydını yeniden kurar — yeni bir kullanıcı alanı eklersen
      // BURAYA ve functions/index.js'teki sunucu temizleyicisine de eklemezsen alan kaydedilmez.
      const users=PDATA.users.map(u=>({id:u.id,username:u.username,name:u.name||'',perms:u.perms||{},fiyatGor:!!u.fiyatGor,siparisSil:!!u.siparisSil,portalYonetici:!!u.portalYonetici,arama:!!u.arama,bolum:u.bolum||{}}));
      const sifreler={};PDATA.users.forEach(u=>{const p=String(u._yeniSifre||'').trim();if(u.username&&p)sifreler[u.username]=p;});
      const r=await fetch(YONETIM_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body:JSON.stringify({islem:'sync',users,sifreler,muhasebeOnay:PDATA.muhasebeOnay,yemOnay:PDATA.yemOnay,muhasebeSiparisOnay:PDATA.muhasebeSiparisOnay,fabrikaOnay:PDATA.fabrikaOnay})});
      const j=await r.json();
      if(!r.ok||!j.ok){alert('Kaydedilemedi: '+(j.hata||r.status));return;}
      PDATA.users.forEach(u=>{delete u._yeniSifre;});
      alert('Kaydedildi.'+(j.notlar&&j.notlar.length?'\n\nNotlar:\n- '+j.notlar.join('\n- '):''));
      await loadPortal(true);closeModals();applyAuthUI();
    }catch(e){alert('Kaydedilemedi: '+e.message);}
  },
};

// ---------- başlangıç ----------
async function init(){
  const bar=document.getElementById('pa-bar');if(!bar)return;
  const d=await loadPortal();
  const s=session();
  PUSER=(s&&d&&d.users)?(d.users.find(x=>x.username===s.u)||null):null;
  if(PUSER===null&&s)localStorage.removeItem(SES);
  applyAuthUI();
  // Bloker #3: sürdürülen oturumda da geçici/dolmuş şifre → zorunlu yenileme (mevcut şifre sorulur)
  if(PUSER&&sifreDurumu(PUSER).zorunlu)sifreDegistirModal({zorunlu:true,next:''});
  // dil değişince kartlar yeniden basılıyor — kilitleri tekrar uygula
  const orig=window.render;if(typeof orig==='function')window.render=function(){orig();applyAuthUI();};
  // ?giris=1&next=... → login modalını aç
  const p=new URLSearchParams(location.search);
  if(p.get('giris')==='1'&&!PUSER)openLogin(p.get('next')||'');
}

// ---------- PWA: Uygulamayı Yükle (Android/masaüstü tek tık · iOS yönerge) ----------
let _bip=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_bip=e;pwaBtn();});
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function pwaBtn(){
  if(isStandalone()||document.getElementById('pa-pwa'))return;
  if(!_bip&&!isIOS())return;
  const bar=document.getElementById('pa-bar');if(!bar)return;
  const b=document.createElement('button');b.id='pa-pwa';b.className='pa-btn pa-pwa';
  b.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Uygulamayı Yükle';
  b.onclick=async()=>{
    if(_bip){_bip.prompt();const r=await _bip.userChoice;if(r&&r.outcome==='accepted')b.remove();_bip=null;}
    else iosYonerge();
  };
  bar.insertAdjacentElement('beforebegin',b);
}
function iosYonerge(){
  closeModals();
  document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg" id="pa-modal">
    <div class="pa-box">
      <div class="pa-t">Ana Ekrana Ekle</div>
      <div class="pa-s">Rota SMI uygulamasını iPhone / iPad ana ekranınıza eklemek için:</div>
      <ol style="font-size:13px;color:#41546e;line-height:2;margin:0 0 6px 18px">
        <li>Safari'de alttaki <b>Paylaş</b> simgesine dokunun <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#174b82" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></li>
        <li><b>"Ana Ekrana Ekle"</b> seçeneğine dokunun</li>
        <li>Sağ üstten <b>Ekle</b>'ye dokunun</li>
      </ol>
      <div class="pa-s" style="margin:8px 0 0">Uygulama, parlement mavisi Rota SMI simgesiyle ana ekranınıza yerleşir.</div>
      <button class="pa-x" onclick="document.querySelector('.pa-bg').remove()">✕</button>
    </div></div>`);
}


init().then(()=>pwaBtn());
