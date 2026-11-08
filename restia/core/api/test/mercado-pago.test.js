import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoPagoCharge, orderPaymentAmounts } from '../src/mercado-pago.js';

const order = shippingFee => ({
  items:[
    { productId:'serum', name:'Sérum', quantity:2, unitPrice:7945, subtotal:15890 }
  ],
  productSubtotal:15890,
  shippingFee,
  total:15890 + shippingFee
});

test('Mercado Pago cobra productos y envío una sola vez', () => {
  const charge = mercadoPagoCharge(order(5990));
  assert.equal(charge.items.length, 1);
  assert.deepEqual(charge.shipments, { cost:5990, mode:'not_specified' });
  assert.deepEqual(charge.amounts, { productSubtotal:15890, shippingFee:5990, total:21880 });
  const preferenceTotal = charge.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) + charge.shipments.cost;
  assert.equal(preferenceTotal, 21880);
});

test('retiro, envío gratis y entrega a coordinar no agregan un cargo', () => {
  const charge = mercadoPagoCharge(order(0));
  assert.equal(charge.shipments, undefined);
  assert.deepEqual(charge.amounts, { productSubtotal:15890, shippingFee:0, total:15890 });
});

test('rechaza una orden cuyo total declarado no coincide', () => {
  assert.throws(() => orderPaymentAmounts({ ...order(5990), total:15890 }), /total a cobrar no coincide/);
});
