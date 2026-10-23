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
let toastTimer;
const dialog = $('#cart-dialog');

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

function renderMenu() {
  const categories = [...new Set(catalog.map(item => item.category))];
  const shown = activeCategory === 'Todos' ? categories : categories.filter(category => category === activeCategory);
  $('#menu-groups').innerHTML = shown.map((category, index) => {
    const products = catalog.filter(item => item.category === category);
    const featured = products.find(item => item.image);
    const banner = featured ? `<figure class="menu-photo ${index % 2 ? 'photo-right' : ''}"><img src="${escapeHtml(featured.image)}" alt="${escapeHtml(featured.name)}" loading="lazy"><figcaption>${escapeHtml(category)}</figcaption></figure>` : '';
    return `<section class="menu-group" id="cat-${escapeHtml(category.toLowerCase())}">${banner}<div class="menu-group-head"><span>0${index + 1}</span><h3>${escapeHtml(category)}</h3></div><div class="menu-list">${products.map(product => `<article class="menu-item" data-product="${escapeHtml(product.id)}"><div><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.description)}</p></div><div class="menu-item-action"><strong>${money(product.price)}</strong><button data-add="${escapeHtml(product.id)}" aria-label="Agregar ${escapeHtml(product.name)}">+</button></div></article>`).join('')}</div></section>`;
  }).join('');
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === activeCategory)));
}

function updateCart() {
  try { localStorage.setItem('burger-tin-cart-v1', JSON.stringify(cart)); } catch {}
  const order = calculateOrder(catalog, cart);
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-count]').forEach(node => node.textContent = count);
  document.querySelectorAll('[data-total]').forEach(node => node.textContent = money(order.subtotal));
  $('.mobile-cart').hidden = count === 0;
  $('#checkout-area').hidden = count === 0;
  $('#cart-items').innerHTML = count ? order.items.map(item => `<article class="cart-item"><div><h3>${escapeHtml(item.name)}</h3><button data-remove="${escapeHtml(item.id)}" aria-label="Quitar ${escapeHtml(item.name)}">×</button></div><div><span class="quantity"><button data-change="${escapeHtml(item.id)}" data-delta="-1" aria-label="Restar uno">−</button><b>${item.quantity}</b><button data-change="${escapeHtml(item.id)}" data-delta="1" aria-label="Sumar uno">+</button></span><strong>${money(item.subtotal)}</strong></div></article>`).join('') : '<div class="cart-empty"><span>01</span><h3>Tu pedido<br>empieza acá.</h3><p>Elegí algo del menú y lo armamos juntos.</p><button class="button light" data-browse>Ver el menú</button></div>';
  $('#form-error').textContent = '';
}

function changeQuantity(id, delta) {
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

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) {
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
  if (filter) { activeCategory = filter.dataset.filter; renderMenu(); $('#menu').scrollIntoView({behavior:'smooth'}); return; }
  const change = event.target.closest('[data-change]');
  if (change) { changeQuantity(change.dataset.change, Number(change.dataset.delta)); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) { delete cart[remove.dataset.remove]; updateCart(); return; }
  const openCart = event.target.closest('[data-open-cart]');
  if (openCart) {
    updateCart(); changeMethod(); dialog.showModal();
    trackEvent('cart_open', { source: openCart.classList.contains('mobile-cart') ? 'floating' : 'header', ...cartEventData() });
    return;
  }
  const whatsapp = event.target.closest('[data-whatsapp-source]');
  if (whatsapp) trackEvent('whatsapp_click', { source: whatsapp.dataset.whatsappSource });
  if (event.target.closest('[data-browse]')) { dialog.close(); $('#menu').scrollIntoView({behavior:'smooth'}); }
});

$('#close-cart').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#checkout-form').addEventListener('change', event => { if (event.target.name === 'method') changeMethod(); });
$('#checkout-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const details = Object.fromEntries(new FormData(event.currentTarget));
    const url = orderUrl(buildOrderMessage(catalog, cart, details, store));
    trackEvent('whatsapp_click', { source: 'checkout', fulfillment: details.method, ...cartEventData() });
    window.open(url, '_blank', 'noopener');
    $('#form-error').textContent = '';
  } catch (error) { $('#form-error').textContent = error.message; }
});

try {
  const response = await fetch('./catalog.json');
  if (!response.ok) throw new Error('No pudimos cargar el menú.');
  store = await response.json();
  catalog = store.products || [];
  const saved = JSON.parse(localStorage.getItem('burger-tin-cart-v1') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [id, quantity] of Object.entries(saved)) if (catalog.some(item => item.id === id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 30) cart[id] = quantity;
  }
  const categories = ['Todos', ...new Set(catalog.map(item => item.category))];
  $('#filters').innerHTML = categories.map(category => `<button data-filter="${escapeHtml(category)}" aria-pressed="${category === 'Todos'}">${escapeHtml(category)}</button>`).join('');
  $('#delivery-zones').textContent = store.deliveryZones;
  $('#pickup-address-footer').textContent = store.pickupAddress;
  renderMenu(); updateCart(); changeMethod();
} catch (error) {
  $('#menu-groups').innerHTML = `<p class="load-error">${escapeHtml(error.message)} <a href="https://wa.me/c/82940499390482">Abrir catálogo de WhatsApp</a></p>`;
}
