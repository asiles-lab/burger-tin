'use strict';

const runtime = window.RESTIA_CLIENT_CONFIG || window.BURGER_TIN_CHECKOUT || {};
const api = String(runtime.apiBaseUrl || '').replace(/\/$/, '');
const requestedGuide = document.body.dataset.guide;
const money = value => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS'}).format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const productLink = product => `/?producto=${encodeURIComponent(`${String(product.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${product.id.toLowerCase()}`)}`;
const guideLink = guide => `/rutinas/${encodeURIComponent(guide.slug)}/`;
let guides = [];
let products = new Map();
let catalogVerified = false;
let filter = 'all';

function cartCount() {
  try {
    const saved = JSON.parse(localStorage.getItem('glowro-cart-v1') || '[]');
    return Array.isArray(saved) ? saved.reduce((n, pair) => n + (Number.isInteger(pair?.[1]) ? pair[1] : 0), 0) : 0;
  } catch { return 0; }
}
function updateCartCount() { document.getElementById('cart-count').textContent = String(cartCount()); }
function addToCart(id, button) {
  if (!catalogVerified || !products.has(id)) return;
  try {
    const saved = JSON.parse(localStorage.getItem('glowro-cart-v1') || '[]');
    const cart = new Map(Array.isArray(saved) ? saved.filter(pair => Array.isArray(pair) && typeof pair[0] === 'string' && Number.isInteger(pair[1]) && pair[1] > 0 && pair[1] <= 30) : []);
    if ((cart.get(id) || 0) >= 30) return;
    cart.set(id, (cart.get(id) || 0) + 1);
    localStorage.setItem('glowro-cart-v1', JSON.stringify([...cart]));
    window.glowroAnalytics?.event('add_to_cart', {items:[{item_id:id,item_name:products.get(id).name,price:Number(products.get(id).price),quantity:1}]});
    updateCartCount();
    button.textContent = 'Agregado ✓';
    window.setTimeout(() => { button.textContent = 'Agregar al carrito +'; }, 1800);
  } catch { button.textContent = 'No pudimos guardar el carrito'; }
}
function productCard(id, guide) {
  const product = products.get(id);
  if (!product) return `<div class="r-product r-unavailable"><p>Producto no disponible en el catálogo actual</p><small>${escape(id)}</small></div>`;
  const isCombo = product.category === 'kits';
  return `<article class="r-product"><a class="r-product-media" href="${productLink(product)}"><img src="${escape(product.image)}" alt="${escape(product.name)}" width="560" height="630" loading="lazy"></a><div class="r-product-copy"><p class="r-product-kind">${isCombo ? 'KIT O COMBO' : 'PRODUCTO INDIVIDUAL'}</p><h3><a href="${productLink(product)}">${escape(product.name)}</a></h3><strong>${money(Number(product.price))}</strong><div class="r-product-actions"><a href="${productLink(product)}">Ver ficha ↗</a><button type="button" data-add="${escape(id)}" aria-label="Agregar ${escape(product.name)} al carrito">Agregar al carrito +</button></div></div></article>`;
}
function renderCards() {
  const selected = guides.filter(guide => filter === 'all' || guide.filters.includes(filter));
  document.getElementById('r-cards').innerHTML = selected.map((guide, index) => `<article class="r-card"><a class="r-card-image" href="${guideLink(guide)}"><img src="${escape(products.get(guide.heroId)?.image || guide.heroImage)}" alt="${escape(guide.title)}" width="560" height="630" loading="lazy"></a><div class="r-card-body"><div class="r-card-meta"><span>${String(index + 1).padStart(2, '0')}</span><span>${escape(guide.eyebrow)}</span></div><h3><a href="${guideLink(guide)}">${escape(guide.title)}</a></h3><p>${escape(guide.summary)}</p><small>${guide.productIds.length} ${guide.productIds.length === 1 ? 'producto relacionado' : 'productos relacionados'}</small><a class="r-card-cta" href="${guideLink(guide)}">Explorar el paso a paso <span aria-hidden="true">↗</span></a></div></article>`).join('') || '<p>No encontramos guías en esta categoría.</p>';
}
function stepsMarkup(steps) {
  return `<ol class="r-steps">${steps.map((step, index) => `<li><span class="r-step-number">${String(index+1).padStart(2,'0')}</span><div><h3>${escape(step.label)}</h3><p>${escape(step.text)}</p><small>${escape(step.badge)}</small></div></li>`).join('')}</ol>`;
}
function renderDetail(guide) {
  document.getElementById('r-listing').hidden = true;
  const detail = document.getElementById('r-detail');
  detail.hidden = false;
  const both = guide.morning?.length && guide.night?.length;
  const hasSteps = guide.steps?.length || guide.morning?.length || guide.night?.length;
  let instructions = '';
  if (both) instructions = `<div class="r-tabs" role="tablist" aria-label="Momento del día"><button id="tab-morning" type="button" role="tab" aria-selected="true" aria-controls="panel-morning" tabindex="0">☼ Mañana</button><button id="tab-night" type="button" role="tab" aria-selected="false" aria-controls="panel-night" tabindex="-1">☾ Noche</button></div><div id="panel-morning" role="tabpanel" aria-labelledby="tab-morning" tabindex="0">${stepsMarkup(guide.morning)}</div><div id="panel-night" role="tabpanel" aria-labelledby="tab-night" tabindex="0" hidden>${stepsMarkup(guide.night)}</div>`;
  else if (guide.steps?.length) instructions = stepsMarkup(guide.steps);
  else if (guide.night?.length) instructions = stepsMarkup(guide.night);
  else if (guide.morning?.length) instructions = stepsMarkup(guide.morning);
  detail.innerHTML = `<div class="r-detail-hero"><div class="r-detail-copy"><a class="r-back" href="/rutinas/">← Todas las rutinas</a><p class="r-eyebrow">${escape(guide.eyebrow)}</p><h1>${escape(guide.title)}</h1><p class="r-detail-intro">${escape(guide.summary)}</p><p class="r-goal"><span>OBJETIVO COSMÉTICO</span>${escape(guide.goal)}</p><a class="r-jump" href="${guideLink(guide)}#productos-rutina">Ver productos y precios ↘</a></div><div class="r-detail-image"><img src="${escape(products.get(guide.heroId)?.image || guide.heroImage)}" alt="${escape(guide.title)}" width="560" height="630" fetchpriority="high"></div></div><div class="r-detail-body r-container"><div class="r-detail-main"><p class="r-eyebrow">${guide.review && hasSteps ? 'PASO A PASO · CONTENIDO POR COTEJAR' : guide.review ? 'INFORMACIÓN POR VERIFICAR' : 'EL PASO A PASO'}</p><h2>${guide.review && !hasSteps ? 'Conocé el producto.' : 'Tu momento de cuidado.'}</h2>${guide.review ? `<div class="r-review"><h3>${hasSteps ? 'Verificá el contenido del kit' : 'Contenido pendiente de verificación'}</h3><p>${escape(guide.review)}</p><p>${hasSteps ? 'Seguí las instrucciones de cada envase antes de usar los productos.' : 'El producto se puede explorar y comprar desde su ficha; no indicamos un orden de aplicación sin datos suficientes.'}</p></div>` : ''}${hasSteps ? instructions : ''}${guide.occasional ? `<div class="r-note"><h3>Un paso ocasional</h3><p>${escape(guide.occasional)}</p></div>` : ''}<div class="r-caution"><h3>Antes de empezar</h3><p>${escape(guide.cautions)}</p><p>Esta guía es orientación cosmética general y no reemplaza el asesoramiento profesional. Ante una afección dermatológica, consultá a un profesional de salud.</p></div></div><aside class="r-detail-side"><span class="r-side-mark" aria-hidden="true">✳</span><p>Una rutina a tu manera</p><a href="/#tu-rutina">Conocé el Quiz de piel ↗</a></aside></div><section id="productos-rutina" class="r-products-section"><div class="r-container"><p class="r-eyebrow">PRODUCTOS RELACIONADOS</p><h2>Elegí lo que <em>va con vos.</em></h2>${guide.productNote ? `<p class="r-product-note">${escape(guide.productNote)}</p>` : ''}<p class="r-catalog-status">${catalogVerified ? 'Precios del catálogo actual. Cada botón agrega solamente el artículo elegido.' : 'No pudimos verificar el catálogo actual. La compra desde esta guía está desactivada.'}</p><div class="r-products-grid">${guide.productIds.map(id => productCard(id, guide)).join('')}</div></div></section><div class="r-detail-end"><a href="/rutinas/">← Explorar más rutinas</a></div>`;
  initTabs(detail);
}
function initTabs(detail) {
  const tabs = [...detail.querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;
  function select(tab, focus = false) {
    tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; document.getElementById(item.getAttribute('aria-controls')).hidden = !active; });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => { if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; select(tabs[next], true); });
  });
}

