import store from '../../catalog.json' with { type: 'json' };
import { formatMoney, formatOrderCode, timingSafeEqualText, validateOrderInput } from './domain.js';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!origin || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

function settingMap(rows) {
  return Object.fromEntries((rows || []).map(row => [row.key, row.value]));
}

async function rawSettings(env) {
  const result = await env.DB.prepare('SELECT key, value FROM store_settings').all();
  return settingMap(result.results);
}

async function storeSettings(env) {
  const values = await rawSettings(env);
  const primary = /^#[0-9a-f]{6}$/i.test(values.admin_primary || '') ? values.admin_primary : '#35173f';
  const accent = /^#[0-9a-f]{6}$/i.test(values.admin_accent || '') ? values.admin_accent : '#f52e25';
  const applyToStore = values.apply_colors_to_store === '1';
  return {
    business: values.business || store.business,
    phone: values.phone || env.WHATSAPP_PHONE || store.phone,
    pickupAddress: values.pickup_address || store.pickupAddress,
    deliveryZones: values.delivery_zones || store.deliveryZones,
    adminPrimary: primary,
    adminAccent: accent,
    applyColorsToStore: applyToStore,
    storePrimary: applyToStore ? primary : '#341747',
    storeAccent: applyToStore ? accent : '#f5251b',
    mercadoPagoEnabled: Boolean((values.mp_access_token && values.mp_webhook_secret) || (env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET))
  };
}

