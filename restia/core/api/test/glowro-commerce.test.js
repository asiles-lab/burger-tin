import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {compose,defaults,validateTemplate,commerceRoute,withdrawal,processMessages,limited} from '../src/glowro-commerce.js';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY,store_id TEXT,status TEXT,customer_email TEXT,customer_name TEXT,code TEXT,product_subtotal NUMERIC,shipping_fee NUMERIC,total NUMERIC,fulfillment TEXT,address TEXT,notes TEXT);CREATE TABLE order_items(id INTEGER PRIMARY KEY,order_id INTEGER,store_id TEXT,name TEXT,quantity INTEGER,subtotal NUMERIC);CREATE TABLE glowro_confirmation_emails(order_id INTEGER,kind TEXT,recipient TEXT);");
 db.exec(readFileSync(new URL('../migrations/0018_glowro_communications.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO orders(id,store_id,status,customer_email,customer_name,code,product_subtotal,shipping_fee,total,fulfillment,address) VALUES(1,'glowro','confirmed','ana@example.com','Ana','GR-000001',1000,200,1200,'delivery','Calle 1');INSERT INTO order_items VALUES(1,1,'glowro','Crema',1,1000);");
 const prepare=sql=>({bind(...args){return {first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)}}});
 return {db,env:{DB:{prepare,batch:async list=>Promise.all(list.map(s=>s.run()))},RESEND_API_KEY:'fake'}};
}
const admin={id:'admin1',storeId:'glowro',permissions:['orders:view','orders:manage','store:manage']};
const request=(path,body,method=body?'POST':'GET')=>new Request('https://api.test/api/admin/glowro/'+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
test('plantillas escapan HTML, incluyen importes y adaptan retiro',()=>{
 const result=compose({customer_name:'<script>','code':'GR-1',product_subtotal:1000,shipping_fee:200,total:1100,fulfillment:'pickup'},[{name:'<img>',quantity:1,subtotal:1000}],'shipping');
 assert.equal(result.subject,'Tu pedido está listo para retirar');assert.ok(result.html.includes('&lt;script&gt;'));assert.ok(result.text.includes('100,00'));assert.ok(result.text.includes('200,00'));assert.ok(result.html.includes('glowro-wordmark-dark.png'));
 assert.throws(()=>validateTemplate({subject:'{{secreto}}',body:'Hola'}));assert.throws(()=>validateTemplate({subject:'X\r\nBcc:x',body:'Hola'}));
});
test('permisos y separación de tiendas: sin acceso a datos ajenos',async()=>{const {env}=setup();for(const identity of [null,{...admin,storeId:'otro'},{...admin,permissions:[]},{...admin,mustChangePassword:true}])assert.equal((await commerceRoute(request('orders/1/communications'),env,identity)).status,403);assert.equal((await commerceRoute(request('orders/99/communications'),env,admin)).status,404);});
test('editar configuración conserva remitente fijo sin devolver secretos',async()=>{const {env}=setup();await commerceRoute(request('email-settings',{...defaults,name:'GlowRo Tienda',sender:'evil@example.com'},'PATCH'),env,admin);const result=await commerceRoute(request('email-settings'),env,admin);assert.equal(result.data.settings.name,'GlowRo Tienda');assert.equal(result.data.sender,'Atencionglowro@restia.net.ar');assert.ok(!JSON.stringify(result).includes('fake'));});
test('envío manual duplica clic sin duplicar job; contenido e historial reales',async()=>{
 const {db,env}=setup();const body={stage:'shipping',confirm:true};await Promise.all([commerceRoute(request('orders/1/communications',body),env,admin),commerceRoute(request('orders/1/communications',body),env,admin)]);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM glowro_messages').get().n,1);
 const fetchOriginal=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'accepted'});};
 try{await Promise.all([processMessages(env),processMessages(env)]);assert.equal(calls,1);const history=await commerceRoute(request('orders/1/communications'),env,admin);assert.equal(history.data.messages[0].status,'sent');assert.equal(history.data.events.length,1);assert.equal(db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'shipping');assert.equal(JSON.parse(history.data.messages[0].content_json).subject,defaults.shipping.subject);}finally{globalThis.fetch=fetchOriginal;}
});
test('fallo del proveedor no entrega pedido y el reintento conserva payload y clave',async()=>{
 const {db,env}=setup();await commerceRoute(request('orders/1/communications',{stage:'shipping',confirm:true}),env,admin);
 const original=globalThis.fetch,keys=[],bodies=[];globalThis.fetch=async(_,o)=>{keys.push(o.headers['Idempotency-Key']);bodies.push(o.body);return new Response('{}',{status:503});};
 try{await processMessages(env);assert.equal(db.prepare('SELECT status FROM glowro_messages').get().status,'failed');assert.equal(db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'preparing');db.exec('UPDATE glowro_messages SET next_attempt_at=NULL');await processMessages(env);assert.equal(keys[0],keys[1]);assert.equal(bodies[0],bodies[1]);}finally{globalThis.fetch=original;}
});
test('no entrega sin etapa previa, ni envía sin aprobación del pago o confirmación manual',async()=>{const {db,env}=setup();await assert.rejects(commerceRoute(request('orders/1/communications',{stage:'delivered',confirm:true}),env,admin));await assert.rejects(commerceRoute(request('orders/1/communications',{stage:'shipping'}),env,admin));db.exec("UPDATE orders SET status='pending_payment'");await assert.rejects(commerceRoute(request('orders/1/communications',{stage:'shipping',confirm:true}),env,admin));});
test('reenvío explícito tiene nueva identidad y se deduplica por solicitud',async()=>{const {db,env}=setup();const body={stage:'shipping',confirm:true};await commerceRoute(request('orders/1/communications',body),env,admin);body.resend=true;body.requestId=crypto.randomUUID();await commerceRoute(request('orders/1/communications',body),env,admin);await commerceRoute(request('orders/1/communications',body),env,admin);assert.equal(db.prepare('SELECT COUNT(*) n FROM glowro_messages').get().n,2);});
test('arrepentimiento sin cuenta genera constancia privada y notifica una vez',async()=>{const {db,env}=setup();const body={orderCode:'GR-1',email:'a@example.com',requestId:crypto.randomUUID()};const req=()=>new Request('https://api.test',{method:'POST',body:JSON.stringify(body)});const a=await withdrawal(req(),env,'hash');const b=await withdrawal(req(),env,'hash');assert.equal(a.data.id,b.data.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM glowro_withdrawals').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM glowro_messages').get().n,1);assert.ok(!JSON.stringify(a).includes(body.email));assert.equal(db.prepare('SELECT status FROM orders').get().status,'confirmed');});
test('rate limit persistente bloquea exceso de solicitudes',async()=>{const {env}=setup();for(let i=0;i<3;i++)assert.equal(await limited(env,'key',3),false);assert.equal(await limited(env,'key',3),true);});
test('correo de entrega fallido conserva estado en camino y aceptación posterior lo avanza',async()=>{
 const {db,env}=setup();await commerceRoute(request('orders/1/communications',{stage:'shipping',confirm:true}),env,admin);
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'shipping-accepted'});
 try{
  await processMessages(env);await commerceRoute(request('orders/1/communications',{stage:'delivered',confirm:true}),env,admin);
  globalThis.fetch=async()=>new Response('{}',{status:503});await processMessages(env);assert.equal(db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'shipping');
  db.exec("UPDATE glowro_messages SET next_attempt_at=NULL WHERE stage='delivered'");globalThis.fetch=async()=>Response.json({id:'delivery-accepted'});await processMessages(env);assert.equal(db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'delivered');
 }finally{globalThis.fetch=original;}
});
