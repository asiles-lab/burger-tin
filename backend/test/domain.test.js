import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderCode, timingSafeEqualText, validateOrderInput } from '../src/domain.js';

const products = [{ id: 'burger', name: 'Burger', price: 5000 }];

test('calcula precios en el servidor e ignora precios enviados', () => {
  const result = validateOrderInput({ name:'Ana', fulfillment:'pickup', paymentMethod:'cash', items:[{ id:'burger', quantity:2, price:1 }] }, products);
  assert.equal(result.subtotal, 10000);
});

test('rechaza productos duplicados o desconocidos', () => {
  assert.throws(() => validateOrderInput({ name:'Ana', fulfillment:'pickup', paymentMethod:'cash', items:[{id:'x',quantity:1}] }, products));
});

test('genera codigos correlativos con letras y tres digitos', () => {
  assert.equal(formatOrderCode(1), 'A-001');
  assert.equal(formatOrderCode(999), 'A-999');
  assert.equal(formatOrderCode(1000), 'B-001');
  assert.equal(formatOrderCode(25974), 'Z-999');
  assert.equal(formatOrderCode(25975), 'AA-001');
  assert.throws(() => formatOrderCode(0));
});

test('compara tokens', () => {
  assert.equal(timingSafeEqualText('secreto', 'secreto'), true);
  assert.equal(timingSafeEqualText('secreto', 'otro'), false);
});