function bytesToBase64(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function encryptionKey(env) {
  if (!env.SETTINGS_ENCRYPTION_KEY) throw new Error('Falta configurar la clave privada del servidor.');
  const bytes = base64ToBytes(env.SETTINGS_ENCRYPTION_KEY);
  if (bytes.byteLength !== 32) throw new Error('La clave privada del servidor es inválida.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptSetting(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await encryptionKey(env), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptSetting(env, value) {
  const [ivText, dataText] = String(value || '').split('.', 2);
  if (!ivText || !dataText) return '';
  const decrypted = await crypto.subtle.decrypt({ name:'AES-GCM', iv:base64ToBytes(ivText) }, await encryptionKey(env), base64ToBytes(dataText));
  return new TextDecoder().decode(decrypted);
}

async function paymentCredentials(env) {
  const values = await rawSettings(env);
  return {
    accessToken: values.mp_access_token ? await decryptSetting(env, values.mp_access_token) : String(env.MP_ACCESS_TOKEN || ''),
    webhookSecret: values.mp_webhook_secret ? await decryptSetting(env, values.mp_webhook_secret) : String(env.MP_WEBHOOK_SECRET || '')
  };
}

function upsertSetting(env, key, value, secret = 0) {
  return env.DB.prepare(`
    INSERT INTO store_settings (key, value, secret, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, secret=excluded.secret, updated_at=excluded.updated_at
  `).bind(key, value, secret, new Date().toISOString());
}

async function ensureProducts(env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM products').first();
  if (Number(row?.total) > 0) return;
  const now = new Date().toISOString();
  await env.DB.batch(store.products.map((product, index) => env.DB.prepare(`
    INSERT OR IGNORE INTO products (id, name, description, category, price, default_image, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(product.id, product.name, product.description || '', product.category, product.price, product.image || null, index, now)));
}

function catalogImage(env, product) {
  if (!product.image_type) return product.default_image || '';
  const base = String(env.PUBLIC_API_URL || '').replace(/\/$/, '');
  return `${base}/api/catalog/images/${encodeURIComponent(product.id)}?v=${encodeURIComponent(product.image_updated_at || product.updated_at)}`;
}

async function catalogProducts(env) {
  await ensureProducts(env);
  const result = await env.DB.prepare(`
    SELECT id, name, description, category, price, default_image, image_type, image_updated_at, updated_at
    FROM products WHERE active = 1 ORDER BY sort_order, name
  `).all();
  return (result.results || []).map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: Number(product.price),
    image: catalogImage(env, product),
    customImage: Boolean(product.image_type),
    updatedAt: product.updated_at
  }));
}

async function getCatalog(request, env) {
  try {
    const settings = await storeSettings(env);
    return publicJson(request, env, {
      ...store,
      business: settings.business,
      phone: settings.phone,
      pickupAddress: settings.pickupAddress,
      deliveryZones: settings.deliveryZones,
      mercadoPagoEnabled: settings.mercadoPagoEnabled,
      theme: { primary:settings.storePrimary, accent:settings.storeAccent },
      products: await catalogProducts(env)
    });
  }
  catch (error) {
    console.error('Catalog error', error.message);
    return publicJson(request, env, { error:'No pudimos cargar el catalogo.' }, 503);
  }
}

async function getCatalogImage(request, env, id) {
  const product = await env.DB.prepare('SELECT image_data, image_type, image_updated_at FROM products WHERE id = ?').bind(id).first();
  if (!product?.image_data || !product.image_type) return publicJson(request, env, { error:'Imagen inexistente.' }, 404);
  return new Response(product.image_data, { headers:{
    'content-type': product.image_type,
    'cache-control': 'public, max-age=31536000, immutable',
    etag: `"${product.image_updated_at || id}"`,
    ...corsHeaders(request, env)
  }});
}

async function adminCatalog(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  return publicJson(request, env, { products: await catalogProducts(env) });
}

async function updateProduct(request, env, id) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  let body;
  try { body = await readJson(request); }
  catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (name.length < 2 || name.length > 100) return publicJson(request, env, { error:'Ingresá un nombre válido.' }, 400);
  if (!Number.isInteger(price) || price < 1 || price > 10000000) return publicJson(request, env, { error:'Ingresá un precio válido.' }, 400);
  const result = await env.DB.prepare('UPDATE products SET name = ?, price = ?, updated_at = ? WHERE id = ? AND active = 1')
    .bind(name, price, new Date().toISOString(), id).run();
  if (!result.meta.changes) return publicJson(request, env, { error:'Producto inexistente.' }, 404);
  return publicJson(request, env, { ok:true });
}

async function addProduct(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  let body;
  try { body = await readJson(request); }
  catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (name.length < 2 || name.length > 100 || !Number.isInteger(price) || price < 1 || price > 10000000) return publicJson(request, env, { error:'Revisá el nombre y el precio.' }, 400);
  const id = `product-${crypto.randomUUID().slice(0, 8)}`;
  const order = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM products').first();
  await env.DB.prepare(`
    INSERT INTO products (id, name, description, category, price, default_image, sort_order, updated_at, active)
    VALUES (?, ?, '', 'Productos', ?, NULL, ?, ?, 1)
  `).bind(id, name, price, Number(order?.next_order || 0), new Date().toISOString()).run();
  return publicJson(request, env, { ok:true, id }, 201);
}

async function deleteProduct(request, env, id) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const result = await env.DB.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ? AND active = 1')
    .bind(new Date().toISOString(), id).run();
  if (!result.meta.changes) return publicJson(request, env, { error:'Producto inexistente.' }, 404);
  return publicJson(request, env, { ok:true });
}

async function adminSettings(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  return publicJson(request, env, { settings:await storeSettings(env) });
}

async function updateSettings(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  let body;
  try { body = await readJson(request); }
  catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const business = String(body.business || '').trim();
  const pickupAddress = String(body.pickupAddress || '').trim();
  const phone = String(body.phone || '').replace(/\D/g, '');
  const deliveryZones = String(body.deliveryZones || '').trim();
  const adminPrimary = String(body.adminPrimary || '').toLowerCase();
  const adminAccent = String(body.adminAccent || '').toLowerCase();
  if (business.length < 2 || business.length > 80) return publicJson(request, env, { error:'Ingresá un nombre de local válido.' }, 400);
  if (pickupAddress.length < 5 || pickupAddress.length > 200) return publicJson(request, env, { error:'Ingresá una dirección válida.' }, 400);
  if (phone.length < 10 || phone.length > 15) return publicJson(request, env, { error:'Ingresá el teléfono con código de país y área.' }, 400);
  if (deliveryZones.length > 250) return publicJson(request, env, { error:'Las zonas de entrega son demasiado largas.' }, 400);
  if (!/^#[0-9a-f]{6}$/.test(adminPrimary) || !/^#[0-9a-f]{6}$/.test(adminAccent)) return publicJson(request, env, { error:'Elegí colores válidos.' }, 400);
  const statements = [
    upsertSetting(env, 'business', business),
    upsertSetting(env, 'pickup_address', pickupAddress),
    upsertSetting(env, 'phone', phone),
    upsertSetting(env, 'delivery_zones', deliveryZones),
    upsertSetting(env, 'admin_primary', adminPrimary),
    upsertSetting(env, 'admin_accent', adminAccent),
    upsertSetting(env, 'apply_colors_to_store', body.applyColorsToStore ? '1' : '0')
  ];
  if (body.disconnectMercadoPago) {
    statements.push(env.DB.prepare("DELETE FROM store_settings WHERE key IN ('mp_access_token','mp_webhook_secret')"));
  } else {
    const accessToken = String(body.mpAccessToken || '').trim();
    const webhookSecret = String(body.mpWebhookSecret || '').trim();
    if ((accessToken && !webhookSecret) || (!accessToken && webhookSecret)) return publicJson(request, env, { error:'Para conectar Mercado Pago completá ambas credenciales.' }, 400);
    if (accessToken && webhookSecret) {
      statements.push(upsertSetting(env, 'mp_access_token', await encryptSetting(env, accessToken), 1));
      statements.push(upsertSetting(env, 'mp_webhook_secret', await encryptSetting(env, webhookSecret), 1));
    }
  }
  await env.DB.batch(statements);
  return publicJson(request, env, { ok:true, settings:await storeSettings(env) });
}

async function updateProductImage(request, env, id) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const type = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return publicJson(request, env, { error:'Usá una imagen JPG, PNG o WebP.' }, 415);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 900000) return publicJson(request, env, { error:'La imagen supera el máximo de 900 KB.' }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 100 || bytes.byteLength > 900000) return publicJson(request, env, { error:'La imagen está vacía o es demasiado pesada.' }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE products SET image_data = ?, image_type = ?, image_updated_at = ?, updated_at = ? WHERE id = ?
  `).bind(bytes, type, now, now, id).run();
  if (!result.meta.changes) return publicJson(request, env, { error:'Producto inexistente.' }, 404);
  return publicJson(request, env, { ok:true, image:`${String(env.PUBLIC_API_URL || '').replace(/\/$/, '')}/api/catalog/images/${encodeURIComponent(id)}?v=${encodeURIComponent(now)}` });
}

async function createOrder(request, env) {
  let order;
  let settings;
  try {
    settings = await storeSettings(env);
    order = validateOrderInput(await readJson(request), await catalogProducts(env));
    if (order.paymentMethod === 'mercadopago' && !settings.mercadoPagoEnabled) throw new Error('Mercado Pago no está habilitado. Elegí efectivo.');
  }
  catch (error) { return publicJson(request, env, { error: error.message }, 400); }

  let code;
  try {
    const counter = await env.DB.prepare(`
      UPDATE order_counters
      SET value = value + 1
      WHERE name = 'orders'
      RETURNING value
    `).first();
    code = formatOrderCode(Number(counter?.value));
    const previous = await env.DB.prepare('SELECT id, status FROM orders WHERE code = ?').bind(code).first();
    if (previous) {
      if (['pending_cash', 'pending_payment'].includes(previous.status)) throw new Error('El numero ciclico aun pertenece a un pedido pendiente.');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM print_jobs WHERE order_id = ?').bind(previous.id),
        env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(previous.id),
        env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(previous.id)
      ]);
    }
  } catch (error) {
    console.error('Order sequence error', error.message);
    return publicJson(request, env, { error: 'No pudimos asignar el numero de pedido. Proba nuevamente.' }, 503);
  }
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
    whatsappUrl: buildWhatsAppUrl(settings, code, order)
  }, 201);
}

