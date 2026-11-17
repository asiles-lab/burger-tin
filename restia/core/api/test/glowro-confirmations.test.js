import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildGlowroConfirmation, queueGlowroConfirmations, sendGlowroConfirmation } from '../src/glowro-confirmations.js';
import worker from '../src/index.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE orders(id INTEGER PRIMARY KEY, store_id TEXT, status TEXT, payment_method TEXT, mp_payment_id TEXT, customer_email TEXT, customer_name TEXT, customer_phone TEXT, fulfillment TEXT, address TEXT, notes TEXT, product_subtotal NUMERIC, shipping_fee NUMERIC, total NUMERIC, code TEXT);
    CREATE TABLE order_items(id INTEGER PRIMARY KEY, order_id INTEGER, store_id TEXT, name TEXT, quantity INTEGER, unit_price NUMERIC, subtotal NUMERIC);
    CREATE TABLE glowro_confirmation_emails(order_id INTEGER,kind TEXT,recipient TEXT,status TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,first_attempt_at TEXT,lease_until TEXT,next_attempt_at TEXT,provider_id TEXT,last_error TEXT,sent_at TEXT,PRIMARY KEY(order_id,kind));`);
  db.exec(readFileSync(new URL('../migrations/0018_glowro_communications.sql',import.meta.url),'utf8'));
  db.exec('ALTER TABLE order_items ADD COLUMN product_id TEXT');
  const wrap = sql => ({ bind(...args) { return { first:async()=>db.prepare(sql).get(...args) || null, all:async()=>({results:db.prepare(sql).all(...args)}), run:async()=>db.prepare(sql).run(...args) }; } });
  return { db, env:{RESEND_API_KEY:'test', DB:{prepare:wrap,batch:async statements=>Promise.all(statements.map(s=>s.run()))}} };
}
function seed(db, status='confirmed') {
  db.prepare("INSERT INTO orders(id,store_id,status,payment_method,mp_payment_id,customer_email,customer_name,customer_phone,fulfillment,address,notes,product_subtotal,shipping_fee,total,code) VALUES(1,'glowro',?,'mercadopago','123','buyer@example.com','Ana','123','delivery','Calle 1','',1000,250,1250,'GR-000001')").run(status);
  db.exec("INSERT INTO order_items(id,order_id,store_id,name,quantity,unit_price,subtotal) VALUES(1,1,'glowro','Crema',2,500,1000)");
}
test('solo encola pedidos aprobados y deduplica cada destinatario', async()=>{
  const {db,env}=database(); seed(db,'pending_payment');
  await queueGlowroConfirmations(env,1);
  assert.equal(db.prepare('SELECT count(*) n FROM glowro_confirmation_emails').get().n,0);
  db.exec("UPDATE orders SET status='confirmed'");
  await Promise.all([queueGlowroConfirmations(env,1),queueGlowroConfirmations(env,1)]);
  assert.equal(db.prepare('SELECT count(*) n FROM glowro_confirmation_emails').get().n,2);
  assert.equal(db.prepare("SELECT recipient FROM glowro_confirmation_emails WHERE kind='internal'").get().recipient,'rodiazhtc@gmail.com');
});
test('reintentos y ejecuciones simultáneas no duplican el correo', async()=>{
  const {db,env}=database(); seed(db); await queueGlowroConfirmations(env,1);
  const original=globalThis.fetch; let calls=0;
  globalThis.fetch=async (_url,options)=>{calls++; assert.equal(options.headers['Idempotency-Key'],'glowro-confirmed/1/buyer'); return new Response(JSON.stringify({id:'email-1'}),{status:200});};
  try { await Promise.all([sendGlowroConfirmation(env,1,'buyer'),sendGlowroConfirmation(env,1,'buyer')]); await sendGlowroConfirmation(env,1,'buyer'); }
  finally {globalThis.fetch=original;}
  assert.equal(calls,1);
  assert.equal(db.prepare("SELECT status FROM glowro_confirmation_emails WHERE kind='buyer'").get().status,'sent');
});
test('rechazado o cancelado no encola, ni se reintenta un envío incierto antiguo', async()=>{
  const {db,env}=database(); seed(db,'cancelled'); await queueGlowroConfirmations(env,1);
  assert.equal(db.prepare('SELECT count(*) n FROM glowro_confirmation_emails').get().n,0);
  db.exec("UPDATE orders SET status='confirmed'"); await queueGlowroConfirmations(env,1);
  db.exec("UPDATE glowro_confirmation_emails SET status='failed', first_attempt_at='2000-01-01T00:00:00.000Z' WHERE kind='buyer'");
  const original=globalThis.fetch; let calls=0; globalThis.fetch=async()=>{calls++; throw new Error('unexpected');};
  try { await sendGlowroConfirmation(env,1,'buyer'); } finally { globalThis.fetch=original; }
  assert.equal(calls,0); assert.equal(db.prepare("SELECT status FROM glowro_confirmation_emails WHERE kind='buyer'").get().status,'uncertain');
});
test('correo incluye envío y escapa texto del comprador',()=>{
  const content=buildGlowroConfirmation({code:'GR-1',customer_name:'<script>',fulfillment:'delivery',address:'<calle>',product_subtotal:1000,shipping_fee:250,total:1250},[{name:'Crema',quantity:2,subtotal:1000}],'internal');
  assert.match(content.text,/Subtotal:/); assert.match(content.text,/Descuentos:/); assert.match(content.text,/Envío:/); assert.match(content.text,/1\.250/); assert.doesNotMatch(content.html,/<script>/); assert.match(content.html,/&lt;calle&gt;/);
});
test('consulta pública usa token privado y solo informa aprobación persistida', async()=>{
  const {db,env}=database(); seed(db,'pending_payment');
  db.exec("CREATE TABLE stores(id TEXT, public_host TEXT, active INTEGER); INSERT INTO stores VALUES('glowro','glowro.restia.net.ar',1); ALTER TABLE orders ADD COLUMN confirmation_token_hash TEXT;");
  const token='11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  db.prepare('UPDATE orders SET confirmation_token_hash=?').run(hash);
  const query = t => worker.fetch(new Request('https://api.example/api/glowro/order-status',{method:'POST',headers:{origin:'https://glowro.restia.net.ar','x-requested-with':'restia-web','content-type':'application/json'},body:JSON.stringify({token:t})}),env,{});
  assert.deepEqual(await (await query(token)).json(),{code:'GR-000001',status:'pending'});
  db.exec("UPDATE orders SET status='confirmed'");
  const approved=await (await query(token)).json(); assert.equal(approved.status,'approved'); assert.equal(approved.purchase.shipping,250); assert.equal(approved.purchase.value,1000);
  assert.equal((await query('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaabbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).status,404);
});
test('webhook firmado valida estado e importe con Mercado Pago y encola una vez', async()=>{
  const {db,env}=database(); seed(db,'pending_payment');
  db.exec("CREATE TABLE stores(id TEXT, public_host TEXT, active INTEGER); INSERT INTO stores VALUES('glowro','glowro.restia.net.ar',1); CREATE TABLE store_settings(store_id TEXT, key TEXT, value TEXT); ALTER TABLE orders ADD COLUMN confirmed_at TEXT; ALTER TABLE orders ADD COLUMN subtotal NUMERIC; UPDATE orders SET mp_payment_id=NULL;");
  const keyBytes=crypto.getRandomValues(new Uint8Array(32)); env.SETTINGS_ENCRYPTION_KEY=Buffer.from(keyBytes).toString('base64');
  const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
  async function encrypted(value){const iv=crypto.getRandomValues(new Uint8Array(12)); const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));return `${Buffer.from(iv).toString('base64')}.${Buffer.from(data).toString('base64')}`;}
  const insert=db.prepare('INSERT INTO store_settings VALUES(?,?,?)');
  insert.run('glowro','mp_access_token',await encrypted('access-token')); insert.run('glowro','mp_webhook_secret',await encrypted('webhook-secret'));
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode('webhook-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode('id:123;request-id:request-1;ts:100;'));
  const signature=Buffer.from(digest).toString('hex');
  const request=()=>new Request('https://api.example/api/webhooks/mercadopago?store=glowro&data.id=123',{method:'POST',headers:{'x-signature':`ts=100,v1=${signature}`,'x-request-id':'request-1','content-type':'application/json'},body:'{}'});
  let snapshot={id:123,status:'pending',currency_id:'ARS',external_reference:'glowro:1',transaction_amount:1250};
  const original=globalThis.fetch; globalThis.fetch=async()=>new Response(JSON.stringify(snapshot),{headers:{'content-type':'application/json'}});
  try {
    const invalid=request();invalid.headers.set('x-signature','ts=100,v1=bad');assert.equal((await worker.fetch(invalid,env,null)).status,401);
    for(const change of [{currency_id:'USD',status:'approved'},{external_reference:'glowro:1:extra',status:'approved'},{external_reference:'other:1',status:'approved'}]) {
      const saved=snapshot;snapshot={...snapshot,...change};await worker.fetch(request(),env,null);snapshot=saved;assert.equal(db.prepare('SELECT status FROM orders').get().status,'pending_payment');
    }
    await worker.fetch(request(),env,null); assert.equal(db.prepare('SELECT status FROM orders').get().status,'pending_payment');
    snapshot={...snapshot,status:'approved',transaction_amount:1000}; await worker.fetch(request(),env,null); assert.equal(db.prepare('SELECT status FROM orders').get().status,'pending_payment');
    snapshot={...snapshot,transaction_amount:1250}; await worker.fetch(request(),env,null); await worker.fetch(request(),env,null);
    assert.equal(db.prepare('SELECT status FROM orders').get().status,'confirmed'); assert.equal(db.prepare('SELECT count(*) n FROM glowro_confirmation_emails').get().n,2);
  } finally {globalThis.fetch=original;}
});
