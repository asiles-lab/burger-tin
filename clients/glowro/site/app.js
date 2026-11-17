'use strict';

// GlowRo — catálogo público con respaldo estático; el servidor valida importes y pagos.
const RUNTIME = window.RESTIA_CLIENT_CONFIG || window.BURGER_TIN_CHECKOUT || {};
const API = String(RUNTIME.apiBaseUrl || '').replace(/\/$/, '');
const STORE_ID = String(RUNTIME.storeId || 'glowro');
const CONTACT = {
  instagram: 'https://www.instagram.com/glowro.ok/',
  dm: 'https://www.instagram.com/glowro.ok/'
};
const ITEMS = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const $ = id => document.getElementById(id);
const storageKey = 'glowro-cart-v1';
const cart = new Map();
let checkoutReady = false;
let deliveryFee = null;
let selectedShipping = null;
let shippingConfigured = false;
let availableShippingMethods = [];
let catalogLoaded = false;
let liveCatalogVerified = false;
let activeFilter = 'all';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) for (const [id, quantity] of saved) if (typeof id === 'string' && Number.isInteger(quantity) && quantity > 0 && quantity <= 30) cart.set(id, quantity);
} catch (_) { /* private/incognito browsers */ }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify([...cart])); } catch (_) {} }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setCheckoutStatus(message, kind='action') { const status=$('checkout-status');status.textContent=message;if(message)status.dataset.kind=kind;else delete status.dataset.kind; }
function resetShippingQuote(message='Ingresá tu localidad o código postal para ver las opciones disponibles.') { selectedShipping=null;availableShippingMethods=[];deliveryFee=null;$('shipping-methods').innerHTML=`<p>${escapeHTML(message)}</p>`;$('address-field').hidden=true;$('address-field').querySelector('input').required=false; }
function applyShippingMethod(method) { track('add_shipping_info',analyticsCart()); selectedShipping=method;deliveryFee=typeof method.fee==='number'?method.fee:null;const needsAddress=method.id!=='pickup';$('address-field').hidden=!needsAddress;$('address-field').querySelector('input').required=needsAddress;if(method.id==='coordinate')$('shipping-note').textContent='Costo de envío a coordinar · no incluido en el pago';else if(method.fee===0)$('shipping-note').textContent=method.id==='pickup'?'Retiro sin cargo':'Envío sin cargo';else $('shipping-note').textContent=`Envío: ${pesos(method.fee)}`;renderSelection();}
function renderShippingMethods(methods,outsideCoverage=false){if(!methods.length){resetShippingQuote(outsideCoverage?'Tu ubicación está fuera de las zonas configuradas. Contactá a GlowRo para consultar alternativas.':'No hay métodos de entrega disponibles.');return;}availableShippingMethods=methods;$('shipping-methods').innerHTML=methods.map(method=>`<label class="shipping-option"><input type="radio" name="shippingMethod" value="${escapeHTML(method.id)}"><span><strong>${escapeHTML(method.label)}</strong><small>${method.fee===null?'Costo a confirmar':method.fee===0?'Sin cargo':pesos(method.fee)}${method.zoneName?` · ${escapeHTML(method.zoneName)}`:''}</small>${method.address?`<em>${escapeHTML(method.address)}</em>`:''}${method.description?`<em>${escapeHTML(method.description)}</em>`:''}</span></label>`).join('');if(methods.length===1){const input=$('shipping-methods').querySelector('input');input.checked=true;applyShippingMethod(methods[0]);}}
async function quoteShipping(){if(!checkoutReady||!cart.size)return;const button=$('quote-shipping'),form=$('checkout-form'),data=new FormData(form);button.disabled=true;button.textContent='Calculando…';setCheckoutStatus('');try{const response=await fetch(`${API}/api/shipping/quote`,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'restia-web'},body:JSON.stringify({locality:data.get('locality'),postalCode:data.get('postalCode'),items:[...cart].map(([id,quantity])=>({id,quantity}))})}),result=await response.json();if(!response.ok)throw new Error(result.error||'No pudimos calcular el envío.');selectedShipping=null;deliveryFee=null;renderShippingMethods(result.methods||[],result.outsideCoverage);renderSelection();}catch(error){resetShippingQuote(error.message);setCheckoutStatus(error.message);renderSelection();}finally{button.disabled=false;button.textContent='Ver opciones para mi ubicación';}}
function renderSelection() {
  const entries = [...cart].filter(([id]) => ITEMS[id]);
  const n = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  $('selection-count').textContent = n;
  $('mobile-selection-count').textContent = n;
  $('drawer-title-count').textContent = `(${n})`;
  document.querySelectorAll('[data-add]').forEach(btn => {
    const active = cart.has(btn.dataset.add);
    btn.classList.toggle('is-selected', active);
    btn.setAttribute('aria-pressed', String(active));
    if (btn.classList.contains('add-btn')) {
      btn.setAttribute('aria-label', `Agregar ${displayName(ITEMS[btn.dataset.add])} al carrito`);
    }
  });
  const target = $('drawer-items');
  if (n === 0) {
    target.innerHTML = '<div class="drawer-empty"><svg class="icon"><use href="#i-bag"/></svg><h3>Tu carrito está vacío.</h3><p>Elegí productos para preparar tu pedido.</p></div>';
  } else {
    target.innerHTML = entries.map(([id, quantity]) => `<div class="drawer-item"><img src="${escapeHTML(ITEMS[id].image || 'assets/serums.svg')}" alt="" width="70" height="75" loading="lazy"><div><h3>${escapeHTML(displayName(ITEMS[id]))}</h3><p>${quantity} × ${pesos(ITEMS[id].price)} = ${pesos(quantity * ITEMS[id].price)}</p><div class="quantity-controls"><button type="button" data-remove="${id}" aria-label="Quitar una unidad de ${escapeHTML(displayName(ITEMS[id]))}">−</button><strong>${quantity}</strong><button type="button" data-add="${id}" aria-label="Agregar una unidad de ${escapeHTML(displayName(ITEMS[id]))}">+</button></div></div></div>`).join('');
  }
  const productsTotal = entries.reduce((sum, [id, quantity]) => sum + ITEMS[id].price * quantity, 0);
  $('cart-total').textContent = pesos(productsTotal + (typeof deliveryFee==='number' ? deliveryFee : 0));
  if(!selectedShipping)$('shipping-note').textContent='Elegí un método de entrega';
  $('drawer-copy').disabled = !n || !checkoutReady || !selectedShipping;
  const status=$('checkout-status');
  if(catalogLoaded&&!checkoutReady)setCheckoutStatus(shippingConfigured?'El pago online no está disponible en este momento.':'No hay métodos de entrega disponibles en este momento.','availability');
  else if(checkoutReady&&status.dataset.kind==='availability')setCheckoutStatus('');
}
const track=(event,data={})=>window.glowroAnalytics?.event(event,data);
const analyticsItem=(id,quantity=1)=>({item_id:id,item_name:ITEMS[id]?.name,price:Number(ITEMS[id]?.price),quantity});
const analyticsCart=()=>({items:[...cart].filter(([id])=>ITEMS[id]).map(([id,q])=>analyticsItem(id,q))});
function addToCart(id) {
  if (!ITEMS[id]) return;
  if((cart.get(id)||0)>=30)return;
  cart.set(id, Math.min(30, (cart.get(id) || 0) + 1));
  track('add_to_cart',{items:[analyticsItem(id)]});
  persist(); resetShippingQuote(); renderSelection();
  toast('Agregado al carrito');
  openDrawer();
}
document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-add]');
  if (trigger) { trigger.closest('.product-dialog')?.close(); addToCart(trigger.dataset.add); }
  const remove = e.target.closest('[data-remove]');
  if (remove) { track('remove_from_cart',{items:[analyticsItem(remove.dataset.remove)]}); const q = cart.get(remove.dataset.remove) || 0; if (q <= 1) cart.delete(remove.dataset.remove); else cart.set(remove.dataset.remove, q - 1); persist(); resetShippingQuote(); renderSelection(); }
});

