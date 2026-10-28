'use strict';

// GlowRo — catálogo público con respaldo estático; el servidor valida importes y pagos.
const RUNTIME = window.RESTIA_CLIENT_CONFIG || window.BURGER_TIN_CHECKOUT || {};
const API = String(RUNTIME.apiBaseUrl || '').replace(/\/$/, '');
const STORE_ID = String(RUNTIME.storeId || 'glowro');
const CONTACT = {
  instagram: 'https://instagram.com/glowro_/',
  dm: 'https://ig.me/m/glowro_'
};
const ITEMS = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const $ = id => document.getElementById(id);
const storageKey = 'glowro-cart-v1';
const cart = new Map();
let checkoutReady = false;
let deliveryFee = null;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) for (const [id, quantity] of saved) if (typeof id === 'string' && Number.isInteger(quantity) && quantity > 0 && quantity <= 30) cart.set(id, quantity);
} catch (_) { /* private/incognito browsers */ }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify([...cart])); } catch (_) {} }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
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
      btn.setAttribute('aria-label', `Agregar ${ITEMS[btn.dataset.add].name} al carrito`);
    }
  });
  const target = $('drawer-items');
  if (n === 0) {
    target.innerHTML = '<div class="drawer-empty"><svg class="icon"><use href="#i-bag"/></svg><h3>Tu carrito está vacío.</h3><p>Elegí productos para preparar tu pedido.</p></div>';
  } else {
    target.innerHTML = entries.map(([id, quantity]) => `<div class="drawer-item"><img src="${escapeHTML(ITEMS[id].image || 'assets/serums.svg')}" alt="" width="70" height="75"><div><h3>${escapeHTML(ITEMS[id].name)}</h3><p>${quantity} × ${pesos(ITEMS[id].price)} = ${pesos(quantity * ITEMS[id].price)}</p><div class="quantity-controls"><button type="button" data-remove="${id}" aria-label="Quitar una unidad de ${escapeHTML(ITEMS[id].name)}">−</button><strong>${quantity}</strong><button type="button" data-add="${id}" aria-label="Agregar una unidad de ${escapeHTML(ITEMS[id].name)}">+</button></div></div></div>`).join('');
  }
  const productsTotal = entries.reduce((sum, [id, quantity]) => sum + ITEMS[id].price * quantity, 0);
  $('cart-total').textContent = pesos(productsTotal + (deliveryFee ?? 0));
  $('shipping-note').textContent = deliveryFee === null ? 'Costo de envío por configurar' : deliveryFee === 0 ? 'Envío incluido' : `Envío: ${pesos(deliveryFee)}`;
  $('drawer-copy').disabled = !n || !checkoutReady;
  $('checkout-status').textContent = checkoutReady ? '' : 'El pago se habilitará cuando GlowRo conecte Mercado Pago y configure el envío.';
}
function addToCart(id) {
  if (!ITEMS[id]) return;
  cart.set(id, Math.min(30, (cart.get(id) || 0) + 1));
  persist(); renderSelection();
  toast('Agregado al carrito');
  openDrawer();
}
document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-add]');
  if (trigger) addToCart(trigger.dataset.add);
  const remove = e.target.closest('[data-remove]');
  if (remove) { const q = cart.get(remove.dataset.remove) || 0; if (q <= 1) cart.delete(remove.dataset.remove); else cart.set(remove.dataset.remove, q - 1); persist(); renderSelection(); }
});

const drawer = $('drawer-layer');
let previouslyFocused = null;
function openDrawer() { previouslyFocused = document.activeElement; drawer.hidden = false; document.body.classList.add('drawer-open'); $('close-drawer').focus(); }
function closeDrawer() { drawer.hidden = true; document.body.classList.remove('drawer-open'); previouslyFocused?.focus(); }
$('open-drawer').addEventListener('click', openDrawer);
$('mobile-selection').addEventListener('click', openDrawer);
$('close-drawer').addEventListener('click', closeDrawer);
$('drawer-backdrop').addEventListener('click', closeDrawer);
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
  if (!checkoutReady || !cart.size) return;
  const button = $('drawer-copy');
  button.disabled = true;
  $('checkout-status').textContent = 'Preparando el pago seguro…';
  const data = new FormData(event.currentTarget);
  try {
    const response = await fetch(`${API}/api/orders`, {method:'POST', headers:{'content-type':'application/json','x-requested-with':'restia-web'}, body:JSON.stringify({name:data.get('name'),phone:data.get('phone'),address:data.get('address'),notes:data.get('notes'),fulfillment:'delivery',paymentMethod:'mercadopago',items:[...cart].map(([id,quantity]) => ({id,quantity}))})});
    const result = await response.json();
    if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'No pudimos preparar el pago.');
    location.assign(result.checkoutUrl);
  } catch (error) {
    $('checkout-status').textContent = error.message;
    button.disabled = false;
  }
});

