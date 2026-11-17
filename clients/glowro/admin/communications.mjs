export function installCommunications({call,confirm,can}) {
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const post=(url,body,method='POST')=>call(url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 function dialog(title) {
  const el=document.createElement('dialog');el.className='communications-dialog';el.setAttribute('aria-label',title);
  el.innerHTML=`<form method="dialog"><button aria-label="Cerrar" autofocus>Cerrar</button></form><h2>${escape(title)}</h2><div class="communication-body"></div><p role="status"></p>`;
  document.body.append(el);el.addEventListener('close',()=>el.remove(),{once:true});el.showModal();return el;
 }
 function preview(content) {const el=dialog(content.subject),frame=document.createElement('iframe');frame.title='Vista previa del correo';frame.sandbox='';frame.srcdoc=content.html;el.querySelector('.communication-body').append(frame);}
 function editor(template) {return `<label>Asunto<input name="subject" maxlength="180" required value="${escape(template.subject)}"></label><label>Mensaje<textarea name="body" rows="6" maxlength="6000" required>${escape(template.body)}</textarea></label>`;}
 function value(form) {return {subject:form.elements.subject.value,body:form.elements.body.value};}
 const error=(el,e)=>el.querySelector('[role=status]').textContent=e.message;
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-communications]');if(!button)return;
  const el=dialog('Comunicaciones del pedido'),url=`/api/admin/glowro/orders/${button.dataset.communications}/communications`,content=el.querySelector('.communication-body');
  async function load(){
   const data=await call(url);content.replaceChildren();
   const heading=document.createElement('h3');heading.textContent='1 · Compra confirmada';content.append(heading);
   for(const job of [...data.auto,...data.messages]) {
    const row=document.createElement('details'),stored=job.content_json?JSON.parse(job.content_json):null;
    row.innerHTML=`<summary>${escape(job.stage||job.kind)} · ${escape(({pending:'Pendiente',sending:'Procesando',sent:'Aceptado por proveedor',failed:'Falló',uncertain:'Requiere revisión'})[job.status]||job.status)} · ${escape(job.recipient)}</summary><p>${escape(stored?.subject||'Contenido todavía no preparado')}<br>${escape(job.sent_at||job.created_at||job.first_attempt_at||'Pendiente')} · ${escape(job.actor||'Automático')}</p><p>${escape(job.last_error||'')}</p>`;
    if(stored){const b=document.createElement('button');b.textContent='Ver contenido guardado';b.onclick=()=>preview(stored);row.append(b);}content.append(row);
   }
   const history=document.createElement('details');history.innerHTML='<summary>Historial de intentos</summary>';const pre=document.createElement('pre');pre.textContent=data.events.map(e=>`${e.at} · ${e.status} · ${e.provider_id||e.error||''}`).join('\n')||'Sin intentos registrados.';history.append(pre);content.append(history);
   if(!can('orders:manage'))return;
   for(const [stage,label] of [['shipping','2 · Pedido en camino / listo para retirar'],['delivered','3 · Pedido entregado']]) {
    const form=document.createElement('form');form.innerHTML=`<h3>${label}</h3><details><summary>Editar mensaje</summary>${editor(data.templates[stage].template)}</details><button type="button" data-preview>Vista previa</button><button type="submit">Enviar</button><button type="button" data-resend>Reenviar explícitamente</button>`;
    let requestId=crypto.randomUUID(),busy=false;
    form.querySelector('[data-preview]').onclick=async()=>{try{preview((await post(url,{stage,template:value(form),action:'preview'})).content);}catch(e){error(el,e);}};
    async function send(resend){if(busy)return;busy=true;try{
     if(!await confirm({title:resend?'¿Reenviar este correo?':'¿Enviar este correo?',description:'Se enviará al email del comprador. Revisá la vista previa antes de confirmar.',confirmLabel:resend?'Reenviar':'Enviar'}))return;
     form.querySelectorAll('button').forEach(b=>b.disabled=true);
     await post(url,{stage,template:value(form),confirm:true,resend,requestId});el.querySelector('[role=status]').textContent='Correo en cola. Actualizá para consultar la aceptación del proveedor.';await load();
    }catch(e){error(el,e);}finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    form.onsubmit=e=>{e.preventDefault();send(false);};form.querySelector('[data-resend]').onclick=()=>send(true);content.append(form);
   }
   const refresh=document.createElement('button');refresh.textContent='Actualizar estado';refresh.onclick=()=>load().catch(e=>error(el,e));content.append(refresh);
  }
  load().catch(e=>error(el,e));
 });
 const settings=document.querySelector('#settings-area');
 const button=document.createElement('button');button.type='button';button.textContent='Correos y plantillas';settings.append(button);
 button.onclick=async()=>{const el=dialog('Configuración · Correos y plantillas'),root=el.querySelector('.communication-body');try{
  const data=await call('/api/admin/glowro/email-settings');root.innerHTML=`<p>Remitente verificado requerido: ${escape(data.sender)}</p><p>${data.configured?'Clave configurada; verificá la conexión.':'Proveedor pendiente de configurar.'}</p><button type="button" data-check>Verificar proveedor</button><form data-settings><label>Nombre del remitente<input name="senderName" maxlength="60" value="${escape(data.settings.name)}"></label><label>Reply-To<input name="replyTo" type="email" value="${escape(data.settings.replyTo)}"></label><button>Guardar remitente y plantillas</button></form><p>Variables: {{nombre_cliente}}, {{numero_pedido}}, {{productos}}, {{subtotal}}, {{descuento}}, {{envio}}, {{total}}, {{modalidad_entrega}}</p>`;
  const forms={};for(const stage of ['confirmed','shipping','delivered']) {const form=document.createElement('form');form.innerHTML=`<h3>${{confirmed:'Compra confirmada',shipping:'En camino',delivered:'Entregado'}[stage]}</h3>${editor(data.settings[stage])}<button type="button" data-preview>Vista previa</button><label>Destinatario de prueba<input name="recipient" type="email"></label><button type="submit">Enviar prueba</button>`;forms[stage]=form;root.append(form);
   form.querySelector('[data-preview]').onclick=async()=>{try{preview((await post('/api/admin/glowro/email-preview',{stage,template:value(form)})).content);}catch(e){error(el,e);}};
   let requestId=crypto.randomUUID(),busy=false;form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{if(!await confirm({title:'¿Enviar prueba?',description:`Destinatario: ${form.elements.recipient.value}`}))return;await post('/api/admin/glowro/email-test',{stage,template:value(form),recipient:form.elements.recipient.value,requestId});requestId=crypto.randomUUID();el.querySelector('[role=status]').textContent='Prueba en cola; aún no implica aceptación del proveedor.';}catch(e){error(el,e);}finally{busy=false;}};
  }
  root.querySelector('[data-settings]').onsubmit=async e=>{e.preventDefault();try{await post('/api/admin/glowro/email-settings',{name:e.target.elements.senderName.value,replyTo:e.target.elements.replyTo.value,...Object.fromEntries(Object.entries(forms).map(([k,f])=>[k,value(f)]))},'PATCH');el.querySelector('[role=status]').textContent='Configuración guardada.';}catch(e){error(el,e);}};
  root.querySelector('[data-check]').onclick=async()=>{try{const r=await post('/api/admin/glowro/email-check',{});el.querySelector('[role=status]').textContent=(r.ok?'Conexión y dominio verificados. ':'')+r.message;}catch(e){error(el,e);}};
 }catch(e){error(el,e);}};
 const withdrawals=document.createElement('button');withdrawals.textContent='Solicitudes de arrepentimiento';document.querySelector('#orders-area').prepend(withdrawals);
 withdrawals.onclick=async()=>{const el=dialog('Solicitudes de arrepentimiento');try{const data=await call('/api/admin/glowro/withdrawals');for(const r of data.requests){const row=document.createElement('form');row.innerHTML=`<h3>${escape(r.id)}</h3><p>${escape(r.order_code)} · ${escape(r.email)} · ${escape(r.created_at)}</p><label>Seguimiento<select name="status">${['received','reviewing','resolved'].map(s=>`<option ${r.status===s?'selected':''} value="${s}">${{received:'Recibida',reviewing:'En gestión',resolved:'Resuelta'}[s]}</option>`).join('')}</select></label><button>Guardar seguimiento</button>`;row.onsubmit=async e=>{e.preventDefault();try{await post('/api/admin/glowro/withdrawals',{id:r.id,status:row.elements.status.value},'PATCH');el.querySelector('[role=status]').textContent='Seguimiento guardado. No se ejecutó ningún reintegro.';}catch(e){error(el,e);}};el.querySelector('.communication-body').append(row);}}catch(e){error(el,e);}};
}