const drawer = $('drawer-layer');
let previouslyFocused = null;
function openDrawer() { track('view_cart',analyticsCart()); previouslyFocused = document.activeElement; drawer.hidden = false; document.body.classList.add('drawer-open'); $('close-drawer').focus(); }
function closeDrawer() { drawer.hidden = true; document.body.classList.remove('drawer-open'); previouslyFocused?.focus(); }
$('open-drawer').addEventListener('click', openDrawer);
$('mobile-selection').addEventListener('click', openDrawer);
$('close-drawer').addEventListener('click', closeDrawer);
$('drawer-backdrop').addEventListener('click', closeDrawer);
$('quote-shipping').addEventListener('click', quoteShipping);
$('shipping-methods').addEventListener('change',event=>{const input=event.target.closest('input[name="shippingMethod"]');if(!input)return;const method=availableShippingMethods.find(item=>item.id===input.value);if(method)applyShippingMethod(method);});
$('checkout-form').addEventListener('input',event=>{if(!['locality','postalCode'].includes(event.target.name)||!selectedShipping)return;resetShippingQuote('La ubicación cambió. Volvé a calcular las opciones.');renderSelection();});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!drawer.hidden) closeDrawer(); else closeMenu(); }
  if (e.key === 'Tab' && !drawer.hidden) {
    const tabbables = [...drawer.querySelectorAll('button:not([disabled]),a[href],input,textarea,select')];
    if (!tabbables.length) return;
    if (e.shiftKey && document.activeElement === tabbables[0]) { e.preventDefault(); tabbables.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === tabbables.at(-1)) { e.preventDefault(); tabbables[0].focus(); }
  }
});
let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } }
  catch (_) {}
  const area = document.createElement('textarea');
  area.value = text; area.style.cssText = 'position:fixed;left:-10000px;opacity:0';
  document.body.appendChild(area); area.focus(); area.select();
  let result = false;
  try { result = document.execCommand('copy'); } catch (_) { }
  area.remove(); return result;
}
$('checkout-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!checkoutReady || !cart.size || !selectedShipping) return;
  const button = $('drawer-copy');
  button.disabled = true;
  setCheckoutStatus('Preparando el pago seguro…');
  const data = new FormData(event.currentTarget);
  try {
    track('add_payment_info',analyticsCart());
    const response = await fetch(`${API}/api/orders`, {method:'POST', headers:{'content-type':'application/json','x-requested-with':'restia-web'}, body:JSON.stringify({name:data.get('name'),email:data.get('email'),phone:data.get('phone'),address:data.get('address'),locality:data.get('locality'),postalCode:data.get('postalCode'),notes:data.get('notes'),shippingMethod:selectedShipping.id,fulfillment:selectedShipping.id==='pickup'?'pickup':'delivery',paymentMethod:'mercadopago',items:[...cart].map(([id,quantity]) => ({id,quantity}))})});
    const result = await response.json();
    if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'No pudimos preparar el pago.');
    location.assign(result.checkoutUrl);
  } catch (error) {
    setCheckoutStatus(error.message);
    button.disabled = false;
  }
});

