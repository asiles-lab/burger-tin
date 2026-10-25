const config = window.BURGER_TIN_CHECKOUT || {};
const api = String(config.apiBaseUrl || '').replace(/\/$/, '');
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(value);
let token = sessionStorage.getItem('burger-tin-staff-token') || '';
let currentView = 'pending';
let currentSettingsTab = 'store';
const pendingImages = new Map();

async function call(path, options={}) {
  if (!config.enabled || !api.startsWith('https://')) throw new Error('El servidor todavía no está configurado.');
  const response = await fetch(`${api}${path}`, { ...options, headers:{...options.headers,authorization:`Bearer ${token}`} });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
  return result;
}

function applyTheme(settings) {
  if (!settings) return;
  document.documentElement.style.setProperty('--admin-primary', settings.adminPrimary || '#35173f');
  document.documentElement.style.setProperty('--admin-accent', settings.adminAccent || '#f52e25');
}

function statusLabel(order) {
  if (order.status === 'pending_cash') return 'Efectivo · pendiente';
  if (order.status === 'pending_payment') return 'Mercado Pago · esperando pago';
  if (order.status === 'confirmed' && order.print_status === 'printed') return 'Confirmado · impreso';
  if (order.status === 'confirmed') return 'Confirmado · por imprimir';
  return 'Cancelado';
}

function orderActions(order) {
  const actions=[];
  if(order.status==='pending_cash')actions.push(`<button data-action="confirm" data-code="${escapeHtml(order.code)}">Confirmar e imprimir</button>`);
  if(order.status==='confirmed')actions.push(`<button class="secondary" data-action="reprint" data-code="${escapeHtml(order.code)}">Reimprimir</button>`);
  if(['pending_cash','pending_payment'].includes(order.status))actions.push(`<button class="danger" data-action="cancel" data-code="${escapeHtml(order.code)}">Cancelar</button>`);
  return actions.join('');
}

function renderOrders(orders) {
  const empty=currentView==='pending'?'No hay pedidos pendientes.':currentView==='today'?'Todavía no hay pedidos terminados hoy.':'No hay pedidos en el historial.';
  const card=order=>`<article class="order"><span class="tag">${escapeHtml(statusLabel(order))}</span><h2>${escapeHtml(order.code)}</h2><p><strong>${escapeHtml(order.customer_name)}</strong> · ${order.fulfillment==='delivery'?'Envío':'Retiro'}</p><p>${escapeHtml(order.address||'')}</p><p class="total">${money(order.subtotal)}</p><p>${new Date(order.confirmed_at||order.created_at).toLocaleString('es-AR')}</p><footer>${orderActions(order)}</footer></article>`;
  if(!orders.length){$('#orders').className='orders';$('#orders').innerHTML=`<p class="empty">${empty}</p>`;return;}
  if(currentView!=='history'){$('#orders').className='orders';$('#orders').innerHTML=orders.map(card).join('');return;}
  const groups=orders.reduce((map,order)=>{const date=new Date(order.confirmed_at||order.created_at).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});if(!map.has(date))map.set(date,[]);map.get(date).push(order);return map;},new Map());
  $('#orders').className='history-list';
  $('#orders').innerHTML=[...groups].map(([date,items])=>`<section class="history-day"><h2>${escapeHtml(date)}</h2><div class="orders">${items.map(card).join('')}</div></section>`).join('');
}

function updateCounts(counts={}) {
  $('#count-pending').textContent=Number(counts.pending||0);$('#count-today').textContent=Number(counts.today||0);$('#count-history').textContent=Number(counts.history||0);
}

async function loadOrders() {
  try{const result=await call(`/api/admin/orders?view=${currentView}`);renderOrders(result.orders);updateCounts(result.counts);$('#connection').textContent='Actualizado · '+new Date().toLocaleTimeString('es-AR');}
  catch(error){$('#connection').textContent=error.message;if(/autorizado/.test(error.message))logout('La sesión venció o el token es incorrecto. Volvé a ingresar con el token del local.');}
}

async function optimizeImage(file) {
  const bitmap=await createImageBitmap(file);const maxSide=800;const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
  if(!blob)throw new Error('No pudimos preparar la imagen.');if(blob.size>900000)throw new Error('La foto sigue siendo demasiado pesada.');return blob;
}

async function uploadImage(id,file) {
  const blob=await optimizeImage(file);
  return call(`/api/admin/products/${encodeURIComponent(id)}/image`,{method:'POST',headers:{'content-type':blob.type},body:blob});
}

