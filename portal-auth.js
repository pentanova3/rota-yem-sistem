// ============================================================
// ROTA SMI · Portal Oturum & Yetki Bekçisi (tüm modüller için)
// Gerçek doğrulama: Firebase Auth oturumu şarttır; yetkiler
// apps/portal profilinden okunur (kurallar da sunucuda ayrıca
// claims ile denetler). Modül sayfaları:
//   <script>window.__PA_MOD='ik';</script>
//   <script type="module" src="/portal-auth.js"></script>
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const cfg={apiKey:"AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8",authDomain:"rota-yem.firebaseapp.com",projectId:"rota-yem",storageBucket:"rota-yem.firebasestorage.app",messagingSenderId:"186408871052",appId:"1:186408871052:web:65791c132b2c1b525307a9"};
const app=initializeApp(cfg), db=getFirestore(app), auth=getAuth(app);
const SES='rota_portal_session';

// Oturum durumu bir kez çözülür (kalıcı oturum indexedDB'den yüklenir)
const authReady=new Promise(res=>{const un=onAuthStateChanged(auth,u=>{un();res(u||null);});});

let _data=null;
async function getData(force){
  if(_data&&!force)return _data;
  await authReady;
  try{
    const s=await getDoc(doc(db,'apps','portal'));
    const d=s.exists()?s.data().data:null;
    _data=d&&d.rota_portal_v1?JSON.parse(d.rota_portal_v1):null;
  }catch(e){_data=null;}
  return _data;
}
function session(){try{const s=JSON.parse(localStorage.getItem(SES)||'null');if(s&&s.u)return s;}catch(e){}return null;}
function setSession(u){localStorage.setItem(SES,JSON.stringify({u,ts:Date.now()}));}
function clearSession(){localStorage.removeItem(SES);}
function kullaniciAdi(u){return u&&u.email?u.email.split('@')[0]:null;}

async function token(){await authReady;const u=auth.currentUser;return u?await u.getIdToken():null;}
async function user(){
  const au=await authReady;if(!au)return null;
  const d=await getData();if(!d||!Array.isArray(d.users))return null;
  const ad=kullaniciAdi(au);
  return d.users.find(x=>x.username.toLowerCase()===ad)||null;
}
async function level(modKey){const u=await user();if(!u)return null;return (u.perms&&u.perms[modKey])||'yok';}

function yetkisizEkran(){
  document.documentElement.innerHTML='<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;margin:0"><div style="text-align:center;max-width:340px;padding:30px;background:#fff;border:1px solid #e2e8f0;border-radius:14px"><div style="font-size:17px;font-weight:800;color:#0c2340;margin-bottom:8px">Erişim Yetkiniz Yok</div><div style="font-size:13px;color:#64748b;line-height:1.6">Bu modüle erişim yetkiniz bulunmuyor. Yetki almak için yöneticinizle görüşün.</div><a href="/" style="display:inline-block;margin-top:16px;background:#0c2340;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 22px;border-radius:9px">Portala Dön</a></div></body>';
}
function girisEkraninaGonder(){location.href='/?giris=1&next='+encodeURIComponent(location.pathname);}

// Bekçi: gerçek Auth oturumu + modül yetkisi. Portal verisi yoksa 'legacy' döner.
async function require(modKey){
  const d=await getData();
  if(!d||!Array.isArray(d.users)||!d.users.length)return {mode:'legacy'};
  const au=await authReady;
  if(!au){girisEkraninaGonder();return new Promise(()=>{});}
  const ad=kullaniciAdi(au);
  const u=d.users.find(x=>x.username.toLowerCase()===ad);
  if(!u){clearSession();girisEkraninaGonder();return new Promise(()=>{});}
  setSession(u.username); // UI ipucu
  const lvl=(u.perms&&u.perms[modKey])||'yok';
  if(lvl==='yok'){yetkisizEkran();return new Promise(()=>{});}
  return {mode:'portal',user:u,level:lvl};
}

window.PortalAuth={getData,session,setSession,clearSession,user,level,require,token,authReady,
  authUser:()=>auth.currentUser};

// Sayfa kendini işaretlediyse bekçiyi çalıştır
if(window.__PA_MOD)require(window.__PA_MOD);
