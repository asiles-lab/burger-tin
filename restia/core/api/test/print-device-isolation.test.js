import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPrintJob, printDeviceIdentity } from '../src/index.js';

function printerDatabase() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            first: async () => {
              if (sql.includes('FROM print_devices')) return { id:'device-glowro', store_id:'glowro', name:'Notebook GlowRo' };
              if (sql.includes('SELECT pj.id')) return { id:'print-glowro-42', order_id:42 };
              if (sql.includes('SELECT * FROM orders')) return { id:42, code:'GR-000042', confirmed_at:'2026-10-28T12:00:00.000Z', customer_name:'Cliente QA', fulfillment:'delivery', address:'QA 123', payment_method:'mercadopago', notes:'' };
              return null;
            },
            all: async () => ({ results:sql.includes('order_items') ? [{ quantity:1, name:'Producto GlowRo' }] : [] }),
            run: async () => ({ meta:{ changes:1 } })
          };
        }
      };
    }
  };
}

test('el token de impresora determina la empresa y nunca acepta store por query string', async () => {
  const DB = printerDatabase();
  const request = new Request('https://api.example/api/print-jobs/next?deviceId=falso&store=burger-tin', {
    headers:{ authorization:'Bearer token-secreto-glowro' }
  });
  const response = await nextPrintJob(request, { DB });
  assert.equal(response.status, 200);
  const job = await response.json();
  assert.equal(job.id, 'print-glowro-42');
  const jobQuery = DB.calls.find(call => call.sql.includes('SELECT pj.id'));
  assert.equal(jobQuery.values[0], 'glowro');
  const orderQuery = DB.calls.find(call => call.sql.includes('SELECT * FROM orders'));
  assert.equal(orderQuery.values[0], 'glowro');
});

test('la credencial de impresora se consulta por hash y devuelve su store', async () => {
  const DB = printerDatabase();
  const request = new Request('https://api.example/api/print-jobs/next', { headers:{ authorization:'Bearer token-plano' } });
  const identity = await printDeviceIdentity(request, { DB });
  assert.deepEqual(identity, { id:'device-glowro', storeId:'glowro', name:'Notebook GlowRo' });
  const authQuery = DB.calls.find(call => call.sql.includes('FROM print_devices'));
  assert.notEqual(authQuery.values[0], 'token-plano');
  assert.match(authQuery.values[0], /^[a-f0-9]{64}$/);
});
