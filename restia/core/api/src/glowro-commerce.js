export class CommerceInputError extends Error {}
export const sender = 'Atencionglowro@restia.net.ar';
export const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v||0));
export const defaults = {
 name:'GlowRo', replyTo:sender,
 confirmed:{subject:'¡Gracias por tu compra! Estamos preparando tu pedido',body:'Hola {{nombre_cliente}}, tu pago fue confirmado. Ya estamos preparando tu pedido con mucho cariño.'},
 shipping:{subject:'¡Tu pedido GlowRo está en camino!',body:'Hola {{nombre_cliente}}, ¡tu pedido GlowRo está en camino!\nPreparamos tu compra con mucho cuidado y ya está lista para llegar a tus manos.\nGracias por confiar en nosotros. Pronto podrás disfrutar de tus productos favoritos.'},
 delivered:{subject:'¡Tu pedido GlowRo fue entregado!',body:'Hola {{nombre_cliente}}, ¡tu pedido GlowRo fue entregado!\nEsperamos que disfrutes cada uno de los productos que elegiste.\nGracias por confiar en nosotros y dejarnos acompañarte en tus momentos de cuidado personal.\n¡Esperamos volver a verte pronto!'}
};
export async function mailSettings(env) {
 const row=await env.DB.prepare('SELECT value FROM glowro_mail_settings WHERE id=?').bind(1).first();
 return row ? {...defaults,...JSON.parse(row.value)} : structuredClone(defaults);
}
const variables=['nombre_cliente','numero_pedido','productos','subtotal','descuento','envio','total','modalidad_entrega'];
export function validateTemplate(t) {
 if(!t || typeof t.subject!=='string'||typeof t.body!=='string'||!t.subject.trim()||!t.body.trim()||t.subject.length>180||t.body.length>6000||/[\r\n]/.test(t.subject)) throw new CommerceInputError('Asunto o cuerpo inválido.');
 for(const match of (t.subject+' '+t.body).matchAll(/{{(.*?)}}/g)) if(!variables.includes(match[1])) throw new CommerceInputError('Variable no permitida: '+match[1]);
 return {subject:t.subject,body:t.body};
}
export function compose(order,items,stage,settings=defaults,override) {
 let template=override||settings[stage];
 if(stage==='shipping'&&order.fulfillment==='pickup'&&!override) template={subject:'Tu pedido está listo para retirar',body:'Hola {{nombre_cliente}}, preparamos tu compra con mucho cuidado. Tu pedido está listo para retirar. Gracias por confiar en GlowRo.'};
 validateTemplate(template);
 const subtotal=Number(order.product_subtotal??items.reduce((n,i)=>n+Number(i.subtotal),0)), shipping=Number(order.shipping_fee||0);
 const values={nombre_cliente:order.customer_name,numero_pedido:order.code,productos:items.map(i=>`${i.quantity} × ${i.name} — ${money(i.subtotal)}`).join('\n'),subtotal:money(subtotal),descuento:money(Math.max(0,subtotal+shipping-Number(order.total))),envio:money(shipping),total:money(order.total),modalidad_entrega:order.fulfillment==='pickup'?'Retiro':String(order.notes||'').includes('costo no incluido')?'Envío a coordinar (costo no incluido)':'Envío a domicilio'};
 const fill=s=>s.replace(/{{(.*?)}}/g,(_,key)=>String(values[key]??''));
 const subject=fill(template.subject), text=fill(template.body)+`\n\nPedido ${order.code}\n${values.productos}\nSubtotal: ${values.subtotal}\nDescuento: ${values.descuento}\nEnvío: ${values.envio}\nTotal: ${values.total}\n${values.modalidad_entrega}\n${order.address||''}`;
 return {subject,text,html:mailHtml(text),from:`${settings.name} <${sender}>`,reply_to:settings.replyTo};
}
export function mailHtml(text) {return `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#faf4f1;color:#292126;font-family:Arial,sans-serif"><main style="max-width:620px;margin:auto;padding:28px 20px;background:white"><img width="160" alt="GlowRo" src="https://glowro.restia.net.ar/assets/glowro-wordmark-dark.png"><div style="line-height:1.7;white-space:pre-wrap">${esc(text)}</div></main></body></html>`;}
export async function limited(env,key,max=10) {
 const now=Date.now(), expires=now+600000;
 const row=await env.DB.prepare('INSERT INTO glowro_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires < ? THEN 1 ELSE count+1 END, expires=CASE WHEN expires < ? THEN ? ELSE expires END RETURNING count').bind(key,expires,now,now,expires).first();
 return row.count>max;
}
export async function queueMessage(env,{id,orderId=null,stage,recipient,content,actor}) {
 await env.DB.prepare("INSERT OR IGNORE INTO glowro_messages(id,order_id,stage,recipient,content_json,actor,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,orderId,stage,recipient,JSON.stringify(content),actor,new Date().toISOString()).run();
}
export async function processMessages(env) {
 await env.DB.prepare('DELETE FROM glowro_limits WHERE expires < ?').bind(Date.now()-86400000).run();
 const now=new Date().toISOString(), cutoff=new Date(Date.now()-23*3600000).toISOString();
 await env.DB.prepare("UPDATE glowro_messages SET status='uncertain',last_error='Revisar aceptación en Resend antes de reenviar' WHERE status IN ('failed','sending') AND first_attempt_at < ?").bind(cutoff).run();
 const jobs=await env.DB.prepare("SELECT id FROM glowro_messages WHERE (status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (status='sending' AND lease_until<?) LIMIT 20").bind(now,now).all();
 for(const {id} of jobs.results||[]) {
  const job=await env.DB.prepare("UPDATE glowro_messages SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),lease_until=? WHERE id=? AND ((status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (status='sending' AND lease_until<?)) RETURNING *").bind(now,new Date(Date.now()+300000).toISOString(),id,now,now).first();
  if(!job)continue;
  try {
   if(!env.RESEND_API_KEY)throw new CommerceInputError('Proveedor sin configurar');
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':`glowro/${id}`},body:JSON.stringify({from:`GlowRo <${sender}>`,...JSON.parse(job.content_json),to:[job.recipient]})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.id)throw new CommerceInputError(`Proveedor HTTP ${response.status}`);
   await env.DB.batch([
    env.DB.prepare("UPDATE glowro_messages SET status='sent',provider_id=?,sent_at=?,lease_until=NULL WHERE id=?").bind(String(data.id),now,id),
    env.DB.prepare('INSERT INTO glowro_mail_events(message_id,at,status,provider_id) VALUES(?,?,?,?)').bind(id,now,'sent',String(data.id)),
    ...(job.order_id&&['shipping','delivered'].includes(job.stage)?[env.DB.prepare("UPDATE orders SET fulfillment_status=? WHERE id=? AND store_id='glowro' AND status='confirmed' AND fulfillment_status!='delivered'").bind(job.stage,job.order_id)]:[])
   ]);
  }catch(error){await env.DB.batch([
   env.DB.prepare("UPDATE glowro_messages SET status='failed',last_error=?,next_attempt_at=?,lease_until=NULL WHERE id=?").bind(error.message,new Date(Date.now()+600000).toISOString(),id),
   env.DB.prepare('INSERT INTO glowro_mail_events(message_id,at,status,error) VALUES(?,?,?,?)').bind(id,now,'failed',error.message)
  ]);}
 }
}
export async function commerceRoute(request,env,identity) {
 const path=new URL(request.url).pathname, method=request.method;
 if(!['GET','POST','PATCH'].includes(method))return {status:405,data:{error:'Método no permitido.'}};
 const body=method==='GET'?{}:await request.json();
 const settingsPath=path.startsWith('/api/admin/glowro/email');
 if(!identity||identity.storeId!=='glowro'||identity.mustChangePassword||!identity.permissions.includes(settingsPath?'store:manage':method==='GET'?'orders:view':'orders:manage')) return {status:403,data:{error:'No autorizado.'}};
 if(method!=='GET'&&await limited(env,`admin:${identity.id}`,30))return {status:429,data:{error:'Esperá unos minutos antes de volver a intentar.'}};
 const settings=await mailSettings(env);
 if(path==='/api/admin/glowro/email-settings') {
  if(!['GET','PATCH'].includes(method))return {status:405,data:{error:'Método no permitido.'}};
  if(method==='PATCH') {
   if(!/^[^<>\r\n]{1,60}$/.test(body.name||'')||!/^\S+@\S+\.\S+$/.test(body.replyTo||''))throw new CommerceInputError('Nombre o Reply-To inválido.');
   const value={name:body.name,replyTo:body.replyTo};for(const stage of ['confirmed','shipping','delivered'])value[stage]=validateTemplate(body[stage]);
   await env.DB.prepare('INSERT INTO glowro_mail_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind(JSON.stringify(value)).run();
   return {data:{ok:true}};
  }
  return {data:{settings,sender,configured:Boolean(env.RESEND_API_KEY)}};
 }
 if(path==='/api/admin/glowro/email-check') {
  if(!env.RESEND_API_KEY)return {data:{ok:false,message:'RESEND_API_KEY no configurada.'}};
  const response=await fetch('https://api.resend.com/domains',{headers:{authorization:`Bearer ${env.RESEND_API_KEY}`}});
  const data=await response.json().catch(()=>({}));
  return {data:{ok:response.ok&&data.data?.some(d=>d.name==='restia.net.ar'&&d.status==='verified'),message:response.ok?'Revisá que restia.net.ar figure verificado.':'No se pudo verificar el dominio; comprobá los permisos de la clave.'}};
 }
 if(path==='/api/admin/glowro/email-preview'||path==='/api/admin/glowro/email-test') {
  if(!['confirmed','shipping','delivered'].includes(body.stage))throw new CommerceInputError('Etapa inválida.');
  const content=compose({code:'EJEMPLO',customer_name:'Cliente de ejemplo',product_subtotal:1000,shipping_fee:200,total:1200,fulfillment:'delivery'},[{name:'Producto de ejemplo',quantity:1,subtotal:1000}],body.stage,settings,body.template);
  if(path.endsWith('test')) {
   if(!/^\S+@\S+\.\S+$/.test(body.recipient||'')||!/^[-\w]{16,80}$/.test(body.requestId||''))throw new CommerceInputError('Destinatario o identificador inválido.');
   await queueMessage(env,{id:`test:${body.requestId}`,stage:'test',recipient:body.recipient,content,actor:identity.id});
  }
  return {data:{content,queued:path.endsWith('test')}};
 }
 if(path==='/api/admin/glowro/withdrawals') {
  if(method==='PATCH') {
   if(!['received','reviewing','resolved'].includes(body.status))throw new CommerceInputError('Estado inválido.');
   await env.DB.prepare('UPDATE glowro_withdrawals SET status=?,updated_at=?,actor=? WHERE id=?').bind(body.status,new Date().toISOString(),identity.id,body.id).run();
  }
  return {data:{requests:(await env.DB.prepare('SELECT * FROM glowro_withdrawals ORDER BY created_at DESC LIMIT ?').bind(200).all()).results}};
 }
 const match=path.match(/^\/api\/admin\/glowro\/orders\/(\d+)\/communications$/);
 if(!match)return {status:404,data:{error:'Ruta inexistente.'}};
 const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND store_id='glowro'").bind(Number(match[1])).first();
 if(!order)return {status:404,data:{error:'Pedido inexistente.'}};
 const items=(await env.DB.prepare("SELECT * FROM order_items WHERE order_id=? AND store_id='glowro'").bind(order.id).all()).results;
 if(method==='GET') {
  const auto=(await env.DB.prepare('SELECT * FROM glowro_confirmation_emails WHERE order_id=?').bind(order.id).all()).results;
  const messages=(await env.DB.prepare('SELECT * FROM glowro_messages WHERE order_id=? ORDER BY created_at').bind(order.id).all()).results;
  const events=(await env.DB.prepare("SELECT e.* FROM glowro_mail_events e WHERE e.message_id IN (SELECT id FROM glowro_messages WHERE order_id=?) OR e.message_id IN (?,?) ORDER BY e.at").bind(order.id,`auto:${order.id}:buyer`,`auto:${order.id}:internal`).all()).results;
  return {data:{auto,messages,events,templates:Object.fromEntries(['shipping','delivered'].map(stage=>[stage,{template:stage==='shipping'&&order.fulfillment==='pickup'?{subject:'Tu pedido está listo para retirar',body:'Hola {{nombre_cliente}}, tu pedido está listo para retirar. Gracias por confiar en GlowRo.'}:settings[stage],content:compose(order,items,stage,settings)}]))}};
 }
 if(!['shipping','delivered'].includes(body.stage)||order.status!=='confirmed'||!order.customer_email)throw new CommerceInputError('Se requiere una compra confirmada con email.');
 const content=compose(order,items,body.stage,settings,body.template);
 if(body.action==='preview')return {data:{content}};
 if(body.confirm!==true)throw new CommerceInputError('Confirmá el envío.');
 if(body.stage==='delivered'&&!await env.DB.prepare("SELECT id FROM glowro_messages WHERE order_id=? AND stage='shipping' AND status='sent'").bind(order.id).first())throw new CommerceInputError('Primero enviá la comunicación de envío o retiro.');
 if(body.resend&&!/^[-\w]{16,80}$/.test(body.requestId||''))throw new CommerceInputError('Identificador inválido.');
 const id=`order:${order.id}:${body.stage}:${body.resend?body.requestId:'initial'}`;
 await queueMessage(env,{id,orderId:order.id,stage:body.stage,recipient:order.customer_email,content,actor:identity.id});
 return {data:{queued:true,id}};
}
export async function withdrawal(request,env,key) {
 if(await limited(env,`withdraw:${key}`,5))return {status:429,data:{error:'Demasiadas solicitudes. Intentá nuevamente en unos minutos.'}};
 const body=await request.json();
 if(!/^[A-Za-z0-9-]{1,60}$/.test(body.orderCode||'')||!/^\S+@\S+\.\S+$/.test(body.email||'')||body.email.length>254||!/^[-\w]{16,80}$/.test(body.requestId||''))throw new CommerceInputError('Ingresá el número de pedido y un email válido.');
 const id=`AR-${body.requestId}`, now=new Date().toISOString();
 await env.DB.prepare('INSERT OR IGNORE INTO glowro_withdrawals(id,order_code,email,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,body.orderCode,body.email,now,now).run();
 const existing=await env.DB.prepare('SELECT * FROM glowro_withdrawals WHERE id=?').bind(id).first();
 const text=`Solicitud de arrepentimiento ${id}\nPedido: ${existing.order_code}\nContacto: ${existing.email}\nRecibida para gestión. No implica reintegro automático.`;
 await queueMessage(env,{id:`withdraw:${id}`,stage:'withdrawal',recipient:'rodiazhtc@gmail.com',content:{subject:`Arrepentimiento ${id}`,text,html:mailHtml(text)},actor:'public'});
 return {data:{id,message:'Solicitud registrada. Conservá esta constancia.'}};
}
