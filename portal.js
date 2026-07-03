// ============================================================
// ROTA SMI · Portal Giriş + Erişim Yönetimi (çark paneli)
// Tek giriş: kullanıcı portalda oturum açar; modül kartları
// yetkiye göre açılır/kilitlenir. Yönetici çarktan kullanıcı
// ve modül yetkilerini düzenler (apps/portal · rota_portal_v1).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8",authDomain:"rota-yem.firebaseapp.com",projectId:"rota-yem",storageBucket:"rota-yem.firebasestorage.app",messagingSenderId:"186408871052",appId:"1:186408871052:web:65791c132b2c1b525307a9"};
const app=initializeApp(firebaseConfig), db=getFirestore(app);
const SES='rota_portal_session';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Modül tanımları: kart href → yetki anahtarı + seviye seçenekleri
const MODS=[
 {key:'siparis', href:'siparis/', ad:'Sipariş Takip', seviyeler:[['yok','Girmez'],['goruntule','Görüntüler'],['sevkiyat','Sevkiyat'],['siparis','Sipariş Personeli'],['admin','Yönetici']]},
 {key:'muhasebe',href:'muhasebe/',ad:'Muhasebe & Finans', seviyeler:[['yok','Girmez'],['yonetici','Yönetici']]},
 {key:'ik', href:'ik/', ad:'İnsan Kaynakları', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'bakim', href:'bakim/', ad:'Makine Envanter', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'saha', href:'saha/', ad:'Bayi & Danışman', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
 {key:'toplanti',href:'haftalik-toplanti/',ad:'Haftalık Toplantı', seviyeler:[['yok','Girmez'],['kullan','Girer'],['yonetici','Yönetici']]},
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

// ---------- kart kilitleme + üst bar ----------
function permOf(u,key){return (u&&u.perms&&u.perms[key])||'yok';}
function applyAuthUI(){
  const bar=document.getElementById('pa-bar');if(!bar)return;
  if(PUSER){
    bar.innerHTML=`<span class="pa-user">${esc(PUSER.name||PUSER.username)}</span>
      ${PUSER.portalYonetici?`<button class="pa-ic" id="pa-gear" title="Erişim Yönetimi"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>`:''}
      <button class="pa-btn pa-out" id="pa-logout">Çıkış</button>`;
    const g=document.getElementById('pa-gear');if(g)g.onclick=openPanel;
    document.getElementById('pa-logout').onclick=()=>{localStorage.removeItem(SES);location.reload();};
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
    if(permOf(PUSER,mod.key)==='yok'){
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
  const d=await loadPortal(true);
  const usr=d&&d.users&&d.users.find(x=>x.username.toLowerCase()===u.toLowerCase()&&x.password===p);
  if(!usr){document.getElementById('pa-err').textContent='Kullanıcı adı veya şifre hatalı.';return;}
  localStorage.setItem(SES,JSON.stringify({u:usr.username,ts:Date.now()}));
  PUSER=usr;closeModals();applyAuthUI();
  if(nextHref){
    const mod=MODS.find(m=>m.href===nextHref||('/'+m.href).indexOf(nextHref)>=0||nextHref.indexOf(m.href)>=0);
    if(!mod||permOf(usr,mod.key)!=='yok')location.href=nextHref;
    else alert('Giriş yapıldı ancak bu modüle erişim yetkiniz yok.');
  }
}
function closeModals(){document.querySelectorAll('.pa-bg').forEach(x=>x.remove());}

// ---------- erişim yönetim paneli (çark) ----------
function openPanel(){
  closeModals();
  const M=PDATA.muhasebeOnay||(PDATA.muhasebeOnay={alicilar:[],gerekli:1});
  const userRows=PDATA.users.map((u,i)=>`<tr>
    <td><input value="${esc(u.name||'')}" onchange="PA.set(${i},'name',this.value)" style="width:130px"></td>
    <td><input value="${esc(u.username)}" onchange="PA.set(${i},'username',this.value)" style="width:90px"></td>
    <td><input value="${esc(u.password)}" onchange="PA.set(${i},'password',this.value)" style="width:80px"></td>
    ${MODS.map(m=>`<td><select onchange="PA.perm(${i},'${m.key}',this.value)">${m.seviyeler.map(([v,l])=>`<option value="${v}" ${permOf(u,m.key)===v?'selected':''}>${l}</option>`).join('')}</select></td>`).join('')}
    <td style="text-align:center"><input type="checkbox" ${u.fiyatGor?'checked':''} onchange="PA.set(${i},'fiyatGor',this.checked)" title="Sipariş modülünde fiyatları görebilir"></td>
    <td style="text-align:center"><input type="checkbox" ${u.portalYonetici?'checked':''} onchange="PA.set(${i},'portalYonetici',this.checked)" title="Bu paneli açabilir, kullanıcı yönetir"></td>
    <td><button class="pa-del" onclick="PA.del(${i})">Sil</button></td>
  </tr>`).join('');
  const adayOpts=(PDATA.adaylar||[]).map(a=>`<option value="${esc(a.chatId)}">${esc(a.ad||a.chatId)} (${esc(a.chatId)})</option>`).join('');
  document.body.insertAdjacentHTML('beforeend',`<div class="pa-bg" id="pa-modal">
    <div class="pa-box pa-wide">
      <div class="pa-t">Erişim Yönetimi</div>
      <div class="pa-s">Kim hangi modüle girebilir, neleri yapabilir — buradan yönetilir. Değişiklikler Kaydet ile yayınlanır.</div>
      <div class="pa-tblwrap"><table class="pa-tbl">
        <thead><tr><th>Ad</th><th>Kullanıcı</th><th>Şifre</th>${MODS.map(m=>`<th>${esc(m.ad)}</th>`).join('')}<th>Fiyat Görür</th><th>Portal Yön.</th><th></th></tr></thead>
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
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="pa-btn pa-out" onclick="document.querySelector('.pa-bg').remove()">Vazgeç</button>
        <button class="pa-btn pa-go" style="width:auto;padding:11px 26px" onclick="PA.save()">Kaydet</button>
      </div>
      <button class="pa-x" onclick="document.querySelector('.pa-bg').remove()">✕</button>
    </div></div>`);
}
window.PA={
  set(i,f,v){PDATA.users[i][f]=v;},
  perm(i,k,v){(PDATA.users[i].perms=PDATA.users[i].perms||{})[k]=v;},
  del(i){if(!confirm(PDATA.users[i].username+' silinsin mi?'))return;PDATA.users.splice(i,1);openPanel();},
  add(){PDATA.users.push({id:'u'+Date.now().toString(36),username:'',password:'',name:'',perms:{siparis:'yok',muhasebe:'yok',ik:'yok',saha:'yok',bakim:'yok',toplanti:'yok'},fiyatGor:false,portalYonetici:false});openPanel();},
  addAlici(){const v=document.getElementById('pa-aday').value;if(!v)return;const a=(PDATA.adaylar||[]).find(x=>String(x.chatId)===String(v));const M=PDATA.muhasebeOnay;M.alicilar=M.alicilar||[];if(M.alicilar.length>=2){alert('En fazla 2 alıcı.');return;}if(!M.alicilar.some(x=>String(x.chatId)===String(v)))M.alicilar.push({chatId:v,ad:a?a.ad:v});openPanel();},
  clearAlici(){PDATA.muhasebeOnay.alicilar=[];openPanel();},
  gerekli(v){PDATA.muhasebeOnay.gerekli=+v||1;},
  async save(){
    for(const u of PDATA.users){if(!u.username||!u.password){alert('Kullanıcı adı ve şifre boş olamaz.');return;}}
    const us=PDATA.users.map(u=>u.username.toLowerCase());
    if(new Set(us).size!==us.length){alert('Aynı kullanıcı adı iki kez kullanılamaz.');return;}
    if(!PDATA.users.some(u=>u.portalYonetici)){alert('En az bir Portal Yöneticisi kalmalı.');return;}
    try{await savePortal();alert('Kaydedildi.');closeModals();applyAuthUI();}
    catch(e){alert('Kaydedilemedi: '+e.message);}
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
  // dil değişince kartlar yeniden basılıyor — kilitleri tekrar uygula
  const orig=window.render;if(typeof orig==='function')window.render=function(){orig();applyAuthUI();};
  // ?giris=1&next=... → login modalını aç
  const p=new URLSearchParams(location.search);
  if(p.get('giris')==='1'&&!PUSER)openLogin(p.get('next')||'');
}
init();
