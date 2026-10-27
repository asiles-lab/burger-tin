const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RETRY_DELAYS_MINUTES = [2, 10, 30, 120, 360, 720];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function argentinaDate(value) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function buildSaleEmail({ store, order, items }) {
  const itemTotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const shipping = Math.max(0, Math.round((Number(order.subtotal || 0) - itemTotal) * 100) / 100);
  const delivery = order.fulfillment === 'delivery' ? 'Envío a domicilio' : 'Retiro en el local';
  const rows = items.map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e8ec">${Number(item.quantity)} × ${escapeHtml(item.name)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e8ec;text-align:right;white-space:nowrap">${money(item.unit_price)} c/u</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e8ec;text-align:right;white-space:nowrap;font-weight:700">${money(item.subtotal)}</td>
    </tr>`).join('');
  const shippingRow = shipping > 0 ? `
    <tr>
      <td colspan="2" style="padding:12px 8px;border-bottom:1px solid #e8e8ec">Envío</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e8ec;text-align:right;font-weight:700">${money(shipping)}</td>
    </tr>` : '';
  const address = order.fulfillment === 'delivery' && order.address
    ? `<p style="margin:6px 0"><strong>Dirección:</strong> ${escapeHtml(order.address)}</p>`
    : '';
  const phone = order.customer_phone
    ? `<p style="margin:6px 0"><strong>Teléfono:</strong> ${escapeHtml(order.customer_phone)}</p>`
    : '';
  const notes = order.notes
    ? `<div style="margin-top:18px;padding:14px 16px;background:#f6f5f8;border-radius:10px"><strong>Observaciones</strong><br>${escapeHtml(order.notes)}</div>`
    : '';

  const html = `<!doctype html>
  <html lang="es"><body style="margin:0;background:#f5f5f7;color:#191923;font-family:Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e4e4e8;border-radius:16px;overflow:hidden">
        <div style="padding:24px 28px;background:#151421;color:#ffffff">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Venta confirmada</div>
          <h1 style="margin:8px 0 0;font-size:28px">Pedido ${escapeHtml(order.code)}</h1>
        </div>
        <div style="padding:24px 28px">
          <p style="margin:0 0 18px">Mercado Pago confirmó el cobro. El pedido ya puede prepararse.</p>
          <p style="margin:6px 0"><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</p>
          ${phone}
          <p style="margin:6px 0"><strong>Entrega:</strong> ${delivery}</p>
          ${address}
          <p style="margin:6px 0"><strong>Confirmado:</strong> ${argentinaDate(order.confirmed_at)}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;font-size:14px">
            <thead><tr style="background:#f6f5f8">
              <th style="padding:10px 8px;text-align:left">Producto</th>
              <th style="padding:10px 8px;text-align:right">Precio</th>
              <th style="padding:10px 8px;text-align:right">Subtotal</th>
            </tr></thead>
            <tbody>${rows}${shippingRow}</tbody>
            <tfoot><tr>
              <td colspan="2" style="padding:16px 8px 4px;font-size:17px;font-weight:700">Total cobrado</td>
              <td style="padding:16px 8px 4px;text-align:right;font-size:20px;font-weight:700">${money(order.subtotal)}</td>
            </tr></tfoot>
          </table>
          ${notes}
          <p style="margin:22px 0 0;color:#666;font-size:12px">Notificación automática enviada por Restia para ${escapeHtml(store.name)}.</p>
        </div>
      </div>
    </div>
  </body></html>`;

  const itemLines = items.map(item => `${Number(item.quantity)} x ${item.name} · ${money(item.unit_price)} c/u · ${money(item.subtotal)}`);
  const text = [
    `Venta confirmada - Pedido ${order.code}`,
    '',
    'Mercado Pago confirmó el cobro. El pedido ya puede prepararse.',
    `Cliente: ${order.customer_name}`,
    order.customer_phone ? `Teléfono: ${order.customer_phone}` : '',
    `Entrega: ${delivery}`,
    order.fulfillment === 'delivery' && order.address ? `Dirección: ${order.address}` : '',
    `Confirmado: ${argentinaDate(order.confirmed_at)}`,
    '',
    ...itemLines,
    shipping > 0 ? `Envío: ${money(shipping)}` : '',
    `TOTAL COBRADO: ${money(order.subtotal)}`,
    order.notes ? `Observaciones: ${order.notes}` : ''
  ].filter(Boolean).join('\n');

  return {
    subject: `Venta confirmada ${order.code} · ${store.name}`,
    html,
    text
  };
}

async function notificationRecipient(env, storeId) {
  const configured = await env.DB.prepare(`
    SELECT value FROM store_settings
    WHERE store_id = ? AND key = 'sales_notification_email'
  `).bind(storeId).first();
  if (EMAIL_PATTERN.test(String(configured?.value || '').trim())) return String(configured.value).trim();

  const admin = await env.DB.prepare(`
    SELECT email FROM admin_profiles
    WHERE store_id = ? AND active = 1 AND email IS NOT NULL AND trim(email) <> ''
    ORDER BY CASE WHEN lower(role) = 'administrador' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1
  `).bind(storeId).first();
  const email = String(admin?.email || '').trim();
  return EMAIL_PATTERN.test(email) ? email : '';
}

export async function queueSaleNotification(env, storeId, orderId) {
  const enabled = await env.DB.prepare(`
    SELECT value FROM store_settings
    WHERE store_id = ? AND key = 'sales_notification_enabled'
  `).bind(storeId).first();
  if (String(enabled?.value || '') !== '1') return null;

  const recipient = await notificationRecipient(env, storeId);
  if (!recipient) {
    console.error('Sale notification skipped: no recipient configured', { storeId, orderId });
    return null;
  }
  const id = `sale-${storeId}-${orderId}`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO sale_email_notifications
      (id, store_id, order_id, recipient, status, attempts, created_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?)
  `).bind(id, storeId, orderId, recipient, new Date().toISOString()).run();
  return id;
}

