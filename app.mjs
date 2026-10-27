import { calculateOrder, buildOrderMessage, orderUrl } from './order.mjs';
import { initAnalytics, trackEvent } from './analytics.mjs';

initAnalytics();

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let catalog = [];
let store = {};
let cart = {};
let activeCategory = 'Todos';
let orderingOpen = true;
let toastTimer;
const dialog = $('#cart-dialog');
const checkoutConfig = window.BURGER_TIN_CHECKOUT || { enabled: false, apiBaseUrl: '' };
const categoryIcons = { Promos:'🍔', Hamburguesas:'🍔', Sanguches:'🥪', Acompañamientos:'🍟', Extras:'✨' };
const businessDayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
const businessDayLabels = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function localBusinessClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/Argentina/Buenos_Aires', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return { day:{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday], minutes:Number(parts.hour) * 60 + Number(parts.minute) };
}

function timeMinutes(value) { const [hour, minute] = String(value || '00:00').split(':').map(Number); return hour * 60 + minute; }

function currentOrderingAvailability(hours) {
  if (!hours?.enabled) return { open:true, message:'Pedidos habilitados' };
  const clock = localBusinessClock(), days = hours.days || {}, today = days[businessDayKeys[clock.day]] || {}, previousIndex = (clock.day + 6) % 7, previous = days[businessDayKeys[previousIndex]] || {};
  const todayOpen = timeMinutes(today.open), todayClose = timeMinutes(today.close), previousOpen = timeMinutes(previous.open), previousClose = timeMinutes(previous.close);
  const openToday = today.enabled && (todayClose > todayOpen ? clock.minutes >= todayOpen && clock.minutes < todayClose : clock.minutes >= todayOpen);
  const openFromYesterday = previous.enabled && previousClose <= previousOpen && clock.minutes < previousClose;
  if (openToday || openFromYesterday) return { open:true, message:'Abierto para pedidos' };
  let next = null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const dayIndex = (clock.day + offset) % 7, day = days[businessDayKeys[dayIndex]] || {};
    if (!day.enabled) continue;
    const distance = offset * 1440 + timeMinutes(day.open) - clock.minutes;
    if (distance > 0 && (!next || distance < next.distance)) next = { distance, dayIndex, time:day.open };
  }
  const when = next ? `${next.dayIndex === clock.day ? 'hoy' : next.dayIndex === (clock.day + 1) % 7 ? 'mañana' : `el ${businessDayLabels[next.dayIndex]}`} a las ${next.time} hs` : 'en el próximo horario de atención';
  return { open:false, message:`Podés mirar el menú. Abrimos ${when}.` };
}

function businessHoursText(hours, separator=' · ') {
  if (!hours?.enabled) return 'Consultá disponibilidad por WhatsApp';
  const labels = {mon:'Lun',tue:'Mar',wed:'Mié',thu:'Jue',fri:'Vie',sat:'Sáb',sun:'Dom'};
  const rows = ['mon','tue','wed','thu','fri','sat','sun'].filter(key => hours.days?.[key]?.enabled).map(key => `${labels[key]} ${hours.days[key].open}–${hours.days[key].close}`);
  return rows.length ? rows.join(separator) : 'Consultá disponibilidad por WhatsApp';
}

function applyOrderingState() {
  const availability = currentOrderingAvailability(store.businessHours);
  orderingOpen = availability.open;
  document.body.classList.toggle('store-closed', !orderingOpen);
  $('#store-status').hidden = orderingOpen;
  $('#store-status-message').textContent = availability.message;
  document.querySelectorAll('[data-add]').forEach(button => { button.disabled = !orderingOpen; button.setAttribute('aria-disabled', String(!orderingOpen)); });
  document.querySelectorAll('[data-open-cart]').forEach(button => { button.disabled = !orderingOpen; button.setAttribute('aria-disabled', String(!orderingOpen)); });
  $('#checkout-submit').disabled = !orderingOpen;
  if (!orderingOpen) $('.mobile-cart').hidden = true;
}

function productEventData(id) {
  const product = catalog.find(item => item.id === id);
  return product ? { product_id: product.id, category: product.category, price: product.price } : null;
}

