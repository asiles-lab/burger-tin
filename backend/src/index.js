import store from '../../catalog.json' with { type: 'json' };
import { formatMoney, makeOrderCode, timingSafeEqualText, validateOrderInput } from './domain.js';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!origin || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-burger-tin-agent',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

function publicJson(request, env, data, status = 200) {
  return json(data, status, corsHeaders(request, env));
}

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function requireBearer(request, expected) {
  return Boolean(expected) && timingSafeEqualText(bearer(request), expected);
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Se esperaba JSON.');
  return request.json();
}

async function createOrder(request, env) {
  let order;
  try { order = validateOrderInput(await readJson(request), store.products); }
  catch (error) { return publicJson(request, env, { error: error.message }, 400); }

  const code = makeOrderCode();
  const now = new Date().toISOString();
  const status = order.paymentMethod === 'cash' ? 'pending_cash' : 'pending_payment';
  const inserted = await env.DB.prepare(`
    INSERT INTO orders (code, customer_name, fulfillment, address, notes, payment_method, status, subtotal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(code, order.name, order.fulfillment, order.address || null, order.notes || null, order.paymentMethod, status, order.subtotal, now).run();
  const orderId = inserted.meta.last_row_id;
  await env.DB.batch(order.items.map(item => env.DB.prepare(`
    INSERT INTO order_items (order_id, product_id, name, quantity, unit_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(orderId, item.productId, item.name, item.quantity, item.unitPrice, item.subtotal)));

  if (order.paymentMethod === 'mercadopago') {
    try {
      const checkout = await createMercadoPagoCheckout(env, code, order);
      await env.DB.prepare('UPDATE orders SET mp_preference_id = ? WHERE id = ?').bind(checkout.preferenceId, orderId).run();
      return publicJson(request, env, { code, status, paymentMethod: order.paymentMethod, checkoutUrl: checkout.url }, 201);
    } catch (error) {
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      console.error('Mercado Pago preference error', error.message);
      return publicJson(request, env, { error: 'No pudimos iniciar Mercado Pago. Proba nuevamente o elegi efectivo.' }, 502);
    }
  }

  return publicJson(request, env, {
    code,
    status,
    paymentMethod: order.paymentMethod,
    whatsappUrl: buildWhatsAppUrl(env, code, order)
  }, 201);
}

