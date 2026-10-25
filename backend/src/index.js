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

const ALL_ADMIN_PERMISSIONS = ['orders:view','orders:manage','products:manage','store:manage','reports:view','billing:manage','platform:manage'];
const STORE_PERMISSIONS = ALL_ADMIN_PERMISSIONS.filter(permission => permission !== 'platform:manage');
const PASSWORD_ITERATIONS = 120000;

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(byteLength = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(byteLength))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

function normalizedUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validCredentialMaterial(verifier, salt) {
  try {
    return base64ToBytes(verifier).length === 32 && base64ToBytes(salt).length === 16;
  } catch { return false; }
}

async function credentialDigest(env, verifier, salt) {
  if (!env.SETTINGS_ENCRYPTION_KEY) throw new Error('Falta configurar la clave privada del servidor.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SETTINGS_ENCRYPTION_KEY),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${salt}.${verifier}`));
  return bytesToBase64(new Uint8Array(signature));
}

async function verifierRecord(env, verifier, salt) {
  if (!validCredentialMaterial(verifier, salt)) throw new Error('Material de contraseña inválido.');
  return { salt, hash:await credentialDigest(env, verifier, salt), iterations:PASSWORD_ITERATIONS };
}

async function passwordChallenge(request, env) {
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const username = normalizedUsername(body.username);
  const scope = body.scope === 'platform' ? 'platform' : 'store';
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return publicJson(request, env, { error:'Ingresá un usuario válido.' }, 400);
  const profile = await env.DB.prepare('SELECT store_id, permissions, password_salt FROM admin_profiles WHERE lower(username) = ? AND active = 1').bind(username).first();
  const permissions = parsePermissions(profile?.permissions);
  const correctScope = scope === 'platform' ? permissions.includes('platform:manage') : profile?.store_id === 'burger-tin' && permissions.some(item => STORE_PERMISSIONS.includes(item));
  let salt = correctScope && profile?.password_salt ? profile.password_salt : '';
  if (!salt) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`restia:${scope}:${username}`));
    salt = bytesToBase64(new Uint8Array(digest).slice(0, 16));
  }
  return publicJson(request, env, { salt, iterations:PASSWORD_ITERATIONS });
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => ALL_ADMIN_PERMISSIONS.includes(item)) : [];
  } catch { return []; }
}

async function adminIdentity(request, env) {
  const supplied = bearer(request);
  if (!supplied) return null;
  const profile = await env.DB.prepare(`
    SELECT p.id, p.store_id, p.name, p.email, p.username, p.role, p.permissions, p.must_change_password
    FROM admin_sessions s JOIN admin_profiles p ON p.id = s.profile_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND p.active = 1
  `).bind(await sha256(supplied), new Date().toISOString()).first();
  if (!profile) return null;
  return { id:profile.id, name:profile.name, email:profile.email, username:profile.username, role:profile.role, storeId:profile.store_id, permissions:parsePermissions(profile.permissions), mustChangePassword:Boolean(profile.must_change_password) };
}

async function requireAdmin(request, env, permission) {
  const identity = await adminIdentity(request, env);
  return identity?.permissions.includes(permission) ? identity : null;
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Se esperaba JSON.');
  return request.json();
}

