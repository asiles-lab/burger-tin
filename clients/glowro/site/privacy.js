(() => {
 const key='glowro-consent',version=1,id=window.GLOWRO_GA4_ID||'';
 let consent=null,loaded=false;try{consent=JSON.parse(localStorage.getItem(key));}catch{}
 const allowed=()=>consent?.version===version&&consent.analytics===true;
 const campaign={};const query=new URLSearchParams(location.search);
 for(const name of ['source','medium','campaign','content','term']) {const v=query.get(`utm_${name}`);if(v&&/^[a-zA-Z0-9_-]{1,80}$/.test(v))campaign[`campaign_${name==='campaign'?'name':name}`]=v;}
 window.dataLayer=window.dataLayer||[];const gtag=function(){window.dataLayer.push(arguments);};
 function start(){if(loaded||!allowed()||!/^G-[A-Z0-9]+$/.test(id))return;loaded=true;
  window[`ga-disable-${id}`]=false;
  gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  gtag('js',new Date());gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+location.pathname,page_referrer:document.referrer?new URL(document.referrer).origin:'',...campaign});
  const script=document.createElement('script');script.src=`https://www.googletagmanager.com/gtag/js?id=${id}`;script.async=true;document.head.append(script);
  window.glowroAnalytics.event('page_view');document.dispatchEvent(new Event('glowro-analytics-ready'));
 }
 const events=new Set(['page_view','view_item_list','select_item','view_item','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_shipping_info','add_payment_info','purchase']);
 window.glowroAnalytics={event(name,data={}){if(!allowed()||!loaded||!events.has(name))return false;
  const clean={currency:'ARS',page_location:location.origin+location.pathname,page_referrer:document.referrer?new URL(document.referrer).origin:''};
  for(const k of ['value','shipping','tax'])if(Number.isFinite(data[k]))clean[k]=data[k];
  if(name==='purchase'){
   if(!/^GR-\d+$/.test(data.transaction_id||''))return false;
   const purchaseKey=`glowro-purchase-${data.transaction_id}`;try{if(localStorage.getItem(purchaseKey))return false;localStorage.setItem(purchaseKey,'1');}catch{return false;}
   clean.transaction_id=data.transaction_id;
  }
  if(Array.isArray(data.items))clean.items=data.items.map(i=>({item_id:String(i.item_id),item_name:String(i.item_name),price:Number(i.price),quantity:Number(i.quantity)}));
  gtag('event',name,clean);return true;
 }};
 function save(analytics){const was=loaded;consent={version,analytics,at:new Date().toISOString()};try{localStorage.setItem(key,JSON.stringify(consent));}catch{}
  document.querySelector('#consent-banner')?.remove();document.querySelector('#consent-preferences')?.close();
  if(!analytics){window[`ga-disable-${id}`]=true;for(const cookie of document.cookie.split(';')){const name=cookie.trim().split('=')[0];if(name==='_ga'||name.startsWith('_ga_'))for(const domain of ['',location.hostname,'.'+location.hostname,'.restia.net.ar'])document.cookie=`${name}=; Max-Age=0; Path=/;${domain?' Domain='+domain+';':''} SameSite=Lax; Secure`;}
   if(was)location.reload();
  }else start();
 }
 function preferences(){let dialog=document.querySelector('#consent-preferences');if(!dialog){dialog=document.createElement('dialog');dialog.id='consent-preferences';dialog.className='privacy-dialog';dialog.setAttribute('aria-labelledby','preferences-title');dialog.innerHTML='<form method="dialog"><button autofocus>Cerrar</button></form><h2 id="preferences-title">Tus preferencias</h2><p>Esenciales: necesarias para comprar, conservar tu carrito y proteger la sesión.</p><label><input type="checkbox" id="analytics-choice"> Permitir analítica de uso (Google Analytics)</label><p>Publicidad desactivada.</p><button id="save-preferences">Guardar preferencias</button>';document.body.append(dialog);dialog.querySelector('#save-preferences').onclick=()=>save(dialog.querySelector('input').checked);}dialog.querySelector('input').checked=allowed();dialog.showModal();}
 window.glowroPreferences=preferences;
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-cookie-preferences]').forEach(b=>b.onclick=preferences);
  if(consent?.version!==version){const banner=document.createElement('section');banner.id='consent-banner';banner.setAttribute('aria-label','Preferencias de cookies');banner.innerHTML='<h2>Tu privacidad, tu elección</h2><p>Usamos almacenamiento esencial para tu compra. Con tu permiso, medimos el uso de la tienda. <a href="cookies.html">Política de cookies</a></p><div><button data-accept>Aceptar todas</button><button data-reject>Rechazar opcionales</button><button data-config>Configurar preferencias</button></div>';document.body.append(banner);banner.querySelector('[data-accept]').onclick=()=>save(true);banner.querySelector('[data-reject]').onclick=()=>save(false);banner.querySelector('[data-config]').onclick=preferences;}
  start();
 });
})();
