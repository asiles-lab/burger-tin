const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = $('[data-header]');
const setHeaderState = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive:true });

const menuToggle = $('.menu-toggle');
const mobileNav = $('#mobile-nav');

function closeMenu() {
  if (!menuToggle || !mobileNav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menú');
  mobileNav.hidden = true;
  document.body.classList.remove('menu-open');
}

menuToggle?.addEventListener('click', () => {
  const opening = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(opening));
  menuToggle.setAttribute('aria-label', opening ? 'Cerrar menú' : 'Abrir menú');
  mobileNav.hidden = !opening;
  document.body.classList.toggle('menu-open', opening);
});

mobileNav?.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 980) closeMenu();
});

const revealNodes = $$('[data-reveal]');
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealNodes.forEach(node => node.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold:.12, rootMargin:'0px 0px -7% 0px' });
  revealNodes.forEach(node => revealObserver.observe(node));
}

const heroStage = $('[data-hero-stage]');
if (heroStage) requestAnimationFrame(() => heroStage.classList.add('is-ready'));

const flowBoard = $('[data-flow-board]');
if (flowBoard) {
  if (reduceMotion || !('IntersectionObserver' in window)) {
    flowBoard.classList.add('is-visible');
  } else {
    const flowObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      flowBoard.classList.add('is-visible');
      flowObserver.disconnect();
    }, { threshold:.24 });
    flowObserver.observe(flowBoard);
  }
}

const ordersRange = $('#orders-range');
const minutesRange = $('#minutes-range');
const ordersOutput = $('#orders-output');
const minutesOutput = $('#minutes-output');
const hoursOutput = $('#hours-output');

function updateEstimate() {
  if (!ordersRange || !minutesRange) return;
  const orders = Number(ordersRange.value);
  const minutes = Number(minutesRange.value);
  const hours = Math.round((orders * minutes * 30) / 60);
  ordersOutput.value = String(orders);
  minutesOutput.value = minutes.toLocaleString('es-AR', { maximumFractionDigits:1 });
  hoursOutput.textContent = hours.toLocaleString('es-AR');
}

ordersRange?.addEventListener('input', updateEstimate);
minutesRange?.addEventListener('input', updateEstimate);
updateEstimate();

$$('.faq-list details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    $$('.faq-list details').forEach(other => {
      if (other !== detail) other.open = false;
    });
  });
});

function track(name, data = {}) {
  if (typeof window.umami?.track === 'function') window.umami.track(name, data);
}

document.addEventListener('click', event => {
  const tracked = event.target.closest('[data-track]');
  if (tracked) track(tracked.dataset.track, { section:tracked.closest('section')?.id || 'navigation' });
});

$('#year').textContent = String(new Date().getFullYear());
