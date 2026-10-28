import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticationStoreId, catalogProducts, productImageBytes, publicStoreId } from '../src/index.js';

function tenantDatabase() {
  const calls = [];
  const stores = new Map([
    ['burger-tin.restia.net.ar', { id:'burger-tin', public_host:'burger-tin.restia.net.ar' }],
    ['glowro.restia.net.ar', { id:'glowro', public_host:'glowro.restia.net.ar' }]
  ]);
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            first: async () => {
              if (sql.includes('public_host = ?')) return stores.get(values[0]) || null;
              if (sql.includes('WHERE id = ?')) return [...stores.values()].find(store => store.id === values[0]) || null;
              return null;
            },
            all: async () => ({ results:values[0] === 'glowro'
              ? [{ id:'serum', name:'Sérum', description:'GlowRo', category:'Facial', price:12000, default_image:'serum.webp', image_type:null, image_updated_at:null, updated_at:'2026-10-26' }]
              : [{ id:'burger', name:'Burger', description:'Burger Tin', category:'Hamburguesas', price:9000, default_image:'burger.webp', image_type:null, image_updated_at:null, updated_at:'2026-10-26' }]
            })
          };
        }
      };
    }
  };
}

test('resuelve GlowRo por el origen y no cae en Burger Tin', async () => {
  const DB = tenantDatabase();
  const request = new Request('https://api.example/api/catalog', { headers:{ origin:'https://glowro.restia.net.ar' } });
  assert.equal(await publicStoreId(request, { DB, ALLOWED_ORIGIN:'' }), 'glowro');
});

test('separa el acceso del mismo usuario por empresa y el Super Admin', async () => {
  const DB = tenantDatabase();
  const request = new Request('https://api.example/api/auth/challenge', { headers:{ origin:'https://glowro.restia.net.ar' } });
  assert.equal(await authenticationStoreId(request, { DB, ALLOWED_ORIGIN:'' }, 'store'), 'glowro');
  assert.equal(await authenticationStoreId(request, { DB, ALLOWED_ORIGIN:'' }, 'platform'), 'platform');
});

test('rechaza mezclar el origen de GlowRo con otro store solicitado', async () => {
  const DB = tenantDatabase();
  const request = new Request('https://api.example/api/catalog/images/x?store=burger-tin', { headers:{ origin:'https://glowro.restia.net.ar' } });
  await assert.rejects(() => publicStoreId(request, { DB, ALLOWED_ORIGIN:'' }, { allowQuery:true }), /no coincide/);
});

test('no asigna Burger Tin cuando falta identificar el comercio', async () => {
  const DB = tenantDatabase();
  const request = new Request('https://api.example/api/catalog');
  await assert.rejects(() => publicStoreId(request, { DB, ALLOWED_ORIGIN:'' }), /identificar la empresa/);
});

test('el catálogo consulta únicamente el store indicado', async () => {
  const DB = tenantDatabase();
  const products = await catalogProducts({ DB, PUBLIC_API_URL:'https://api.example' }, 'glowro');
  assert.deepEqual(products.map(product => product.name), ['Sérum']);
  const catalogQuery = DB.calls.find(call => call.sql.includes('FROM products WHERE store_id'));
  assert.deepEqual(catalogQuery.values, ['glowro']);
});

test('el catálogo falla cerrado si falta identificar la empresa', async () => {
  const DB = tenantDatabase();
  await assert.rejects(() => catalogProducts({ DB }, ''), /Falta identificar/);
});

test('convierte el BLOB de D1 a bytes antes de servir una imagen', () => {
  const jpegFromD1 = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
  const bytes = productImageBytes(jpegFromD1);
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes], jpegFromD1);
});
