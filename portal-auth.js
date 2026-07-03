// ============================================================
// ROTA SMI · Portal Oturum & Yetki Bekçisi (tüm modüller için)
// Tek giriş portalda yapılır; modüller bu dosya ile oturumu ve
// modül yetkisini doğrular. apps/portal (rota_portal_v1) okur.
// ============================================================
(function(){
  const KEY='AIzaSyB-eY1jv-HYfrNxzrhWS9sywLBFQarpLD8';
  const URL='https://firestore.googleapis.com/v1/projects/rota-yem/databases/(default)/documents/apps/portal?key='+KEY;
  const SES='rota_portal_session';
  let _data=null;

  async function getData(force){
    if(_data&&!force)return _data;
    try{
      const r=await fetch(URL);if(!r.ok)return null;
      const j=await r.json();
      const raw=j&&j.fields&&j.fields.data&&j.fields.data.mapValue&&j.fields.data.mapValue.fields&&j.fields.data.mapValue.fields.rota_portal_v1;
      _data=raw&&raw.stringValue?JSON.parse(raw.stringValue):null;
    }catch(e){_data=null;}
    return _data;
  }
  function session(){
    try{const s=JSON.parse(localStorage.getItem(SES)||'null');
      if(!s||!s.u)return null;
      if(s.ts&&(Date.now()-s.ts)>30*24*3600*1000){localStorage.removeItem(SES);return null;}  // 30 gün
      return s;
    }catch(e){return null;}
  }
  function setSession(u){localStorage.setItem(SES,JSON.stringify({u,ts:Date.now()}));}
  function clearSession(){localStorage.removeItem(SES);}

  // Oturumdaki kullanıcıyı döndürür (yoksa null). Portal verisi yoksa 'kurulmadı' der.
  async function user(){
    const s=session();if(!s)return null;
    const d=await getData();if(!d||!Array.isArray(d.users))return null;
    return d.users.find(x=>x.username===s.u)||null;
  }
  // Modül yetki seviyesi: 'yok' | modül rolü. Kullanıcı yoksa null.
  async function level(modKey){
    const u=await user();if(!u)return null;
    return (u.perms&&u.perms[modKey])||'yok';
  }
  // Bekçi: yetki yoksa portala yönlendirir. Portal verisi henüz kurulmadıysa
  // (ilk geçiş dönemi) 'legacy' döner — modül eski giriş yöntemini kullanır.
  async function require(modKey,opts){
    opts=opts||{};
    const d=await getData();
    if(!d||!Array.isArray(d.users)||!d.users.length)return {mode:'legacy'};
    const s=session();
    if(!s){location.href='/?giris=1&next='+encodeURIComponent(location.pathname);return new Promise(()=>{});}
    const u=d.users.find(x=>x.username===s.u);
    if(!u){clearSession();location.href='/?giris=1&next='+encodeURIComponent(location.pathname);return new Promise(()=>{});}
    const lvl=(u.perms&&u.perms[modKey])||'yok';
    if(lvl==='yok'){
      document.documentElement.innerHTML='<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;margin:0"><div style="text-align:center;max-width:340px;padding:30px;background:#fff;border:1px solid #e2e8f0;border-radius:14px"><div style="font-size:17px;font-weight:800;color:#0c2340;margin-bottom:8px">Erişim Yetkiniz Yok</div><div style="font-size:13px;color:#64748b;line-height:1.6">Bu modüle erişim yetkiniz bulunmuyor. Yetki almak için yöneticinizle görüşün.</div><a href="/" style="display:inline-block;margin-top:16px;background:#0c2340;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 22px;border-radius:9px">Portala Dön</a></div></body>';
      return new Promise(()=>{});
    }
    return {mode:'portal',user:u,level:lvl};
  }
  window.PortalAuth={getData,session,setSession,clearSession,user,level,require};
})();