const menu = $('mobile-nav');
const menuToggle = $('menu-toggle');
function closeMenu() { menu.hidden = true; menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Abrir menú'); }
menuToggle.addEventListener('click', () => {
  const opening = !menu.hidden;
  menu.hidden = opening;
  menuToggle.setAttribute('aria-expanded', String(!opening));
  menuToggle.setAttribute('aria-label', opening ? 'Abrir menú' : 'Cerrar menú');
});
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
window.addEventListener('resize', () => { if (window.innerWidth > 790) closeMenu(); });

$('filters').addEventListener('click', e => {
  const button = e.target.closest('[data-filter]'); if (!button) return;
  $('filters').querySelectorAll('[data-filter]').forEach(btn => {
    const active = btn === button; btn.classList.toggle('is-active', active); btn.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.product-card').forEach(card => { card.hidden = button.dataset.filter === 'ofertas' ? card.dataset.offer !== 'true' : button.dataset.filter !== 'all' && button.dataset.filter !== card.dataset.category; });
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
  $('quiz-counter').textContent = 'TU RESULTADO';
  $('quiz-progress-bar').style.width = '100%';
  $('quiz-nav').hidden = true;
  $('quiz-screen').innerHTML = `<span class="quiz-result-eyebrow">✳ TU PUNTO DE PARTIDA</span><h3 class="quiz-result-title">${r.title}</h3><p class="quiz-result-copy">Una rutina simple para tener como punto de partida. Pedí asesoramiento para elegir productos específicos.</p><ul class="quiz-result-steps">${r.steps.map((s,i) => `<li><span>${i+1}</span>${s}</li>`).join('')}</ul><div class="quiz-result-actions"><button class="btn btn-dark" type="button" id="quiz-copy"><svg class="icon"><use href="#i-copy"/></svg> Copiar mi guía</button><a class="btn btn-outline" href="${CONTACT.dm}" target="_blank" rel="noopener noreferrer">Consultar por Instagram <svg class="icon"><use href="#i-arrow-up"/></svg></a></div><button type="button" class="quiz-reset" id="quiz-reset">Volver a empezar ↺</button>`;
}


const pesos = value => new Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:2}).format(value);
const labels = {kits:'KITS Y COMBOS',facial:'CUIDADO FACIAL',corporal:'CUIDADO CORPORAL'};
function renderProducts() {
  $('products-grid').innerHTML = PRODUCTS.length ? PRODUCTS.map(p => `<article class="product-card reveal is-visible" data-category="${escapeHTML(p.category)}" data-offer="${Boolean(p.previous)}" data-id="${escapeHTML(p.id)}">
  <div class="product-image"><img loading="lazy" src="${escapeHTML(p.image || 'assets/serums.svg')}" alt="${escapeHTML(p.name)}" width="560" height="630"><button type="button" class="add-btn" data-add="${escapeHTML(p.id)}" aria-label="Agregar ${escapeHTML(p.name)} al carrito" aria-pressed="false"><svg class="icon"><use href="#i-bag"/></svg></button></div>
  <div class="product-details"><div><span class="product-overline">${escapeHTML(labels[p.category] || p.category)}</span><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description || '')}</p><div class="catalog-price"><strong>${pesos(p.price)}</strong></div><button class="btn btn-dark ml-buy" type="button" data-add="${escapeHTML(p.id)}"><span class="ml-buy-long">Agregar al carrito</span><span class="ml-buy-short">Agregar</span><svg class="icon"><use href="#i-plus"/></svg></button></div></div></article>`).join('') : '<p>El catálogo está en actualización. Volvé a visitarnos pronto.</p>';
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
    deliveryFee = Number.isFinite(data.deliveryFee) && data.deliveryFee >= 0 ? data.deliveryFee : null;
    checkoutReady = Boolean(data.mercadoPagoEnabled && data.paymentMode === 'production' && deliveryFee !== null);
    renderProducts();
  } catch (error) {
    checkoutReady = false;
    document.querySelector('.catalog-note').textContent = 'No pudimos actualizar los precios en este momento. El pago online está pausado hasta recuperar la conexión.';
    renderSelection();
    $('checkout-status').textContent = 'La compra online no está disponible en este momento.';
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
const paymentReturn = new URLSearchParams(location.search).get('payment');
if (paymentReturn === 'success' || paymentReturn === 'pending') setTimeout(() => toast('Volviste de Mercado Pago. El pedido se confirmará cuando se acredite el pago.'), 400);
if (paymentReturn === 'failure') setTimeout(() => toast('El pago no se completó. Tu carrito sigue disponible.'), 400);