function cartEventData() {
  const order = calculateOrder(catalog, cart);
  return {
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    distinct_products: order.items.length,
    cart_value: order.subtotal
  };
}

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2200);
}

function transitionToSection(target) {
  if (!target) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  if (reducedMotion) return;
  target.classList.remove('section-arrival');
  void target.offsetWidth;
  target.classList.add('section-arrival');
  target.addEventListener('animationend', () => target.classList.remove('section-arrival'), { once:true });
  window.setTimeout(() => target.classList.remove('section-arrival'), 900);
}

function renderMenu() {
  const categories = [...new Set(catalog.map(item => item.category))];
  const shown = activeCategory === 'Todos' ? categories : categories.filter(category => category === activeCategory);
  $('#menu-groups').innerHTML = shown.map((category, index) => {
    const products = catalog.filter(item => item.category === category);
    return `<section class="menu-group" id="cat-${escapeHtml(category.toLowerCase())}"><div class="menu-group-head"><span>0${index + 1}</span><h3>${escapeHtml(category)}</h3></div><div class="menu-list">${products.map(product => {
      const media = product.image
        ? `<button class="product-thumb" data-preview="${escapeHtml(product.id)}" aria-label="Ver foto de ${escapeHtml(product.name)}"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" width="112" height="112"></button>`
        : `<div class="product-thumb product-thumb-placeholder" role="img" aria-label="Este producto todavía no tiene foto"><span aria-hidden="true">${categoryIcons[product.category] || '🍔'}</span><small>Sin foto</small></div>`;
      return `<article class="menu-item" data-product="${escapeHtml(product.id)}">${media}<div class="menu-item-copy"><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.description)}</p></div><div class="menu-item-action"><strong>${money(product.price)}</strong><button data-add="${escapeHtml(product.id)}" aria-label="Agregar ${escapeHtml(product.name)}" ${orderingOpen?'':'disabled aria-disabled="true"'}><span aria-hidden="true">＋</span> Agregar</button></div></article>`;
    }).join('')}</div></section>`;
  }).join('');
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === activeCategory)));
}

function updateCart() {
  try { localStorage.setItem('burger-tin-cart-v1', JSON.stringify(cart)); } catch {}
  const order = calculateOrder(catalog, cart);
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-count]').forEach(node => node.textContent = count);
  document.querySelectorAll('[data-total]').forEach(node => node.textContent = money(order.subtotal));
  $('.mobile-cart').hidden = count === 0 || !orderingOpen;
  $('#checkout-area').hidden = count === 0;
  $('#cart-items').innerHTML = count ? order.items.map(item => `<article class="cart-item"><div><h3>${escapeHtml(item.name)}</h3><button data-remove="${escapeHtml(item.id)}" aria-label="Quitar ${escapeHtml(item.name)}">×</button></div><div><span class="quantity"><button data-change="${escapeHtml(item.id)}" data-delta="-1" aria-label="Restar uno">−</button><b>${item.quantity}</b><button data-change="${escapeHtml(item.id)}" data-delta="1" aria-label="Sumar uno">+</button></span><strong>${money(item.subtotal)}</strong></div></article>`).join('') : '<div class="cart-empty"><span>01</span><h3>Tu pedido<br>empieza acá.</h3><p>Elegí algo del menú y lo armamos juntos.</p><button class="button light" data-browse>Ver el menú</button></div>';
  $('#form-error').textContent = '';
}

function changeQuantity(id, delta) {
  if (!orderingOpen && delta > 0) { notify('El local está cerrado. Podés volver a pedir en el próximo horario.'); return false; }
  if (!catalog.some(item => item.id === id)) return false;
  const next = Math.min(30, Math.max(0, (cart[id] || 0) + delta));
  if (next) cart[id] = next; else delete cart[id];
  updateCart();
  return true;
}

function changeMethod() {
  const pickup = $('#checkout-form').elements.method.value === 'pickup';
  $('#delivery-fields').hidden = pickup;
  $('#customer-address').required = !pickup;
  $('#pickup-fields').hidden = !pickup;
  $('#pickup-address').textContent = store.pickupAddress;
}

function changePaymentMethod() {
  const paymentMethod = $('#checkout-form').elements.paymentMethod.value;
  const submit = $('#checkout-submit');
  submit.textContent = paymentMethod === 'mercadopago' ? 'Pagar con Mercado Pago ↗' : 'Continuar en WhatsApp ↗';
  $('#checkout-help').textContent = paymentMethod === 'mercadopago'
    ? 'El pago se realiza de forma segura en Mercado Pago. La comanda se confirma solamente cuando el pago queda aprobado.'
    : 'Se abrirá WhatsApp con el mensaje listo. El local confirmará el pedido.';
}

async function createServerOrder(details) {
  const order = calculateOrder(catalog, cart);
  const apiBaseUrl = String(checkoutConfig.apiBaseUrl || '').replace(/\/$/, '');
  if (!checkoutConfig.enabled || !apiBaseUrl.startsWith('https://')) throw new Error('Los pagos online todavía no están habilitados.');
  const response = await fetch(`${apiBaseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with':'restia-web' },
    body: JSON.stringify({
      name: details.name,
      fulfillment: details.method,
      address: details.address,
      notes: details.notes,
      paymentMethod: details.paymentMethod,
      items: order.items.map(item => ({ id:item.id, quantity:item.quantity }))
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No pudimos crear el pedido.');
  return result;
}

document.addEventListener('click', event => {
  const internalLink = event.target.closest('a[href^="#"]');
  if (internalLink) {
    const target = document.querySelector(internalLink.getAttribute('href'));
    if (target) {
      event.preventDefault();
      transitionToSection(target);
    }
    return;
  }
  const preview = event.target.closest('[data-preview]');
  if (preview) {
    const product = catalog.find(item => item.id === preview.dataset.preview && item.image);
    if (product) {
      $('#product-preview-image').src = product.image;
      $('#product-preview-image').alt = product.name;
      $('#product-preview-name').textContent = product.name;
      $('#product-preview-description').textContent = product.description;
      $('#product-preview-price').textContent = money(product.price);
      $('#product-dialog').showModal();
      trackEvent('product_selected', { ...productEventData(product.id), interaction:'image_preview' });
    }
    return;
  }
  const add = event.target.closest('[data-add]');
  if (add) {
    if (!orderingOpen) { notify('El local está cerrado. Podés mirar el menú y volver a pedir cuando abramos.'); return; }
    const product = productEventData(add.dataset.add);
    if (product) trackEvent('product_selected', { ...product, interaction: 'add_button' });
    if (changeQuantity(add.dataset.add, 1)) {
      trackEvent('cart_add', { ...product, quantity: cart[add.dataset.add], ...cartEventData() });
      notify('Sumado a tu pedido.');
    }
    return;
  }
  const selectedProduct = event.target.closest('[data-product]');
  if (selectedProduct) {
    const product = productEventData(selectedProduct.dataset.product);
    if (product) trackEvent('product_selected', { ...product, interaction: 'product_card' });
    return;
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) { activeCategory = filter.dataset.filter; renderMenu(); transitionToSection($('#menu')); return; }
  const change = event.target.closest('[data-change]');
  if (change) { changeQuantity(change.dataset.change, Number(change.dataset.delta)); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) { delete cart[remove.dataset.remove]; updateCart(); return; }
  const openCart = event.target.closest('[data-open-cart]');
  if (openCart) {
    if (!orderingOpen) { notify('El local está cerrado. Los pedidos se habilitan en el próximo horario.'); return; }
    updateCart(); changeMethod(); dialog.showModal();
    trackEvent('cart_open', { source: openCart.classList.contains('mobile-cart') ? 'floating' : 'header', ...cartEventData() });
    return;
  }
  const whatsapp = event.target.closest('[data-whatsapp-source]');
  if (whatsapp) trackEvent('whatsapp_click', { source: whatsapp.dataset.whatsappSource });
  if (event.target.closest('[data-browse]')) { dialog.close(); transitionToSection($('#menu')); }
});

$('#close-cart').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#close-product-preview').addEventListener('click', () => $('#product-dialog').close());
$('#product-dialog').addEventListener('click', event => { if (event.target === $('#product-dialog')) $('#product-dialog').close(); });
$('#checkout-form').addEventListener('change', event => {
  if (event.target.name === 'method') changeMethod();
  if (event.target.name === 'paymentMethod') changePaymentMethod();
});
$('#checkout-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#checkout-submit');
  try {
    if (!orderingOpen) throw new Error('El local está cerrado. Los pedidos se habilitan en el próximo horario de atención.');
    const details = Object.fromEntries(new FormData(event.currentTarget));
    submit.disabled = true;
    submit.textContent = 'Preparando pedido…';
    if (checkoutConfig.enabled) {
      const result = await createServerOrder(details);
      trackEvent('checkout_started', { payment_method: details.paymentMethod, fulfillment: details.method, ...cartEventData() });
      const destination = details.paymentMethod === 'mercadopago' ? result.checkoutUrl : result.whatsappUrl;
      if (!destination) throw new Error('El servidor no devolvió el enlace de confirmación.');
      window.location.assign(destination);
      return;
    }
    const url = orderUrl(buildOrderMessage(catalog, cart, details, store));
    trackEvent('whatsapp_click', { source: 'checkout', fulfillment: details.method, ...cartEventData() });
    window.open(url, '_blank', 'noopener');
    $('#form-error').textContent = '';
  } catch (error) {
    $('#form-error').textContent = error.message;
    submit.disabled = false;
    changePaymentMethod();
  }
});

