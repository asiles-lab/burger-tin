'use strict';

// GlowRo — sitio estático. No se almacenan datos de visitantes en servidores.
// Catálogo verificado manualmente; compra externa en las publicaciones de GlowRo.
const CONTACT = {
  instagram: 'https://instagram.com/glowro_/',
  dm: 'https://ig.me/m/glowro_'
};
const ITEMS = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const $ = id => document.getElementById(id);
const storageKey = 'glowro-selection-v2';
const availableIds = Object.keys(ITEMS);
let selection = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) selection = new Set(saved.filter(id => availableIds.includes(id)));
} catch (_) { /* private/incognito browsers */ }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify([...selection])); } catch (_) {} }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderSelection() {
  const n = selection.size;
  $('selection-count').textContent = n;
  $('mobile-selection-count').textContent = n;
  $('drawer-title-count').textContent = `(${n})`;
  document.querySelectorAll('[data-add]').forEach(btn => {
    const active = selection.has(btn.dataset.add);
    btn.classList.toggle('is-selected', active);
    btn.setAttribute('aria-pressed', String(active));
    if (btn.classList.contains('add-btn')) {
      btn.setAttribute('aria-label', `${active ? 'Quitar' : 'Guardar'} ${ITEMS[btn.dataset.add].name} ${active ? 'de' : 'en'} favoritos`);
    }
  });
  const target = $('drawer-items');
  if (n === 0) {
    target.innerHTML = '<div class="drawer-empty"><svg class="icon"><use href="#i-bag"/></svg><h3>Todavía no elegiste nada.</h3><p>Explorá los productos y guardá tus favoritos.</p></div>';
  } else {
    target.innerHTML = [...selection].map(id => `<div class="drawer-item"><img src="${ITEMS[id].image}" alt="" width="70" height="75"><div><h3>${escapeHTML(ITEMS[id].name)}</h3><a href="${escapeHTML(ITEMS[id].url)}" target="_blank" rel="noopener noreferrer">Abrir producto en ML ↗</a><p class="favorite-help">Allí, elegí «Agregar al carrito».</p></div><button type="button" data-remove="${id}" aria-label="Quitar ${escapeHTML(ITEMS[id].name)}">Quitar</button></div>`).join('');
  }
  $('drawer-copy').disabled = n === 0;
}
function toggleSelection(id) {
  if (!ITEMS[id]) return;
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  persist(); renderSelection();
  toast(selection.has(id) ? 'Guardado en favoritos' : 'Quitado de favoritos');
  if (selection.has(id)) openDrawer();
}
document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-add]');
  if (trigger) toggleSelection(trigger.dataset.add);
  const remove = e.target.closest('[data-remove]');
  if (remove) { selection.delete(remove.dataset.remove); persist(); renderSelection(); }
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
    const tabbables = [...drawer.querySelectorAll('button:not([disabled]),a[href]')];
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
$('drawer-copy').addEventListener('click', async () => {
  if (!selection.size) return;
  const names = [...selection].map(id => `• ${ITEMS[id].name}`).join('\n');
  const msg = `¡Hola, GlowRo! ✨ Estuve mirando la web y me interesan estos productos:\n${names}\n¿Me cuentan qué productos tienen disponibles y sus precios? ¡Gracias!`;
  if (await copyText(msg)) toast('Consulta copiada. Pegala en el chat de Instagram.');
  else toast('No se pudo copiar. Seleccioná tus productos y escribinos por Instagram.');
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
$('products-grid').innerHTML = PRODUCTS.map(p => `<article class="product-card reveal" data-category="${p.category}" data-offer="${Boolean(p.previous)}" data-id="${p.id}">
<div class="product-image"><a href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver ${escapeHTML(p.name)} en Mercado Libre"><img loading="lazy" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" width="560" height="630"></a><button type="button" class="add-btn" data-add="${p.id}" aria-label="Guardar ${escapeHTML(p.name)}" aria-pressed="false"><svg class="icon"><use href="#i-heart"/></svg></button></div>
<div class="product-details"><div><span class="product-overline">${labels[p.category]}</span><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)}</p><div class="catalog-price">${p.previous?'<s>'+pesos(p.previous)+'</s> ':''}<strong>${pesos(p.price)}</strong></div><p class="price-date">Referencia · ${CATALOG_DATE}</p><a class="btn btn-dark ml-buy" href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer">Comprar en Mercado Libre ↗</a></div></div></article>`).join('');

const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); } });
}, { threshold: .08, rootMargin: '0px 0px 35px 0px' }) : null;
document.querySelectorAll('.reveal').forEach(el => revealObserver ? revealObserver.observe(el) : el.classList.add('is-visible'));
function updateFloatingSelection() {
  $('mobile-selection').classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.9);
}
window.addEventListener('scroll', updateFloatingSelection, { passive: true });
window.addEventListener('resize', updateFloatingSelection);
updateFloatingSelection();
$('year').textContent = new Date().getFullYear();
renderSelection();
renderQuiz();
