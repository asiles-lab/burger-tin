import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOrderCode, timingSafeEqualText, validateOrderInput } from '../src/domain.js';

const products = [{ id: 'burger', name: 'Burger', price: 5000 }];

test('calcula precios en el servidor e ignora precios enviados', () => {
  const result = validateOrderInput({ name:'Ana', fulfillment:'pickup', paymentMethod:'cash', items:[{ id:'burger', quantity:2, price:1 }] }, products);
  assert.equal(result.subtotal, 10000);
});

test('rechaza productos duplicados o desconocidos', () => {
  assert.throws(() => validateOrderInput({ name:'Ana', fulfillment:'pickup', paymentMethod:'cash', items:[{id:'x',quantity:1}] }, products));
});

test('genera codigo legible', () => {
  assert.match(makeOrderCode(new Date('2026-10-23T00:00:00Z'), 'abcdef00-0000-0000-0000-000000000000'), /^BT-261023-ABCDEF$/);
});

test('compara tokens', () => {
  assert.equal(timingSafeEqualText('secreto', 'secreto'), true);
  assert.equal(timingSafeEqualText('secreto', 'otro'), false);
});