async function login(request, env) {
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const username = normalizedUsername(body.username);
  const passwordVerifier = String(body.passwordVerifier || '');
  const scope = body.scope === 'platform' ? 'platform' : 'store';
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !validCredentialMaterial(passwordVerifier, body.passwordSalt)) return publicJson(request, env, { error:'Usuario o contraseña incorrectos.' }, 401);
  const profile = await env.DB.prepare(`SELECT * FROM admin_profiles WHERE lower(username) = ? AND active = 1`).bind(username).first();
  const permissions = parsePermissions(profile?.permissions);
  const wrongScope = scope === 'platform' ? !permissions.includes('platform:manage') : (profile?.store_id !== 'burger-tin' || !permissions.some(item => STORE_PERMISSIONS.includes(item)));
  const locked = profile?.locked_until && new Date(profile.locked_until).getTime() > Date.now();
  let valid = false;
  if (profile?.password_hash && profile?.password_salt && !locked && !wrongScope) {
    const calculated = await credentialDigest(env, passwordVerifier, profile.password_salt);
    valid = timingSafeEqualText(calculated, profile.password_hash);
  }
  if (!valid) {
    if (profile && !locked) {
      const attempts = Number(profile.failed_attempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
      await env.DB.prepare('UPDATE admin_profiles SET failed_attempts = ?, locked_until = ? WHERE id = ?').bind(attempts >= 5 ? 0 : attempts, lockUntil, profile.id).run();
    }
    return publicJson(request, env, { error:locked?'Acceso bloqueado temporalmente. Intentá nuevamente en unos minutos.':'Usuario o contraseña incorrectos.' }, 401);
  }
  const session = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_profiles SET failed_attempts = 0, locked_until = NULL WHERE id = ?').bind(profile.id),
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now.toISOString()),
    env.DB.prepare('INSERT INTO admin_sessions (token_hash, profile_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(session), profile.id, now.toISOString(), expiresAt)
  ]);
  return publicJson(request, env, { session, expiresAt, user:{ id:profile.id, name:profile.name, email:profile.email, username:profile.username, role:profile.role, storeId:profile.store_id, permissions, mustChangePassword:Boolean(profile.must_change_password) } });
}

async function logoutSession(request, env) {
  const supplied = bearer(request);
  if (supplied) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(supplied)).run();
  return publicJson(request, env, { ok:true });
}

