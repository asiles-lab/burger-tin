import { mailSettings, compose } from './glowro-commerce.js';
const INTERNAL = 'rodiazhtc@gmail.com';
const SENDER = 'Atencionglowro@restia.net.ar';
const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const money = value => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS'}).format(Number(value || 0));

export function buildGlowroConfirmation(order, items, kind) {
  const subtotal = Number(order.product_subtotal ?? items.reduce((sum, item) => sum + Number(item.subtotal), 0));
  const shipping = Number(order.shipping_fee || 0);
  const discount = Math.max(0, subtotal + shipping - Number(order.total));
  const delivery = order.fulfillment === 'pickup' ? 'Retiro' : (String(order.notes || '').includes('Envío a coordinar: costo no incluido') ? 'Envío a coordinar (costo no incluido)' : 'Envío a domicilio');
  const lines = items.map(item => `${item.quantity} × ${item.name} — ${money(item.subtotal)}`);
  const intro = kind === 'buyer' ? '¡Gracias por tu compra! Tu pago fue confirmado.' : 'Mercado Pago confirmó el pago de este pedido.';
  const summary = [`Pedido ${order.code}`, intro, ...lines, `Subtotal: ${money(subtotal)}`, `Descuentos: ${money(discount)}`, `Envío: ${money(shipping)}`, `Total: ${money(order.total)}`, `Entrega: ${delivery}`];
  if (order.address) summary.push(`Dirección: ${order.address}`);
  if (kind === 'internal') summary.push(`Cliente: ${order.customer_name}`, `Email: ${order.customer_email}`, `Teléfono: ${order.customer_phone || '—'}`);
  const html = `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#faf4f1;color:#292126;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px 20px"><div style="background:#fff;padding:32px;border:1px solid #eadbd9;border-radius:18px"><img width="160" alt="GlowRo" src="https://glowro.restia.net.ar/assets/glowro-wordmark-dark.png"><p style="letter-spacing:.2em;color:#985d68;font-size:13px">GLOWRO · SKIN &amp; BODY CARE</p><h1 style="font-size:28px">${escape(intro)}</h1><p>Pedido <strong>${escape(order.code)}</strong></p><table style="width:100%;border-collapse:collapse"><tbody>${items.map(item=>`<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${Number(item.quantity)} × ${escape(item.name)}</td><td style="text-align:right">${money(item.subtotal)}</td></tr>`).join('')}</tbody></table><p>Subtotal: ${money(subtotal)}<br>Descuentos: ${money(discount)}<br>Envío: ${money(shipping)}<br><strong>Total: ${money(order.total)}</strong></p><p>Entrega: ${escape(delivery)}${order.address ? `<br>${escape(order.address)}` : ''}</p>${kind === 'internal' ? `<p>Cliente: ${escape(order.customer_name)}<br>Email: ${escape(order.customer_email)}<br>Teléfono: ${escape(order.customer_phone || '—')}</p>` : '<p>Ya estamos preparando tu pedido con mucho cariño.</p>'}</div></div></body></html>`;
  return { subject:`${kind === 'buyer' ? 'Tu compra confirmada' : 'Venta aprobada'} ${order.code} · GlowRo`, text:summary.join('\n'), html };
}

export async function queueGlowroConfirmations(env, orderId) {
  const order = await env.DB.prepare("SELECT id, customer_email FROM orders WHERE id = ? AND store_id = 'glowro' AND status = 'confirmed' AND payment_method = 'mercadopago' AND mp_payment_id IS NOT NULL").bind(orderId).first();
  if (!order) return;
  const jobs = [['internal', INTERNAL]];
  if (order.customer_email) jobs.push(['buyer', order.customer_email]);
  await env.DB.batch(jobs.map(([kind, recipient]) => env.DB.prepare("INSERT OR IGNORE INTO glowro_confirmation_emails(order_id, kind, recipient) VALUES (?, ?, ?)").bind(orderId, kind, recipient)));
}