async function createMercadoPagoCheckout(env, code, order) {
  if (!env.MP_ACCESS_TOKEN || !env.PUBLIC_API_URL || !env.PUBLIC_SITE_URL) throw new Error('Mercado Pago no esta configurado.');
  const body = {
    items: order.items.map(item => ({
      id: item.productId,
      title: item.name,
      currency_id: 'ARS',
      quantity: item.quantity,
      unit_price: item.unitPrice
    })),
    external_reference: code,
    notification_url: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${env.PUBLIC_SITE_URL}?payment=success&order=${encodeURIComponent(code)}`,
      pending: `${env.PUBLIC_SITE_URL}?payment=pending&order=${encodeURIComponent(code)}`,
      failure: `${env.PUBLIC_SITE_URL}?payment=failure&order=${encodeURIComponent(code)}`
    },
    auto_return: 'approved',
    statement_descriptor: 'BURGER TIN',
    metadata: { burger_tin_order: code }
  };
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', 'x-idempotency-key': code },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.id) throw new Error(`Mercado Pago HTTP ${response.status}`);
  const url = env.PAYMENTS_MODE === 'production' ? result.init_point : (result.sandbox_init_point || result.init_point);
  return { preferenceId: result.id, url };
}

function buildWhatsAppUrl(env, code, order) {
  const lines = [
    `Hola Burger Tin, hice el pedido ${code}:`, '',
    `Nombre: ${order.name}`,
    `Modalidad: ${order.fulfillment === 'delivery' ? 'Envio a domicilio' : 'Retiro en el local'}`
  ];
  if (order.fulfillment === 'delivery') lines.push(`Direccion: ${order.address}`);
  lines.push('', ...order.items.map(item => `${item.quantity} x ${item.name} - ${formatMoney(item.subtotal)}`), '', `Subtotal: ${formatMoney(order.subtotal)}`, 'Pago: efectivo');
  if (order.notes) lines.push(`Observaciones: ${order.notes}`);
  lines.push('', '¿Me confirman disponibilidad y tiempo de preparacion?');
  return `https://wa.me/${env.WHATSAPP_PHONE}?text=${encodeURIComponent(lines.join('\n'))}`;
}

async function verifyWebhook(request, env, dataId) {
  const signature = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=', 2)));
  if (!parts.ts || !parts.v1 || !requestId || !dataId || !env.MP_WEBHOOK_SECRET) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MP_WEBHOOK_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const calculated = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualText(calculated, parts.v1);
}

async function mercadoPagoWebhook(request, env) {
  const url = new URL(request.url);
  let body = {};
  try { body = await request.json(); } catch {}
  const dataId = url.searchParams.get('data.id') || String(body?.data?.id || '');
  if (!(await verifyWebhook(request, env, dataId))) return new Response('', { status: 401 });
  if (!dataId) return new Response('', { status: 200 });

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` }
  });
  if (!paymentResponse.ok) return new Response('', { status: 200 });
  const payment = await paymentResponse.json();
  if (payment.status !== 'approved' || payment.currency_id !== 'ARS' || !payment.external_reference) return new Response('', { status: 200 });

  const order = await env.DB.prepare('SELECT id, code, subtotal, status FROM orders WHERE code = ?').bind(payment.external_reference).first();
  if (!order || Number(payment.transaction_amount) !== Number(order.subtotal)) return new Response('', { status: 200 });
  await confirmOrder(env, order.id, String(payment.id));
  return new Response('', { status: 200 });
}

async function confirmOrder(env, orderId, paymentId = null) {
  const now = new Date().toISOString();
  const order = await env.DB.prepare('SELECT id, status FROM orders WHERE id = ?').bind(orderId).first();
  if (!order || order.status === 'cancelled') throw new Error('Pedido inexistente o cancelado.');
  if (order.status !== 'confirmed') {
    await env.DB.prepare("UPDATE orders SET status = 'confirmed', confirmed_at = ?, mp_payment_id = COALESCE(?, mp_payment_id) WHERE id = ?")
      .bind(now, paymentId, orderId).run();
  }
  const jobId = `print-${orderId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO print_jobs (id, order_id, status, created_at) VALUES (?, ?, 'queued', ?)")
    .bind(jobId, orderId, now).run();
}

async function listOrders(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const result = await env.DB.prepare(`
    SELECT o.*, pj.status AS print_status
    FROM orders o LEFT JOIN print_jobs pj ON pj.order_id = o.id
    WHERE o.status <> 'cancelled'
    ORDER BY o.created_at DESC LIMIT 100
  `).all();
  return publicJson(request, env, { orders: result.results || [] });
}

async function staffAction(request, env, code, action) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const order = await env.DB.prepare('SELECT id, status, payment_method FROM orders WHERE code = ?').bind(code).first();
  if (!order) return publicJson(request, env, { error:'Pedido inexistente.' }, 404);
  if (action === 'confirm') {
    if (order.payment_method !== 'cash') return publicJson(request, env, { error:'Mercado Pago solo se confirma mediante Webhook.' }, 409);
    await confirmOrder(env, order.id);
  } else if (action === 'cancel') {
    if (!['pending_cash', 'pending_payment'].includes(order.status)) return publicJson(request, env, { error:'Solo se pueden cancelar pedidos pendientes.' }, 409);
    await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(order.id).run();
  } else if (action === 'reprint') {
    if (order.status !== 'confirmed') return publicJson(request, env, { error:'El pedido aun no esta confirmado.' }, 409);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE print_jobs SET status='queued', device_id=NULL, leased_until=NULL, last_error=NULL, created_at=? WHERE order_id=?")
      .bind(now, order.id).run();
  }
  return publicJson(request, env, { ok:true });
}

async function nextPrintJob(request, env) {
  if (!requireBearer(request, env.DEVICE_TOKEN)) return json({ error:'No autorizado.' }, 401);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  if (!deviceId || deviceId.length > 100) return json({ error:'Dispositivo invalido.' }, 400);
  const now = new Date();
  const job = await env.DB.prepare(`
    SELECT pj.id, pj.order_id FROM print_jobs pj
    WHERE pj.status='queued' OR (pj.status='leased' AND pj.leased_until < ?)
    ORDER BY pj.created_at LIMIT 1
  `).bind(now.toISOString()).first();
  if (!job) return json(null);
  const leaseUntil = new Date(now.getTime() + 60000).toISOString();
  const claimed = await env.DB.prepare(`
    UPDATE print_jobs SET status='leased', device_id=?, leased_until=?, attempts=attempts+1
    WHERE id=? AND (status='queued' OR (status='leased' AND leased_until < ?))
  `).bind(deviceId, leaseUntil, job.id, now.toISOString()).run();
  if (!claimed.meta.changes) return json(null);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(job.order_id).first();
  const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(job.order_id).all();
  return json({
    id: job.id,
    order: {
      id: order.code,
      confirmedAt: order.confirmed_at,
      customerName: order.customer_name,
      address: order.address,
      deliveryMethod: order.fulfillment === 'delivery' ? 'Envio a domicilio' : 'Retiro en el local',
      paymentMethod: order.payment_method === 'cash' ? 'Efectivo confirmado' : 'Mercado Pago aprobado',
      notes: order.notes,
      total: formatMoney(order.subtotal),
      items: (items.results || []).map(item => ({ quantity:item.quantity, name:item.name, subtotal:formatMoney(item.subtotal), notes:'' }))
    }
  });
}

async function acknowledgePrint(request, env, id) {
  if (!requireBearer(request, env.DEVICE_TOKEN)) return json({ error:'No autorizado.' }, 401);
  const body = await readJson(request);
  if (!['printed', 'already_printed', 'failed'].includes(body.status)) return json({ error:'Estado invalido.' }, 400);
  if (body.status === 'failed') {
    await env.DB.prepare("UPDATE print_jobs SET status='queued', leased_until=NULL, last_error=? WHERE id=?")
      .bind(String(body.error || 'Error de impresion').slice(0, 300), id).run();
  } else {
    await env.DB.prepare("UPDATE print_jobs SET status='printed', printed_at=?, leased_until=NULL WHERE id=?")
      .bind(new Date().toISOString(), id).run();
  }
  return json({ ok:true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response('', { status:204, headers:corsHeaders(request, env) });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok:true, service:'burger-tin-orders' });
    if (request.method === 'POST' && url.pathname === '/api/orders') return createOrder(request, env);
    if (request.method === 'POST' && url.pathname === '/api/webhooks/mercadopago') return mercadoPagoWebhook(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/orders') return listOrders(request, env);
    const staffMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/(confirm|reprint|cancel)$/);
    if (request.method === 'POST' && staffMatch) return staffAction(request, env, decodeURIComponent(staffMatch[1]), staffMatch[2]);
    if (request.method === 'GET' && url.pathname === '/api/print-jobs/next') return nextPrintJob(request, env);
    const ackMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/ack$/);
    if (request.method === 'POST' && ackMatch) return acknowledgePrint(request, env, decodeURIComponent(ackMatch[1]));
    return json({ error:'No encontrado.' }, 404);
  }
};