async function createMercadoPagoCheckout(env, code, order) {
  const credentials = await paymentCredentials(env);
  if (!credentials.accessToken || !env.PUBLIC_API_URL || !env.PUBLIC_SITE_URL) throw new Error('Mercado Pago no esta configurado.');
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
    headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type':'application/json', 'x-idempotency-key':code },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.id) throw new Error(`Mercado Pago HTTP ${response.status}`);
  const url = env.PAYMENTS_MODE === 'production' ? result.init_point : (result.sandbox_init_point || result.init_point);
  return { preferenceId: result.id, url };
}

function buildWhatsAppUrl(settings, code, order) {
  const lines = [
    `Hola ${settings.business}, hice el pedido ${code}:`, '',
    `Nombre: ${order.name}`,
    `Modalidad: ${order.fulfillment === 'delivery' ? 'Envio a domicilio' : 'Retiro en el local'}`
  ];
  if (order.fulfillment === 'delivery') lines.push(`Direccion: ${order.address}`);
  lines.push('', ...order.items.map(item => `${item.quantity} x ${item.name} - ${formatMoney(item.subtotal)}`), '', `Subtotal: ${formatMoney(order.subtotal)}`, 'Pago: efectivo');
  if (order.notes) lines.push(`Observaciones: ${order.notes}`);
  lines.push('', '¿Me confirman disponibilidad y tiempo de preparacion?');
  return `https://wa.me/${settings.phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

async function verifyWebhook(request, env, dataId) {
  const signature = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=', 2)));
  const credentials = await paymentCredentials(env);
  if (!parts.ts || !parts.v1 || !requestId || !dataId || !credentials.webhookSecret) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(credentials.webhookSecret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
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

  const credentials = await paymentCredentials(env);
  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { authorization:`Bearer ${credentials.accessToken}` }
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
  const view = new URL(request.url).searchParams.get('view') || 'pending';
  const queries = {
    pending: `o.status IN ('pending_cash', 'pending_payment')`,
    today: `o.status = 'confirmed' AND date(o.confirmed_at, '-3 hours') = date('now', '-3 hours')`,
    history: `o.status = 'confirmed' AND date(o.confirmed_at, '-3 hours') < date('now', '-3 hours')`
  };
  if (!queries[view]) return publicJson(request, env, { error:'Vista invalida.' }, 400);
  const direction = view === 'pending' ? 'ASC' : 'DESC';
  const limit = view === 'history' ? 500 : 250;
  const [result, counts] = await env.DB.batch([
    env.DB.prepare(`
    SELECT o.*, pj.status AS print_status
    FROM orders o LEFT JOIN print_jobs pj ON pj.order_id = o.id
    WHERE ${queries[view]}
    ORDER BY o.created_at ${direction} LIMIT ${limit}
    `),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('pending_cash', 'pending_payment') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'confirmed' AND date(confirmed_at, '-3 hours') = date('now', '-3 hours') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN status = 'confirmed' AND date(confirmed_at, '-3 hours') < date('now', '-3 hours') THEN 1 ELSE 0 END) AS history
      FROM orders
    `)
  ]);
  return publicJson(request, env, { orders: result.results || [], counts: counts.results?.[0] || {} });
}