$('filters').addEventListener('click', e => {
  const button = e.target.closest('[data-filter]'); if (!button) return;
  $('filters').querySelectorAll('[data-filter]').forEach(btn => {
    const active = btn === button; btn.classList.toggle('is-active', active); btn.setAttribute('aria-pressed', String(active));
  });
  activeFilter = button.dataset.filter;
  renderProducts();
  $('filters').scrollIntoView({block:'start',behavior:'instant'});
});

const quizQuestions = [
  { label: 'PREGUNTA 01', title: '¿Cómo sentís tu piel normalmente?', help: 'No necesitás saber tu tipo exacto. Elegí lo que más se acerque a tu experiencia.', options: [{id:'seca', label:'Seca o tirante'}, {id:'mixta',label:'Mixta'}, {id:'grasa',label:'Grasa o con brillo'}, {id:'sensible',label:'Sensible / reactiva'}] },
  { label: 'PREGUNTA 02', title: '¿Qué te gustaría priorizar?', help: 'Tu objetivo principal nos ayuda a orientar la conversación.', options: [{id:'hidratar',label:'Más hidratación'}, {id:'equilibrar',label:'Sentirla equilibrada'}, {id:'luminosidad',label:'Más luminosidad'}, {id:'simple',label:'Crear el hábito'}] },
  { label: 'PREGUNTA 03', title: '¿Cómo te gusta cuidarte?', help: 'No hay una respuesta correcta. Tu rutina tiene que adaptarse a vos.', options: [{id:'express',label:'Rápido y simple'}, {id:'completo',label:'Me gusta dedicarle tiempo'}] }
];
let quizStep = 0;
const quizAnswers = {};
function answerIcon() { return '<span class="quiz-option-check"><svg class="icon"><use href="#i-check"/></svg></span>'; }
function renderQuiz() {
  const q = quizQuestions[quizStep];
  $('quiz-counter').textContent = `0${quizStep + 1} / 03`;
  $('quiz-progress-bar').style.width = `${(quizStep + 1) / 3 * 100}%`;
  $('quiz-screen').innerHTML = `<span class="quiz-question-label">${q.label}</span><h3 class="quiz-screen-title">${q.title}</h3><p class="quiz-screen-help">${q.help}</p><div class="quiz-options" role="group" aria-label="${q.title}">${q.options.map(o => `<button class="quiz-option ${quizAnswers[quizStep] === o.id ? 'is-selected' : ''}" type="button" data-answer="${o.id}" aria-pressed="${quizAnswers[quizStep] === o.id}"><span>${o.label}</span>${answerIcon()}</button>`).join('')}</div>`;
  $('quiz-back').disabled = quizStep === 0;
  $('quiz-next').disabled = !quizAnswers[quizStep];
  $('quiz-next').innerHTML = `${quizStep === 2 ? 'Ver mi guía' : 'Continuar'} <svg class="icon"><use href="#i-arrow"/></svg>`;
  $('quiz-nav').hidden = false;
}
$('quiz-screen').addEventListener('click', e => {
  const answer = e.target.closest('[data-answer]');
  if (answer) { quizAnswers[quizStep] = answer.dataset.answer; renderQuiz(); }
  const reset = e.target.closest('#quiz-reset');
  if (reset) { quizStep = 0; Object.keys(quizAnswers).forEach(k => delete quizAnswers[k]); renderQuiz(); }
  const copy = e.target.closest('#quiz-copy');
  if (copy) copyQuiz();
});
$('quiz-back').addEventListener('click', () => { if (quizStep > 0) { quizStep--; renderQuiz(); } });
$('quiz-next').addEventListener('click', () => {
  if (!quizAnswers[quizStep]) return;
  if (quizStep < quizQuestions.length - 1) { quizStep++; renderQuiz(); }
  else renderQuizResult();
});
function getQuizResult() {
  const skin = quizAnswers[0], priority = quizAnswers[1], time = quizAnswers[2];
  const needsSensitive = skin === 'sensible';
  let title = 'Tu ritual esencial';
  if (priority === 'hidratar' || skin === 'seca') title = 'Tu ritual de hidratación';
  if (priority === 'equilibrar' || skin === 'grasa' || skin === 'mixta') title = 'Tu ritual equilibrado';
  if (priority === 'luminosidad') title = 'Tu ritual de luminosidad';
  if (needsSensitive) title = 'Tu ritual suave';
  const steps = ['Limpieza facial suave', 'Hidratante adecuada a tu piel', 'Protección solar diaria'];
  if (time === 'completo' && !needsSensitive) steps.splice(1, 0, 'Considerar un sérum según tus objetivos');
  return { title, steps, skin, priority, time };
}
function recommendedProducts(result) {
  if (!liveCatalogVerified || result.skin === 'sensible' || result.priority === 'equilibrar') return [];
  const ids = result.priority === 'luminosidad' ? ['product-1e260bae'] : result.priority === 'hidratar' || result.skin === 'seca' ? ['MLA3540591174','product-1e260bae'] : ['product-1e260bae'];
  return ids.map(id => ITEMS[id]).filter(Boolean).slice(0,3);
}
function quizMessage() {
  const r = getQuizResult();
  const a = Object.fromEntries(quizQuestions.map((q,i) => [i,q.options.find(o=>o.id===quizAnswers[i])?.label || '—']));
  return `¡Hola, GlowRo! Hice la guía de rutina de la web. ✨\nMi piel: ${a[0]}\nMi prioridad: ${a[1]}\nMi estilo: ${a[2]}\nLa guía me sugirió: ${r.steps.join(', ')}.\n¿Me ayudan a conocer qué productos tienen disponibles y sus precios?`;
}
async function copyQuiz() {
  if (await copyText(quizMessage())) toast('Guía copiada. Pegala en el chat de Instagram.');
  else toast('No se pudo copiar automáticamente.');
}
function renderQuizResult() {
  const r = getQuizResult();
  const picks = recommendedProducts(r);
  const recommendation = picks.length
    ? `<div class="quiz-recommendations"><h4>Productos para explorar</h4><p>Opciones del catálogo activo según los datos publicados. Revisá cada ficha antes de elegir.</p><div class="quiz-recommendation-list">${picks.map(p => `<article class="quiz-recommendation"><img src="${escapeHTML(p.image || 'assets/serums.svg')}" alt="" width="88" height="88" loading="lazy"><div><a href="${productPath(p)}" data-product-detail="${escapeHTML(p.id)}">${escapeHTML(displayName(p))}</a><small>${escapeHTML(displayBenefit(p))}</small><strong>${pesos(p.price)}</strong></div><button type="button" data-add="${escapeHTML(p.id)}" aria-label="Agregar ${escapeHTML(displayName(p))} al carrito"><svg class="icon"><use href="#i-plus"/></svg></button></article>`).join('')}</div></div>`
    : `<p class="quiz-recommendation-note">${liveCatalogVerified ? 'Con estas respuestas, preferimos que consultes antes de elegir un producto específico.' : 'No pudimos verificar el catálogo activo para recomendar productos ahora.'}</p>`;
  $('quiz-counter').textContent = 'TU RESULTADO';
  $('quiz-progress-bar').style.width = '100%';
  $('quiz-nav').hidden = true;
  const guide = r.skin === 'sensible' ? 'hidratacion-esencial' : r.priority === 'luminosidad' ? 'glow-diario' : r.priority === 'equilibrar' || r.skin === 'grasa' || r.skin === 'mixta' ? 'limpieza-equilibrada' : 'hidratacion-esencial';
  $('quiz-screen').innerHTML = `<span class="quiz-result-eyebrow">✳ TU PUNTO DE PARTIDA</span><h3 class="quiz-result-title">${r.title}</h3><p class="quiz-result-copy">Una orientación general para empezar a conversar con GlowRo; no reemplaza el asesoramiento profesional.</p><ul class="quiz-result-steps">${r.steps.map((s,i) => `<li><span>${i+1}</span>${s}</li>`).join('')}</ul>${recommendation}<div class="quiz-result-actions"><button class="btn btn-dark" type="button" id="quiz-copy"><svg class="icon"><use href="#i-copy"/></svg> Copiar mi guía</button><a class="btn btn-outline" href="/rutinas/${guide}/">Explorar una guía relacionada ↗</a><a class="btn btn-outline" href="${CONTACT.dm}" target="_blank" rel="noopener noreferrer">Consultar por Instagram <svg class="icon"><use href="#i-arrow-up"/></svg></a></div><button type="button" class="quiz-reset" id="quiz-reset">Volver a empezar ↺</button>`;
}