export async function sendGlowroConfirmation(env, orderId, kind) {
  const now = new Date();
  const lease = new Date(now.getTime() + 5 * 60_000).toISOString();
  // Resend keeps idempotency keys for 24h; after that an ambiguous send requires manual review.
  await env.DB.prepare("UPDATE glowro_confirmation_emails SET status='uncertain', last_error='Resultado incierto: requiere revisión manual' WHERE order_id=? AND kind=? AND (status='failed' OR (status='sending' AND lease_until < ?)) AND first_attempt_at < ?").bind(orderId,kind,now.toISOString(),new Date(now.getTime()-23*60*60_000).toISOString()).run();
  const job = await env.DB.prepare(`UPDATE glowro_confirmation_emails SET status='sending', attempts=attempts+1, first_attempt_at=COALESCE(first_attempt_at,?), lease_until=?, last_error=NULL WHERE order_id=? AND kind=? AND ((status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status='sending' AND lease_until < ? AND first_attempt_at >= ?)) RETURNING *`).bind(now.toISOString(),lease,orderId,kind,now.toISOString(),now.toISOString(),new Date(now.getTime()-23*60*60_000).toISOString()).first();
  if (!job) return false;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada');
    const order = await env.DB.prepare("SELECT code, customer_name, customer_email, customer_phone, fulfillment, address, notes, product_subtotal, shipping_fee, total FROM orders WHERE id=? AND store_id='glowro' AND status='confirmed' AND payment_method='mercadopago' AND mp_payment_id IS NOT NULL").bind(orderId).first();
    if (!order) throw new Error('Pedido aprobado no disponible');
    const result = await env.DB.prepare("SELECT name, quantity, unit_price, subtotal FROM order_items WHERE order_id=? AND store_id='glowro' ORDER BY id").bind(orderId).all();
    if (!result.results?.length) throw new Error('Pedido sin productos');
    let content = job.content_json ? JSON.parse(job.content_json) : null;
    if (!content) {
      content = kind === 'buyer' ? compose(order,result.results,'confirmed',await mailSettings(env)) : buildGlowroConfirmation(order,result.results,kind);
      await env.DB.prepare('UPDATE glowro_confirmation_emails SET content_json=? WHERE order_id=? AND kind=? AND content_json IS NULL').bind(JSON.stringify(content),orderId,kind).run();
    }
    const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':`glowro-confirmed/${orderId}/${kind}`},body:JSON.stringify({from:`GlowRo <${SENDER}>`,to:[job.recipient],...content})});
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data.id) throw new Error(`Resend HTTP ${response.status}`);
    await env.DB.prepare("UPDATE glowro_confirmation_emails SET status='sent', provider_id=?, sent_at=?, lease_until=NULL WHERE order_id=? AND kind=? AND status='sending'").bind(String(data.id),new Date().toISOString(),orderId,kind).run();
    await env.DB.prepare('INSERT INTO glowro_mail_events(message_id,at,status,provider_id) VALUES(?,?,?,?)').bind(`auto:${orderId}:${kind}`,new Date().toISOString(),'sent',String(data.id)).run();
    return true;
  } catch (error) {
    const retry = new Date(Date.now()+10*60_000).toISOString();
    await env.DB.prepare("UPDATE glowro_confirmation_emails SET status='failed', next_attempt_at=?, lease_until=NULL, last_error=? WHERE order_id=? AND kind=? AND status='sending'").bind(retry,String(error.message).slice(0,300),orderId,kind).run();
    await env.DB.prepare('INSERT INTO glowro_mail_events(message_id,at,status,error) VALUES(?,?,?,?)').bind(`auto:${orderId}:${kind}`,new Date().toISOString(),'failed',String(error.message).slice(0,300)).run();
    return false;
  }
}

export async function processGlowroConfirmations(env) {
  const now = new Date().toISOString();
  const due = await env.DB.prepare("SELECT order_id, kind FROM glowro_confirmation_emails WHERE (status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status='sending' AND lease_until < ?) ORDER BY order_id LIMIT 20").bind(now,now).all();
  for (const job of due.results || []) await sendGlowroConfirmation(env,job.order_id,job.kind);
}
