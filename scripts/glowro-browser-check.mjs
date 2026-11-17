import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.GLOWRO_PLAYWRIGHT_MODULE).href);
const root=resolve('.cloudflare-dist/glowro');
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root))throw Error();const content=await readFile(file);res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(content);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.GLOWRO_BROWSER_EXECUTABLE});
const errors=[];let analyticsRequests=0,withdrawals=0,manualSends=0,paymentStatus='approved';
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());
  if(url.pathname.endsWith('/analytics-config.js'))return route.fulfill({contentType:'application/javascript',body:"window.GLOWRO_GA4_ID='G-TEST123';"});
  if(/google-analytics|googletagmanager/.test(url.hostname)){analyticsRequests++;return route.fulfill({body:''});}
  if(url.pathname.startsWith('/api/')){
   let data={};const path=url.pathname;
   if(path==='/api/catalog')data={id:'glowro',business:'GlowRo',products:[{id:'cream',name:'Crema',price:1000,category:'facial',description:'Cuidado facial',image:'assets/glowro-monogram.png'}],mercadoPagoEnabled:true,paymentMode:'production',shippingConfig:{pickup:{enabled:true}}};
   if(path==='/api/glowro/order-status')data={code:'GR-000001',status:paymentStatus,purchase:{transaction_id:'GR-000001',value:1000,shipping:200,currency:'ARS',items:[{item_id:'cream',item_name:'Crema',price:1000,quantity:1}]}};
   if(path==='/api/glowro/withdrawal'){withdrawals++;data={id:'AR-local-test',message:'Solicitud registrada.'};}
   if(path==='/api/admin/session')data={user:{id:'admin1',name:'Admin',storeId:'glowro',permissions:['orders:view','orders:manage','store:manage'],role:'Administrador'}};
   if(path==='/api/admin/orders')data={orders:[{id:1,code:'GR-1',status:'confirmed',customer_name:'Ana',fulfillment:'delivery',total:1200,created_at:new Date().toISOString(),items_json:'[]'}],counts:{}};
   if(path.endsWith('/communications')){if(route.request().method()==='POST'){const b=route.request().postDataJSON();if(b.action==='preview')data={content:{subject:'Vista previa',html:'<p>Hola Ana</p>'}};else{manualSends++;data={queued:true};}}else data={auto:[],messages:[],events:[],templates:{shipping:{template:{subject:'En camino',body:'Hola {{nombre_cliente}}'}},delivered:{template:{subject:'Entregado',body:'Gracias'}}}};}
   if(path.endsWith('/email-settings'))data={settings:{name:'GlowRo',replyTo:'Atencionglowro@restia.net.ar',confirmed:{subject:'Gracias',body:'Hola'},shipping:{subject:'En camino',body:'Hola'},delivered:{subject:'Entregado',body:'Hola'}},sender:'Atencionglowro@restia.net.ar',configured:false};
   if(path.endsWith('/email-preview'))data={content:{subject:'Ejemplo',html:'<p>Vista previa</p>'}};
   if(path==='/api/admin/settings')return route.fulfill({status:503,json:{error:'Fixture de configuración general'}});
   return route.fulfill({json:data});
  }
  if(url.origin!==base)return route.abort();return route.continue();
 });
 await page.goto(base);await page.waitForSelector('#consent-banner');assert.equal(analyticsRequests,0);
 assert.equal(await page.locator('input[name=email]').count(),1);
 await page.getByRole('button',{name:'Rechazar opcionales',exact:true}).click();await page.reload();assert.equal(analyticsRequests,0);
 await page.locator('[data-cookie-preferences]').click();await page.locator('#analytics-choice').check();await page.locator('#save-preferences').click();await page.waitForFunction(()=>document.querySelector('script[src*="googletagmanager"]'));assert.equal(analyticsRequests,1);
 await page.locator('[data-product-detail]').click();await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.locator('[data-add]').first().click();await page.locator('#close-drawer').click();
 const eventNames=await page.evaluate(()=>dataLayer.filter(a=>a[0]==='event').map(a=>a[1]));assert.ok(eventNames.includes('add_to_cart'));assert.ok(eventNames.includes('view_item'));
 await page.goto(base+'/?payment=success&token='+crypto.randomUUID()+crypto.randomUUID());await page.getByRole('heading',{name:'¡Gracias por tu compra!'}).waitFor();
 let purchases=await page.evaluate(()=>dataLayer.filter(a=>a[0]==='event'&&a[1]==='purchase').length);assert.equal(purchases,1);
 await page.reload();await page.getByRole('heading',{name:'¡Gracias por tu compra!'}).waitFor();purchases=await page.evaluate(()=>dataLayer.filter(a=>a[0]==='event'&&a[1]==='purchase').length);assert.equal(purchases,0);
 paymentStatus='pending';await page.reload();await page.getByRole('heading',{name:'Tu pago está pendiente'}).waitFor();assert.equal(await page.getByRole('heading',{name:'¡Gracias por tu compra!'}).count(),0);
 paymentStatus='rejected';await page.reload();await page.getByRole('heading',{name:'El pago fue rechazado'}).waitFor();
 await page.goto(base+'/faq.html');await page.locator('[data-cookie-preferences]').click();await page.locator('#analytics-choice').uncheck();await Promise.all([page.waitForEvent('load'),page.locator('#save-preferences').click()]);const before=analyticsRequests;await page.reload();assert.equal(analyticsRequests,before);
 for(const slug of ['privacidad','cookies','terminos','envios','faq','arrepentimiento']){await page.goto(`${base}/${slug}.html`);assert.ok(await page.locator('h1').textContent());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByLabel('Número de pedido').fill('GR-1');await page.getByLabel('Email de contacto').fill('test@example.com');await page.getByRole('button',{name:'Enviar solicitud de arrepentimiento'}).click();await page.getByText('Número: AR-local-test',{exact:false}).waitFor();assert.equal(withdrawals,1);
 await mkdir('.cloudflare-dist/qa-evidence',{recursive:true});await page.screenshot({path:'.cloudflare-dist/qa-evidence/withdrawal-mobile.png'});
 await page.evaluate(()=>sessionStorage.setItem('restia-store-session','local-test'));await page.goto(base+'/admin/');await page.getByRole('button',{name:'Comunicaciones',exact:true}).click();await page.getByRole('button',{name:'Vista previa',exact:true}).first().click();await page.locator('iframe').waitFor();await page.locator('dialog').last().getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'Enviar',exact:true}).first().click();assert.equal(manualSends,0);await page.locator('#action-dialog-confirm').click();await page.getByText('Correo en cola.',{exact:false}).waitFor();assert.equal(manualSends,1);
 await page.screenshot({path:'.cloudflare-dist/qa-evidence/communications-mobile.png'});
 await page.locator('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();await page.locator('#mobile-menu').click();await page.locator('[data-section=store]').click();await page.getByRole('button',{name:'Correos y plantillas'}).click();await page.getByRole('button',{name:'Vista previa',exact:true}).first().click();await page.locator('iframe').waitFor();
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.cloudflare-dist/qa-evidence/store-desktop.png'});
 assert.deepEqual(errors,[]);console.log('PASS: móvil, consentimiento/rechazo/revocación, compra única, páginas públicas, solicitud, comunicaciones con confirmación y vista previa de plantillas. Sin errores JS.');
}finally{await browser.close();server.close();}