document.addEventListener('click', event => {
  const chip = event.target.closest('[data-filter]');
  if (chip) { filter = chip.dataset.filter; document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === chip))); renderCards(); }
  const add = event.target.closest('[data-add]');
  if (add) addToCart(add.dataset.add, add);
});
updateCartCount();
(async () => {
  try {
    const response = await fetch('/rutinas/guides.json');
    if (!response.ok) throw new Error('Guías no disponibles');
    guides = await response.json();
    if (!Array.isArray(guides)) throw new Error('Formato de guías inválido');
    try {
      const catalogResponse = await fetch(`${api}/api/catalog`, {cache:'no-store'});
      if (!catalogResponse.ok) throw new Error('Catálogo no disponible');
      const catalog = await catalogResponse.json();
      if (catalog.id !== 'glowro' || catalog.business !== 'GlowRo' || !Array.isArray(catalog.products)) throw new Error('Catálogo inválido');
      products = new Map(catalog.products.filter(p => p.active !== false && Number.isFinite(Number(p.price))).map(p => [p.id,p]));
      catalogVerified = true;
    } catch { catalogVerified = false; }
    if (requestedGuide) {
      const guide = guides.find(item => item.slug === requestedGuide);
      if (guide) renderDetail(guide);
      else { document.title = 'Rutina no encontrada — GlowRo'; document.getElementById('r-cards').innerHTML = '<p>No encontramos esa rutina. Explorá las guías disponibles.</p>'; }
    } else renderCards();
  } catch { document.getElementById('r-cards').innerHTML = '<p>No pudimos cargar las guías en este momento. Probá nuevamente más tarde.</p>'; }
})();