const pesos = value => new Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:2}).format(value);
const labels = {kits:'KITS Y COMBOS',facial:'CUIDADO FACIAL',corporal:'CUIDADO CORPORAL'};
// Presentación editorial de datos ya publicados; no cambia los registros ni los importes.
const productView = {
  MLA3273725744:{benefit:'Hidratación y luminosidad'},
  MLA3268197470:{benefit:'Rutina de día y noche'},
  MLA1871516611:{benefit:'Humectación facial'},
  MLA3590377816:{name:'Combo retinol · Sérum + crema de noche',benefit:'Cuidado nocturno'},
  MLA2057761893:{benefit:'Limpieza facial profunda'},
  MLA3922754008:{benefit:'Hidratación y luminosidad'},
  MLA1816654927:{benefit:'Hidratación y suavidad'},
  MLA3540591174:{benefit:'Hidratación facial'},
  MLA1919960989:{benefit:'Hidratación y luminosidad'},
  MLA1852505259:{benefit:'Cuidado facial nocturno'},
  MLA3747021162:{name:'Crema de ordeñe Plus · 500 g',benefit:'Hidratación corporal'},
  MLA1814239591:{benefit:'Cuidado corporal con camomila'},
  'product-24714b19':{name:'Sérum con ácido hialurónico y vitamina C · 30 ml',category:'facial',benefit:'Hidratación y luminosidad'},
  'product-9d2216d3':{name:'Crema base corporal para masajes · 500 g',category:'corporal',benefit:'Base para masajes'},
  'product-1e260bae':{name:'Crema facial ligera BE ultrahumectante · 50 g',category:'facial',benefit:'Humectación facial'},
  'product-a3c58b14':{name:'Crema de noche con retinol + vitamina C · 50 g',category:'facial',benefit:'Cuidado facial nocturno'},
  'product-ea670d4a':{name:'Gel de limpieza con humectación limón · 250 ml',category:'facial',benefit:'Limpieza facial'},
  'product-ffc1afa4':{name:'Crema reafirmante antiestrías · 500 g',category:'corporal',benefit:'Elasticidad y suavidad'},
  'product-f7588e1a':{name:'Crema nutritiva para pies y piernas · 250 g',category:'corporal',benefit:'Hidratación para pies y piernas'},
  'product-199336e8':{name:'Mascarilla de fango facial · 750 g',category:'facial',benefit:'Limpieza profunda'},
  'product-3973fd34':{name:'Gel criógeno modelador superfrío · 250 g',category:'corporal',benefit:'Efecto frío corporal'},
  'product-afed3a89':{name:'Crema base profesional · 250 g',category:'corporal',benefit:'Base para preparaciones profesionales'}
};
const featuredIds = ['MLA3273725744','MLA3540591174','MLA1919960989','product-1e260bae','MLA3747021162','product-f7588e1a'];
const displayName = product => productView[product.id]?.name || product.name;
const displayCategory = product => productView[product.id]?.category || product.category;
const displayBenefit = product => productView[product.id]?.benefit || String(product.description || '').replace(/\s+/g,' ').trim().split(/[.!?]/)[0];
const productSlug = product => `${displayName(product).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${product.id.toLowerCase()}`;
const productPath = product => `?producto=${encodeURIComponent(productSlug(product))}`;
function productCard(product) {
  const id = escapeHTML(product.id), name = escapeHTML(displayName(product)), category = displayCategory(product);
  return `<article class="product-card reveal is-visible" data-category="${escapeHTML(category)}" data-id="${id}">
    <div class="product-image"><img loading="lazy" src="${escapeHTML(product.image || 'assets/serums.svg')}" alt="${name}" width="560" height="630"><button type="button" class="add-btn" data-add="${id}" aria-label="Agregar ${name} al carrito" aria-pressed="false"><svg class="icon"><use href="#i-bag"/></svg></button></div>
    <div class="product-details"><div><span class="product-overline">${escapeHTML(labels[category] || category)}</span><h3><a href="${productPath(product)}" data-product-detail="${id}">${name}</a></h3><p>${escapeHTML(displayBenefit(product))}</p><div class="catalog-price"><strong>${pesos(product.price)}</strong></div><button class="btn btn-dark ml-buy" type="button" data-add="${id}"><span class="ml-buy-long">Agregar al carrito</span><span class="ml-buy-short">Agregar</span><svg class="icon"><use href="#i-plus"/></svg></button></div></div></article>`;
}
function renderProducts() {
  const chosen = featuredIds.map(id => ITEMS[id]).filter(Boolean).slice(0,6);
  for (const product of PRODUCTS) if (chosen.length < 6 && !chosen.includes(product)) chosen.push(product);
  const featured = activeFilter === 'all' ? chosen : [];
  const selected = activeFilter === 'all' ? PRODUCTS.filter(product => !featured.includes(product)) : PRODUCTS.filter(product => activeFilter === 'ofertas' ? Boolean(product.previous) : displayCategory(product) === activeFilter);
  $('destacados').hidden = activeFilter !== 'all' || !featured.length;
  $('featured-grid').innerHTML = featured.map(productCard).join('');
  $('products-grid').innerHTML = selected.length ? selected.map(productCard).join('') : '<p>No encontramos productos en esta categoría.</p>';
  renderSelection();
}

