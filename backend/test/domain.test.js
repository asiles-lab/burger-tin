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

test('conserva centavos de GlowRo al calcular un carrito con varias unidades', () => {
  const glowro = [{ id:'kit', name:'Kit facial', price:67991.5 }, { id:'gel', name:'Gel', price:12351 }];
  const result = validateOrderInput({ name:'Prueba', phone:'11 1234 5678', fulfillment:'delivery', address:'Calle de prueba 123', paymentMethod:'mercadopago', items:[{id:'kit',quantity:2,price:1},{id:'gel',quantity:1}] }, glowro);
  assert.equal(result.subtotal, 148334);
  assert.equal(result.phone, '1112345678');
});

test('genera codigos correlativos con letras y tres digitos', () => {
  assert.equal(formatOrderCode(1), 'A-001');
  assert.equal(formatOrderCode(999), 'A-999');
  assert.equal(formatOrderCode(1000), 'B-001');
  assert.equal(formatOrderCode(25974), 'Z-999');
  assert.equal(formatOrderCode(25975), 'A-001');
  assert.equal(formatOrderCode(25976), 'A-002');
  assert.throws(() => formatOrderCode(0));
});

test('compara tokens', () => {
  assert.equal(timingSafeEqualText('secreto', 'secreto'), true);
  assert.equal(timingSafeEqualText('secreto', 'otro'), false);
});