try {
  const staticResponse = await fetch('./catalog.json', { cache: 'no-store' });
  if (!staticResponse.ok) throw new Error('No pudimos cargar el menú.');
  store = await staticResponse.json();
  const apiBaseUrl = String(checkoutConfig.apiBaseUrl || '').replace(/\/$/, '');
  if (checkoutConfig.enabled && apiBaseUrl.startsWith('https://')) {
    try {
      const liveResponse = await fetch(`${apiBaseUrl}/api/catalog`, { cache:'no-store' });
      if (liveResponse.ok) store = await liveResponse.json();
    } catch (error) {
      console.warn('Usando catálogo local de respaldo:', error.message);
    }
  }
  catalog = store.products || [];
  orderingOpen = currentOrderingAvailability(store.businessHours).open;
  if (store.theme?.primary) document.documentElement.style.setProperty('--purple', store.theme.primary);
  if (store.theme?.accent) document.documentElement.style.setProperty('--red', store.theme.accent);
  const saved = JSON.parse(localStorage.getItem('burger-tin-cart-v1') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id, quantity] of Object.entries(saved)) if (catalog.some(item => item.id === id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 30) cart[id] = quantity;
  }
  const categories = ['Todos', ...new Set(catalog.map(item => item.category))];
  $('#filters').innerHTML = categories.map(category => `<button data-filter="${escapeHtml(category)}" aria-pressed="${category === 'Todos'}">${escapeHtml(category)}</button>`).join('');
  $('#delivery-zones').textContent = store.deliveryZones;
  $('#pickup-address-footer').textContent = store.pickupAddress;
  $('#footer-business').textContent = store.pickupAddress;
  $('#footer-hours').textContent = businessHoursText(store.businessHours, '\n');
  $('#contact-hours').textContent = businessHoursText(store.businessHours);
  $('#checkout-business').textContent = store.business;
  document.querySelectorAll('[data-whatsapp-source]').forEach(link => {
    link.href = link.dataset.whatsappSource === 'catalogo' ? `https://wa.me/c/${store.phone}` : `https://wa.me/${store.phone}`;
  });
  document.querySelectorAll('[data-requires-mp]').forEach(node => { node.hidden = !checkoutConfig.enabled || !store.mercadoPagoEnabled; });
  const payment = new URLSearchParams(location.search).get('payment');
  if (payment === 'success') notify('Pago recibido. Estamos confirmando tu pedido.');
  if (payment === 'pending') notify('Tu pago quedó pendiente. Te avisaremos cuando se acredite.');
  if (payment === 'failure') notify('El pago no se completó. Podés intentarlo nuevamente.');
  renderMenu(); updateCart(); changeMethod(); changePaymentMethod(); applyOrderingState();
  setInterval(() => { applyOrderingState(); updateCart(); }, 60000);
} catch (error) {
  $('#menu-groups').innerHTML = `<p class="load-error">${escapeHtml(error.message)} <a href="https://wa.me/c/5491127798677">Abrir catálogo de WhatsApp</a></p>`;
}