async function changePassword(request, env) {
  const identity = await adminIdentity(request, env);
  if (!identity) return publicJson(request, env, { error:'No autorizado.' }, 401);
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const passwordVerifier = String(body.passwordVerifier || ''), passwordSalt = String(body.passwordSalt || '');
  if (!validCredentialMaterial(passwordVerifier, passwordSalt)) return publicJson(request, env, { error:'No pudimos proteger la nueva contraseña.' }, 400);
  const record = await verifierRecord(env, passwordVerifier, passwordSalt);
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_profiles SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0, updated_at = ? WHERE id = ?').bind(record.hash, record.salt, record.iterations, new Date().toISOString(), identity.id),
    env.DB.prepare('DELETE FROM admin_sessions WHERE profile_id = ? AND token_hash != ?').bind(identity.id, await sha256(bearer(request)))
  ]);
  return publicJson(request, env, { ok:true });
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
  if (!(await requireAdmin(request, env, 'products:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
  return publicJson(request, env, { products: await catalogProducts(env) });
}

async function updateProduct(request, env, id) {
  if (!(await requireAdmin(request, env, 'products:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'products:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'products:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const result = await env.DB.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ? AND active = 1')
    .bind(new Date().toISOString(), id).run();
  if (!result.meta.changes) return publicJson(request, env, { error:'Producto inexistente.' }, 404);
  return publicJson(request, env, { ok:true });
}

async function adminSettings(request, env) {
  if (!(await requireAdmin(request, env, 'store:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
  return publicJson(request, env, { settings:await storeSettings(env) });
}

async function updateSettings(request, env) {
  if (!(await requireAdmin(request, env, 'store:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'products:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'orders:view'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'orders:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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
  if (!(await requireAdmin(request, env, 'orders:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
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

async function adminSession(request, env) {
  const identity = await adminIdentity(request, env);
  if (!identity) return publicJson(request, env, { error:'No autorizado.' }, 401);
  return publicJson(request, env, { user:identity });
}

async function reportSummary(request, env) {
  if (!(await requireAdmin(request, env, 'reports:view'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const result = await env.DB.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(subtotal), 0) AS revenue,
      COALESCE(AVG(subtotal), 0) AS average_ticket,
      COALESCE(SUM(CASE WHEN fulfillment = 'delivery' THEN 1 ELSE 0 END), 0) AS delivery_orders,
      COALESCE(SUM(CASE WHEN payment_method = 'mercadopago' THEN 1 ELSE 0 END), 0) AS online_orders
    FROM orders
    WHERE status = 'confirmed' AND datetime(confirmed_at) >= datetime('now', ?)
  `).bind(`-${days} days`).first();
  const top = await env.DB.prepare(`
    SELECT oi.name, SUM(oi.quantity) AS quantity
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'confirmed' AND datetime(o.confirmed_at) >= datetime('now', ?)
    GROUP BY oi.name ORDER BY quantity DESC, oi.name LIMIT 5
  `).bind(`-${days} days`).all();
  return publicJson(request, env, {
    days,
    summary:{
      orders:Number(result?.orders || 0), revenue:Number(result?.revenue || 0), averageTicket:Math.round(Number(result?.average_ticket || 0)),
      deliveryOrders:Number(result?.delivery_orders || 0), onlineOrders:Number(result?.online_orders || 0)
    },
    topProducts:top.results || []
  });
}

async function bootstrapPlatform(request, env) {
  if (!requireBearer(request, env.SUPERADMIN_TOKEN)) return publicJson(request, env, { error:'No autorizado.' }, 401);
  const existing = await env.DB.prepare("SELECT id FROM admin_profiles WHERE store_id = 'platform' AND username IS NOT NULL LIMIT 1").first();
  if (existing) return publicJson(request, env, { error:'El Super Admin ya fue inicializado.' }, 409);
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase(), username = normalizedUsername(body.username);
  const passwordVerifier = String(body.passwordVerifier || ''), passwordSalt = String(body.passwordSalt || '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z0-9._-]{3,40}$/.test(username) || !validCredentialMaterial(passwordVerifier, passwordSalt)) return publicJson(request, env, { error:'Revisá los datos del Super Admin.' }, 400);
  const record = await verifierRecord(env, passwordVerifier, passwordSalt), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO admin_profiles (id, store_id, name, email, username, role, permissions, token_hash, password_hash, password_salt, password_iterations, active, must_change_password, created_at, updated_at) VALUES (?, 'platform', ?, ?, ?, 'Superadmin', ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
    .bind(crypto.randomUUID(), name, email, username, JSON.stringify(['platform:manage']), await sha256(randomToken()), record.hash, record.salt, record.iterations, now, now).run();
  return publicJson(request, env, { ok:true }, 201);
}

async function platformProfiles(request, env) {
  if (!(await requireAdmin(request, env, 'platform:manage'))) return publicJson(request, env, { error:'No autorizado.' }, 401);
  if (request.method === 'GET') {
    const result = await env.DB.prepare(`SELECT id, store_id, name, email, username, role, permissions, active, must_change_password, created_at, updated_at FROM admin_profiles WHERE username IS NOT NULL ORDER BY store_id, name`).all();
    return publicJson(request, env, { stores:[{ id:'burger-tin', name:'Burger Tin', status:'Activo' }], profiles:(result.results || []).map(profile => ({ ...profile, permissions:parsePermissions(profile.permissions), active:Boolean(profile.active), mustChangePassword:Boolean(profile.must_change_password) })) });
  }
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const username = normalizedUsername(body.username);
  const passwordVerifier = String(body.passwordVerifier || '');
  const passwordSalt = String(body.passwordSalt || '');
  const role = String(body.role || '').trim();
  const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions.filter(item => ALL_ADMIN_PERMISSIONS.includes(item)))] : [];
  const scope = body.scope === 'platform' ? 'platform' : 'burger-tin';
  if (scope === 'platform' && !permissions.includes('platform:manage')) permissions.push('platform:manage');
  if (scope !== 'platform') {
    const platformIndex = permissions.indexOf('platform:manage');
    if (platformIndex >= 0) permissions.splice(platformIndex, 1);
  }
  if (permissions.includes('orders:manage') && !permissions.includes('orders:view')) permissions.push('orders:view');
  if (name.length < 2 || name.length > 80) return publicJson(request, env, { error:'Ingresá un nombre válido.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return publicJson(request, env, { error:'Ingresá un email válido.' }, 400);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return publicJson(request, env, { error:'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.' }, 400);
  if (!validCredentialMaterial(passwordVerifier, passwordSalt)) return publicJson(request, env, { error:'No pudimos proteger la contraseña inicial.' }, 400);
  if (role.length < 2 || role.length > 50 || !permissions.length) return publicJson(request, env, { error:'Elegí un rol y al menos un permiso.' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = await verifierRecord(env, passwordVerifier, passwordSalt);
  try {
    await env.DB.prepare(`INSERT INTO admin_profiles (id, store_id, name, email, username, role, permissions, token_hash, password_hash, password_salt, password_iterations, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
      .bind(id, scope, name, email, username, role, JSON.stringify(permissions), await sha256(randomToken()), record.hash, record.salt, record.iterations, now, now).run();
  } catch (error) {
    if (/unique/i.test(error.message)) return publicJson(request, env, { error:'Ese nombre de usuario ya existe.' }, 409);
    throw error;
  }
  return publicJson(request, env, { ok:true, id }, 201);
}

async function updatePlatformProfile(request, env, id) {
  const operator = await requireAdmin(request, env, 'platform:manage');
  if (!operator) return publicJson(request, env, { error:'No autorizado.' }, 401);
  let body;
  try { body = await readJson(request); } catch (error) { return publicJson(request, env, { error:error.message }, 400); }
  const current = await env.DB.prepare('SELECT id, permissions, active FROM admin_profiles WHERE id = ?').bind(id).first();
  if (!current) return publicJson(request, env, { error:'Perfil inexistente.' }, 404);
  const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions.filter(item => ALL_ADMIN_PERMISSIONS.includes(item)))] : parsePermissions(current.permissions);
  if (permissions.includes('orders:manage') && !permissions.includes('orders:view')) permissions.push('orders:view');
  const active = typeof body.active === 'boolean' ? body.active : Boolean(current.active);
  if (id === operator.id && !active) return publicJson(request, env, { error:'No podés desactivar tu propio usuario.' }, 409);
  const passwordVerifier = String(body.passwordVerifier || ''), passwordSalt = String(body.passwordSalt || '');
  const statements = [env.DB.prepare('UPDATE admin_profiles SET permissions = ?, active = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(permissions), active ? 1 : 0, new Date().toISOString(), id)];
  if (passwordVerifier || passwordSalt) {
    if (!validCredentialMaterial(passwordVerifier, passwordSalt)) return publicJson(request, env, { error:'No pudimos proteger la nueva contraseña.' }, 400);
    const record = await verifierRecord(env, passwordVerifier, passwordSalt);
    statements.push(env.DB.prepare('UPDATE admin_profiles SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 1 WHERE id = ?').bind(record.hash, record.salt, record.iterations, id));
    statements.push(env.DB.prepare('DELETE FROM admin_sessions WHERE profile_id = ?').bind(id));
  }
  await env.DB.batch(statements);
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
    if (request.method === 'POST' && url.pathname === '/api/auth/challenge') return passwordChallenge(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/login') return login(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') return logoutSession(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/change-password') return changePassword(request, env);
    if (request.method === 'POST' && url.pathname === '/api/platform/bootstrap') return bootstrapPlatform(request, env);
    if (request.method === 'POST' && url.pathname === '/api/webhooks/mercadopago') return mercadoPagoWebhook(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/session') return adminSession(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/orders') return listOrders(request, env);
    if (request.method === 'GET' && url.pathname === '/api/admin/reports/summary') return reportSummary(request, env);
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
    if (['GET','POST'].includes(request.method) && url.pathname === '/api/platform/profiles') return platformProfiles(request, env);
    const platformProfileMatch = url.pathname.match(/^\/api\/platform\/profiles\/([^/]+)$/);
    if (request.method === 'PATCH' && platformProfileMatch) return updatePlatformProfile(request, env, decodeURIComponent(platformProfileMatch[1]));
    if (request.method === 'GET' && url.pathname === '/api/print-jobs/next') return nextPrintJob(request, env);
    const ackMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/ack$/);
    if (request.method === 'POST' && ackMatch) return acknowledgePrint(request, env, decodeURIComponent(ackMatch[1]));
    return json({ error:'No encontrado.' }, 404);
  }
};