function renderProducts(products) {
  for(const pending of pendingImages.values())if(pending.url)URL.revokeObjectURL(pending.url);pendingImages.clear();
  $('#catalog-editor').innerHTML=products.map(product=>`<form class="product-row" data-product-id="${escapeHtml(product.id)}" role="row">
    <label class="product-cell"><img src="${escapeHtml(product.image||'assets/logo-burger-tun.png')}" alt="${escapeHtml(product.name)}"><input type="text" name="name" value="${escapeHtml(product.name)}" required minlength="2" maxlength="100" aria-label="Nombre del producto"></label>
    <label><input type="number" name="price" value="${Number(product.price)}" min="1" max="10000000" required aria-label="Precio de ${escapeHtml(product.name)}"></label>
    <div class="row-photo"><label>Cambiar foto<input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
    <div class="row-actions"><button type="submit">Guardar</button><button type="button" class="danger" data-delete-product>Quitar</button></div>
    <p class="save-note" role="status"></p>
  </form>`).join('');
}

async function loadProducts() {
  $('#catalog-status').textContent='Cargando productos…';
  try{const result=await call('/api/admin/catalog');renderProducts(result.products||[]);$('#catalog-status').textContent=`${result.products?.length||0} productos activos.`;}
  catch(error){$('#catalog-status').textContent=error.message;}
}

function fillStoreForm(settings) {
  const form=$('#store-form');
  form.elements.business.value=settings.business||'';form.elements.phone.value=settings.phone||'';form.elements.pickupAddress.value=settings.pickupAddress||'';form.elements.deliveryZones.value=settings.deliveryZones||'';form.elements.adminPrimary.value=settings.adminPrimary||'#35173f';form.elements.adminAccent.value=settings.adminAccent||'#f52e25';form.elements.applyColorsToStore.checked=Boolean(settings.applyColorsToStore);form.elements.mpAccessToken.value='';form.elements.mpWebhookSecret.value='';form.elements.disconnectMercadoPago.checked=false;
  $('#mp-status').textContent=settings.mercadoPagoEnabled?'Conectado':'No configurado';$('#mp-status').classList.toggle('connected',Boolean(settings.mercadoPagoEnabled));applyTheme(settings);
}

async function loadStoreSettings() {
  $('#store-save-status').textContent='Cargando…';
  try{const result=await call('/api/admin/settings');fillStoreForm(result.settings);$('#store-save-status').textContent='';}
  catch(error){$('#store-save-status').textContent=error.message;}
}

function setSettingsTab(tab) {
  currentSettingsTab=tab;document.querySelectorAll('[data-settings-tab]').forEach(button=>button.classList.toggle('active',button.dataset.settingsTab===tab));$('#store-settings').hidden=tab!=='store';$('#products-settings').hidden=tab!=='products';if(tab==='store')loadStoreSettings();else loadProducts();
}

function showOrders() {
  $('#login').hidden=true;$('#settings-area').hidden=true;$('#orders-area').hidden=false;$('#refresh').hidden=false;$('#logout').hidden=false;$('#open-settings').hidden=false;loadOrders();
}

function showSettings() {
  $('#orders-area').hidden=true;$('#settings-area').hidden=false;setSettingsTab('store');
}

function logout(message='') {
  token='';sessionStorage.removeItem('burger-tin-staff-token');$('#orders-area').hidden=true;$('#settings-area').hidden=true;$('#login').hidden=false;$('#refresh').hidden=true;$('#logout').hidden=true;$('#open-settings').hidden=true;$('#login-error').textContent=message;
}

$('#refresh').hidden=true;
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');token=String(new FormData(event.currentTarget).get('token')||'').trim();button.disabled=true;button.textContent='Verificando…';$('#login-error').textContent='';try{const result=await call('/api/admin/orders');sessionStorage.setItem('burger-tin-staff-token',token);showOrders();renderOrders(result.orders);updateCounts(result.counts);const settings=await call('/api/admin/settings');applyTheme(settings.settings);}catch(error){token='';sessionStorage.removeItem('burger-tin-staff-token');$('#login-error').textContent=error.message==='No autorizado.'?'Token incorrecto. Usá el token del local.':error.message;}finally{button.disabled=false;button.textContent='Ingresar';}});
$('#logout').addEventListener('click',()=>logout());
$('#open-settings').addEventListener('click',showSettings);
$('#back-to-orders').addEventListener('click',showOrders);
$('#refresh').addEventListener('click',()=>$('#settings-area').hidden?loadOrders():(currentSettingsTab==='store'?loadStoreSettings():loadProducts()));
document.querySelector('.views').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;currentView=button.dataset.view;document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item===button));$('#history-tools').hidden=currentView!=='history';loadOrders();});
document.querySelector('.settings-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-settings-tab]');if(button)setSettingsTab(button.dataset.settingsTab);});