async function loadLiveCatalog() {
  try {
    const response = await fetch(`${API}/api/catalog`, {cache:'no-store'});
    if (!response.ok) throw new Error('Catálogo no disponible');
    const data = await response.json();
    if (data.id !== STORE_ID || !Array.isArray(data.products) || data.business !== 'GlowRo') throw new Error('Bloqueamos un catálogo que no pertenece a GlowRo.');
    const originals = new Map(PRODUCTS.map(product => [product.id, product]));
    PRODUCTS.splice(0, PRODUCTS.length, ...data.products.map(product => ({...originals.get(product.id), ...product, previous:originals.get(product.id)?.previous || null})));
    for (const id of Object.keys(ITEMS)) delete ITEMS[id];
    Object.assign(ITEMS, Object.fromEntries(PRODUCTS.map(product => [product.id, product])));
    for (const id of cart.keys()) if (!ITEMS[id]) cart.delete(id);
    persist();
    catalogLoaded = true;
    liveCatalogVerified = true;
    shippingConfigured = Boolean(data.shipping && [data.shipping.pickup?.enabled,data.shipping.delivery?.enabled,data.shipping.coordinate?.enabled].some(Boolean));
    checkoutReady = Boolean(data.mercadoPagoEnabled && data.paymentMode === 'production' && shippingConfigured);
    resetShippingQuote();
    renderProducts();
    if ($('quiz-screen').querySelector('.quiz-result-title')) renderQuizResult();
    syncProductFromUrl();
    if (new URL(location.href).searchParams.get('carrito') === '1') { history.replaceState(history.state, '', '/'); openDrawer(); }
  } catch (error) {
    catalogLoaded = true;
    liveCatalogVerified = false;
    checkoutReady = false;
    document.querySelector('.catalog-note').textContent = 'No pudimos actualizar los precios en este momento. El pago online está pausado hasta recuperar la conexión.';
    renderSelection();
    setCheckoutStatus('La compra online no está disponible en este momento.','availability');
    syncProductFromUrl();
  }
}