async function clearHistory(request, env) {
  if (!requireBearer(request, env.STAFF_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const pending = await env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status IN ('pending_cash', 'pending_payment')").first();
  if (Number(pending?.total) > 0) return publicJson(request, env, { error:'Primero confirma o cancela todos los pedidos pendientes.' }, 409);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM print_jobs WHERE order_id IN (SELECT id FROM orders WHERE status IN ('confirmed', 'cancelled'))"),
    env.DB.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('confirmed', 'cancelled'))"),
    env.DB.prepare("DELETE FROM orders WHERE status IN ('confirmed', 'cancelled')"),
    env.DB.prepare("UPDATE order_counters SET value = 0 WHERE name = 'orders'")
  ]);
  return publicJson(request, env, { ok:true, nextCode:'A-001' });
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
      items: (items.results || []).map(item => ({ quantity:item.quantity, name:item.name, notes:'' }))
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
    if (request.method === 'GET' && url.pathname === '/api/catalog') return getCatalog(request, env);
    const catalogImageMatch = url.pathname.match(/^\/api\/catalog\/images\/([^/]+)$/);
    if (request.method === 'GET' && catalogImageMatch) return getCatalogImage(request, env, decodeURIComponent(catalogImageMatch[1]));
    if (request.method === 'POST' && url.pathname === '/api/orders') return createOrder(request, env);
    if (request.method === 'POST' && url.pathname === '/api/webhooks/mercadopago') return mercadoPagoWebhook(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/orders') return listOrders(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/catalog') return adminCatalog(request, env);
    if (request.method === 'POST' && url.pathname === '/api/admin/products') return addProduct(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/settings') return adminSettings(request, env);
    if (request.method === 'PATCH' && url.pathname === '/api/admin/settings') return updateSettings(request, env);
    const productMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (request.method === 'PATCH' && productMatch) return updateProduct(request, env, decodeURIComponent(productMatch[1]));
    if (request.method === 'DELETE' && productMatch) return deleteProduct(request, env, decodeURIComponent(productMatch[1]));
    const productImageMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/image$/);
    if (request.method === 'POST' && productImageMatch) return updateProductImage(request, env, decodeURIComponent(productImageMatch[1]));
    if (request.method === 'DELETE' && url.pathname === '/api/admin/history') return clearHistory(request, env);
    const staffMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/(confirm|reprint|cancel)$/);
    if (request.method === 'POST' && staffMatch) return staffAction(request, env, decodeURIComponent(staffMatch[1]), staffMatch[2]);
    if (request.method === 'GET' && url.pathname === '/api/print-jobs/next') return nextPrintJob(request, env);
    const ackMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/ack$/);
    if (request.method === 'POST' && ackMatch) return acknowledgePrint(request, env, decodeURIComponent(ackMatch[1]));
    return json({ error:'No encontrado.' }, 404);
  }
};
