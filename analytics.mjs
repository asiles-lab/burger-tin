const EVENT_NAMES = new Set([
  'product_selected',
  'cart_add',
  'cart_open',
  'whatsapp_click',
  'engagement_time'
]);

const FORBIDDEN_KEYS = /name|nombre|address|direccion|notes|observaciones|email|phone|telefono|message|mensaje/i;
const queue = [];
let demo = '';
let enabled = false;

export function normalizeDemo(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 50);
}

function cleanUrl(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return String(value).split(/[?#]/, 1)[0];
  }
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  if (typeof next.url === 'string') next.url = cleanUrl(next.url);
  if (typeof next.referrer === 'string') next.referrer = cleanUrl(next.referrer);
  if (next.payload && typeof next.payload === 'object') next.payload = sanitizePayload(next.payload);
  return next;
}

function sanitizeEventData(data) {
  const safe = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 100);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
  }
  if (demo) safe.demo = demo;
  return safe;
}

function send(name, data) {
  if (!enabled || !window.umami || typeof window.umami.track !== 'function') return false;
  try {
    window.umami.track(name, data);
    return true;
  } catch {
    return false;
  }
}

function flushQueue() {
  while (queue.length) {
    const event = queue[0];
    if (!send(event.name, event.data)) break;
    queue.shift();
  }
}

export function trackEvent(name, data = {}) {
  if (!enabled || !EVENT_NAMES.has(name)) return;
  const event = { name, data: sanitizeEventData(data) };
  if (!send(event.name, event.data) && queue.length < 50) queue.push(event);
}

function startEngagementTimer() {
  const milestones = new Set([15, 30, 60, 120, 300]);
  let activeSeconds = 0;
  window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    activeSeconds += 5;
    if (milestones.delete(activeSeconds)) trackEvent('engagement_time', { seconds: activeSeconds });
  }, 5000);
}

export function initAnalytics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const config = window.BURGER_TIN_ANALYTICS || {};
  demo = normalizeDemo(new URLSearchParams(window.location.search).get('demo'));

  const websiteId = String(config.websiteId || '').trim();
  let scriptUrl;
  try { scriptUrl = new URL(String(config.scriptUrl || '')); } catch { return; }
  if (config.enabled !== true || !websiteId || scriptUrl.protocol !== 'https:') return;

  const consentKey = 'restia-analytics-consent-v1';
  const consent = localStorage.getItem(consentKey);
  if (consent !== 'accepted') {
    if (consent !== 'rejected') {
      const notice = document.createElement('aside');
      notice.className = 'consent-banner';
      notice.setAttribute('aria-label', 'Preferencias de analítica');
      notice.innerHTML = '<p><strong>Analítica respetuosa</strong><span>Usamos métricas anónimas para mejorar el menú. No grabamos sesiones ni enviamos los datos de tu pedido.</span></p><div><button type="button" data-consent="reject">Solo necesarias</button><button type="button" data-consent="accept">Aceptar analítica</button><a href="privacidad.html">Privacidad</a></div>';
      notice.addEventListener('click', event => {
        const choice = event.target.closest('[data-consent]')?.dataset.consent;
        if (!choice) return;
        localStorage.setItem(consentKey, choice === 'accept' ? 'accepted' : 'rejected');
        notice.remove();
        if (choice === 'accept') initAnalytics();
      });
      document.body.append(notice);
    }
    return;
  }
  enabled = true;
  window.burgerTinAnalyticsBeforeSend = (_type, payload) => sanitizePayload(payload);

  const script = document.createElement('script');
  script.defer = true;
  script.src = scriptUrl.href;
  script.dataset.websiteId = websiteId;
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.dataset.doNotTrack = 'true';
  script.dataset.beforeSend = 'burgerTinAnalyticsBeforeSend';
  if (demo) script.dataset.tag = `demo-${demo}`;
  if (Array.isArray(config.domains) && config.domains.length) {
    script.dataset.domains = config.domains.map(value => String(value).trim()).filter(Boolean).join(',');
  }
  script.addEventListener('load', () => {
    flushQueue();
    window.setTimeout(flushQueue, 250);
  });
  document.head.append(script);
  startEngagementTimer();
}