const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); } });
}, { threshold: .08, rootMargin: '0px 0px 35px 0px' }) : null;
renderProducts();
document.querySelectorAll('.reveal').forEach(el => revealObserver ? revealObserver.observe(el) : el.classList.add('is-visible'));
loadLiveCatalog();
function updateFloatingSelection() {
  $('mobile-selection').classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.9);
}
window.addEventListener('scroll', updateFloatingSelection, { passive: true });
window.addEventListener('resize', updateFloatingSelection);
updateFloatingSelection();
$('year').textContent = new Date().getFullYear();
renderSelection();
renderQuiz();
const returnParams = new URLSearchParams(location.search);
const paymentReturn = returnParams.get('payment');
if (paymentReturn) {
  let token = returnParams.get('token') || '';
  try { if (token) sessionStorage.setItem('glowro-payment-token', token); else token = sessionStorage.getItem('glowro-payment-token') || ''; } catch (_) {}
  history.replaceState(null, '', `${location.pathname}?payment=status`);
  const result = $('payment-result'), message = $('payment-result-message'), retry = $('payment-result-retry');
  result.hidden = false;
  document.body.classList.add('payment-return-active');
  result.querySelector('main').tabIndex = -1;
  result.querySelector('main').focus();
  let attempts = 0;
  async function checkPayment() {
    retry.hidden = true;
    if (!token) { message.innerHTML = '<h1>No pudimos verificar tu pago</h1><p>Consultanos para conocer el estado de tu pedido.</p>'; return; }
    try {
      const response = await fetch(`${API}/api/glowro/order-status`, {method:'POST',headers:{'content-type':'application/json','x-requested-with':'restia-web'},body:JSON.stringify({token})});
      const data = await response.json();
      if (!response.ok) throw new Error('No pudimos consultar el estado.');
      $('payment-result-order').textContent = `Pedido ${data.code}`;
      if (data.status === 'approved') { track('purchase',data.purchase); window.glowroVerifiedPurchase=data.purchase; message.innerHTML = '<h1>¡Gracias por tu compra!</h1><p>Tu pago fue confirmado. Ya estamos preparando tu pedido con mucho cariño.</p><p>Te enviaremos el detalle por email.</p>'; return; }
      if (data.status === 'rejected') { message.innerHTML = '<h1>El pago fue rechazado</h1><p>Tu compra no fue confirmada. Consultanos para volver a intentarlo.</p>'; return; }
      if (data.status === 'cancelled') { message.innerHTML = '<h1>El pedido no se completó</h1><p>Consultanos si necesitás ayuda.</p>'; return; }
      message.innerHTML = '<h1>Tu pago está pendiente</h1><p>Estamos esperando la confirmación de Mercado Pago. Te avisaremos por email cuando se acredite.</p>';
      if (++attempts < 20) setTimeout(checkPayment, 3000); else retry.hidden = false;
    } catch { message.innerHTML = '<h1>No pudimos verificar tu pago</h1><p>Tu pedido aún puede estar procesándose. Consultá nuevamente.</p>'; retry.hidden = false; }
  }
  retry.addEventListener('click', () => { attempts = 0; checkPayment(); });
  checkPayment();
}