$('#store-form').addEventListener('input',event=>{if(['adminPrimary','adminAccent'].includes(event.target.name))applyTheme({adminPrimary:event.currentTarget.elements.adminPrimary.value,adminAccent:event.currentTarget.elements.adminAccent.value});});
$('#store-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('[type="submit"]');const data=new FormData(form);button.disabled=true;button.textContent='Guardando…';$('#store-save-status').textContent='';try{const result=await call('/api/admin/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({business:data.get('business'),phone:data.get('phone'),pickupAddress:data.get('pickupAddress'),deliveryZones:data.get('deliveryZones'),adminPrimary:data.get('adminPrimary'),adminAccent:data.get('adminAccent'),applyColorsToStore:data.has('applyColorsToStore'),mpAccessToken:data.get('mpAccessToken'),mpWebhookSecret:data.get('mpWebhookSecret'),disconnectMercadoPago:data.has('disconnectMercadoPago')})});fillStoreForm(result.settings);$('#store-save-status').textContent='✓ Configuración publicada';}catch(error){$('#store-save-status').textContent=error.message;$('#store-save-status').style.color='#a51616';}finally{button.disabled=false;button.textContent='Guardar configuración';}});

$('#show-add-product').addEventListener('click',()=>{$('#add-product-form').hidden=false;$('#add-product-form').elements.name.focus();});
$('#cancel-add-product').addEventListener('click',()=>{$('#add-product-form').reset();$('#add-product-form').hidden=true;});
$('#add-product-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('[type="submit"]');const note=form.querySelector('.save-note');const data=new FormData(form);button.disabled=true;button.textContent='Creando…';note.textContent='';try{const result=await call('/api/admin/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:data.get('name'),price:Number(data.get('price'))})});const file=form.elements.image.files?.[0];if(file)await uploadImage(result.id,file);form.reset();form.hidden=true;await loadProducts();}catch(error){note.textContent=error.message;}finally{button.disabled=false;button.textContent='Crear producto';}});

$('#catalog-editor').addEventListener('change',event=>{if(event.target.name!=='image'||!event.target.files?.[0])return;const row=event.target.closest('.product-row');const previous=pendingImages.get(row.dataset.productId);if(previous?.url)URL.revokeObjectURL(previous.url);const file=event.target.files[0];const url=URL.createObjectURL(file);pendingImages.set(row.dataset.productId,{file,url});row.querySelector('img').src=url;});
$('#catalog-editor').addEventListener('submit',async event=>{event.preventDefault();const row=event.target.closest('.product-row');const id=row.dataset.productId;const button=row.querySelector('[type="submit"]');const note=row.querySelector('.save-note');const data=new FormData(row);button.disabled=true;button.textContent='Guardando…';note.textContent='';try{await call(`/api/admin/products/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:data.get('name'),price:Number(data.get('price'))})});const pending=pendingImages.get(id);if(pending){const result=await uploadImage(id,pending.file);row.querySelector('img').src=result.image;URL.revokeObjectURL(pending.url);pendingImages.delete(id);row.elements.image.value='';}note.textContent='✓ Publicado';}catch(error){note.textContent=error.message;}finally{button.disabled=false;button.textContent='Guardar';}});
$('#catalog-editor').addEventListener('click',async event=>{const button=event.target.closest('[data-delete-product]');if(!button)return;const row=button.closest('.product-row');const name=row.elements.name.value;if(!window.confirm(`¿Quitar “${name}” del menú? Los pedidos anteriores conservarán su información.`))return;button.disabled=true;try{await call(`/api/admin/products/${encodeURIComponent(row.dataset.productId)}`,{method:'DELETE'});row.remove();$('#catalog-status').textContent='Producto quitado del menú.';}catch(error){row.querySelector('.save-note').textContent=error.message;button.disabled=false;}});

$('#clear-history').addEventListener('click',async()=>{if(!window.confirm('¿Borrar todos los pedidos terminados y cancelados, y reiniciar la numeración en A-001? Esta acción no se puede deshacer.'))return;const button=$('#clear-history');button.disabled=true;try{await call('/api/admin/history',{method:'DELETE'});alert('Historial borrado. El próximo pedido será A-001.');await loadOrders();}catch(error){alert(error.message);}finally{button.disabled=false;}});
$('#orders').addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;if(button.dataset.action==='cancel'&&!window.confirm(`¿Cancelar el pedido ${button.dataset.code}? No se imprimirá ninguna comanda.`))return;button.disabled=true;try{await call(`/api/admin/orders/${encodeURIComponent(button.dataset.code)}/${button.dataset.action}`,{method:'POST'});await loadOrders();}catch(error){alert(error.message);}finally{button.disabled=false;}});

if(token)showOrders();
setInterval(()=>{if(token&&!$('#orders-area').hidden)loadOrders();},15000);