function retryAt(attempts) {
  const minutes = RETRY_DELAYS_MINUTES[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function markFailure(env, id, attempts, message) {
  await env.DB.prepare(`
    UPDATE sale_email_notifications
    SET status = 'failed', next_attempt_at = ?, last_error = ?
    WHERE id = ?
  `).bind(retryAt(attempts), String(message || 'Error desconocido').slice(0, 500), id).run();
}

export async function sendSaleNotification(env, id) {
  const claimed = await env.DB.prepare(`
    UPDATE sale_email_notifications
    SET status = 'sending', attempts = attempts + 1, last_error = NULL
    WHERE id = ?
      AND status IN ('pending', 'failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    RETURNING id, store_id, order_id, recipient, attempts
  `).bind(id, new Date().toISOString()).first();
  if (!claimed) return false;

  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada.');
    const [store, order, itemResult] = await Promise.all([
      env.DB.prepare('SELECT id, name FROM stores WHERE id = ? AND active = 1').bind(claimed.store_id).first(),
      env.DB.prepare(`
        SELECT id, code, customer_name, customer_phone, fulfillment, address, notes,
               subtotal, confirmed_at, payment_method, status
        FROM orders WHERE store_id = ? AND id = ?
      `).bind(claimed.store_id, claimed.order_id).first(),
      env.DB.prepare(`
        SELECT name, quantity, unit_price, subtotal
        FROM order_items WHERE order_id = ? ORDER BY id ASC
      `).bind(claimed.order_id).all()
    ]);
    if (!store || !order || order.status !== 'confirmed' || order.payment_method !== 'mercadopago') {
      throw new Error('La venta confirmada ya no está disponible.');
    }
    const items = itemResult.results || [];
    if (!items.length) throw new Error('La venta no tiene productos.');
    const content = buildSaleEmail({ store, order, items });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'Idempotency-Key': `sale-confirmed/${claimed.store_id}/${claimed.order_id}`
      },
      body: JSON.stringify({
        from: env.SALES_EMAIL_FROM || 'Restia Ventas <notificaciones@restia.net.ar>',
        to: [claimed.recipient],
        subject: content.subject,
        html: content.html,
        text: content.text
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(`Resend HTTP ${response.status}: ${result.message || 'envío rechazado'}`);
    await env.DB.prepare(`
      UPDATE sale_email_notifications
      SET status = 'sent', sent_at = ?, provider_id = ?, next_attempt_at = NULL, last_error = NULL
      WHERE id = ?
    `).bind(new Date().toISOString(), String(result.id), claimed.id).run();
    return true;
  } catch (error) {
    console.error('Sale notification failed', { id: claimed.id, error: error.message });
    await markFailure(env, claimed.id, Number(claimed.attempts || 1), error.message);
    return false;
  }
}

export async function processPendingSaleNotifications(env) {
  const due = await env.DB.prepare(`
    SELECT id FROM sale_email_notifications
    WHERE status IN ('pending', 'failed')
      AND attempts < 12
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY created_at ASC
    LIMIT 10
  `).bind(new Date().toISOString()).all();
  for (const notification of due.results || []) await sendSaleNotification(env, notification.id);
}