let checkoutStarted=false;
$('checkout-form').addEventListener('focusin',()=>{if(!checkoutStarted&&cart.size){checkoutStarted=true;track('begin_checkout',analyticsCart());}});
const seenProducts=new Set();
const productObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const id=entry.target.dataset.id;if(!seenProducts.has(id)&&track('view_item_list',{items:[analyticsItem(id)]}))seenProducts.add(id);}}, {threshold:.5});
function observeProducts(){document.querySelectorAll('.product-card[data-id]').forEach(el=>{productObserver.unobserve(el);productObserver.observe(el);});}
for(const grid of [$('featured-grid'),$('products-grid')])new MutationObserver(observeProducts).observe(grid,{childList:true});observeProducts();
document.addEventListener('glowro-analytics-ready',()=>{observeProducts();if(window.glowroVerifiedPurchase)track('purchase',window.glowroVerifiedPurchase);});
const basePageMeta = {
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.content || '',
  ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
  ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
  ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
  ogType: document.querySelector('meta[property="og:type"]')?.content || 'website'
};
let productDialog = null;
function updateProductMeta(product) {
  const name = product ? displayName(product) : basePageMeta.ogTitle;
  const description = product ? String(product.description || displayBenefit(product)).replace(/\s+/g,' ').trim().slice(0,160) : basePageMeta.description;
  document.title = product ? `${name} · GlowRo` : basePageMeta.title;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = product ? `${name} · GlowRo` : basePageMeta.ogTitle;
  document.querySelector('meta[property="og:description"]').content = product ? description : basePageMeta.ogDescription;
  document.querySelector('meta[property="og:image"]').content = product ? product.image : basePageMeta.ogImage;
  document.querySelector('meta[property="og:type"]').content = product ? 'product' : basePageMeta.ogType;
  document.getElementById('product-canonical')?.remove();
  document.getElementById('product-og-url')?.remove();
  document.getElementById('product-structured-data')?.remove();
  if (!product) return;
  const canonical = document.createElement('link');
  canonical.id = 'product-canonical'; canonical.rel = 'canonical'; canonical.href = new URL(productPath(product), location.href).href;
  document.head.append(canonical);
  const ogUrl = document.createElement('meta');
  ogUrl.id = 'product-og-url'; ogUrl.setAttribute('property','og:url'); ogUrl.content = canonical.href;
  document.head.append(ogUrl);
  const structured = document.createElement('script');
  structured.id = 'product-structured-data'; structured.type = 'application/ld+json';
  const data = {'@context':'https://schema.org','@type':'Product',name,image:product.image,description:product.description || undefined,sku:product.id,url:canonical.href};
  if (liveCatalogVerified) data.offers = {'@type':'Offer',priceCurrency:'ARS',price:product.price,url:canonical.href};
  structured.textContent = JSON.stringify(data).replace(/</g,'\\u003c');
  document.head.append(structured);
}
function clearProductUrl() {
  const url = new URL(location.href);
  if (url.searchParams.has('producto')) { url.searchParams.delete('producto'); history.replaceState(history.state, '', url); }
  updateProductMeta(null);
}
function showProduct(product) {
  if (productDialog) { productDialog.dataset.silent = 'true'; productDialog.close(); productDialog.remove(); }
  const name = escapeHTML(displayName(product));
  const size = displayName(product).match(/\b\d+(?:[.,]\d+)?\s*(?:ml|gr|g)\b/i)?.[0]?.replace(/\s*gr$/i,' g');
  const hasBrand = /dr\.?\s*duval/i.test(`${product.name} ${product.description || ''}`);
  const dialog = document.createElement('dialog');
  dialog.className = 'product-dialog'; dialog.setAttribute('aria-labelledby','product-dialog-title');
  dialog.innerHTML = `<form method="dialog" class="product-dialog-close"><button type="submit" autofocus aria-label="Cerrar ficha de producto">Cerrar ×</button></form><div class="product-dialog-layout"><div class="product-dialog-media"><img src="${escapeHTML(product.image || 'assets/serums.svg')}" alt="${name}" width="560" height="630"></div><div class="product-dialog-copy"><p class="product-overline">${escapeHTML(labels[displayCategory(product)] || displayCategory(product))}${hasBrand ? ' · DR. DUVAL' : ''}</p><h2 id="product-dialog-title">${name}</h2><p class="product-dialog-benefit">${escapeHTML(displayBenefit(product))}</p>${size ? `<p class="product-presentation">Presentación: ${escapeHTML(size)}</p>` : ''}${product.description ? `<div class="product-full-description"><h3>Descripción</h3><p>${escapeHTML(product.description)}</p></div>` : ''}<div class="product-dialog-buy"><strong>${pesos(product.price)}</strong><button class="btn btn-dark" type="button" data-add="${escapeHTML(product.id)}">Agregar al carrito <svg class="icon"><use href="#i-plus"/></svg></button></div></div></div>`;
  document.body.append(dialog);
  productDialog = dialog;
  dialog.addEventListener('close', () => { if (productDialog === dialog) productDialog = null; dialog.remove(); if (dialog.dataset.silent !== 'true') clearProductUrl(); }, {once:true});
  dialog.showModal();
  updateProductMeta(product);
  track('view_item',{items:[analyticsItem(product.id)]});
}
function syncProductFromUrl() {
  const slug = new URL(location.href).searchParams.get('producto');
  const product = slug && PRODUCTS.find(item => productSlug(item) === slug || slug.endsWith(`-${item.id.toLowerCase()}`));
  if (!product) { if (productDialog) { productDialog.dataset.silent = 'true'; productDialog.close(); productDialog.remove(); productDialog = null; } updateProductMeta(null); return; }
  if (productDialog?.dataset.productId === product.id && productDialog.dataset.updatedAt === String(product.updatedAt || '')) return;
  showProduct(product);
  productDialog.dataset.productId = product.id;
  productDialog.dataset.updatedAt = String(product.updatedAt || '');
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-product-detail]'); if(!link)return;
  const product=ITEMS[link.dataset.productDetail]; if(!product)return;
  event.preventDefault();
  track('select_item',{items:[analyticsItem(product.id)]});
  history.pushState({glowroProduct:true},'',link.href);
  showProduct(product);
  productDialog.dataset.productId = product.id;
  productDialog.dataset.updatedAt = String(product.updatedAt || '');
});
window.addEventListener('popstate',syncProductFromUrl);
