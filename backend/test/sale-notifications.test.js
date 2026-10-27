import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSaleEmail } from '../src/sale-notifications.js';

test('el correo de venta detalla cantidades, precios, total, envío y datos operativos', () => {
  const email = buildSaleEmail({
    store: { name:'GlowRo' },
    order: {
      code:'GR-000123',
      customer_name:'Andrea',
      customer_phone:'5491112345678',
      fulfillment:'delivery',
      address:'Calle 123',
      notes:'Tocar timbre B',
      subtotal:28500,
      confirmed_at:'2026-10-27T19:15:00.000Z'
    },
    items:[
      { name:'Sérum hidratante', quantity:2, unit_price:10000, subtotal:20000 },
      { name:'Crema facial', quantity:1, unit_price:5000, subtotal:5000 }
    ]
  });
  assert.match(email.subject, /GR-000123/);
  assert.match(email.text, /2 x Sérum hidratante/);
  assert.match(email.text, /Envío: \$\s?3\.500/);
  assert.match(email.text, /TOTAL COBRADO: \$\s?28\.500/);
  assert.match(email.text, /Calle 123/);
  assert.match(email.html, /Tocar timbre B/);
});

test('el contenido ingresado por el cliente se escapa en HTML', () => {
  const email = buildSaleEmail({
    store: { name:'GlowRo' },
    order: {
      code:'GR-000124',
      customer_name:'<script>alert(1)</script>',
      fulfillment:'pickup',
      subtotal:1000,
      confirmed_at:'2026-10-27T19:15:00.000Z'
    },
    items:[{ name:'Producto <b>especial</b>', quantity:1, unit_price:1000, subtotal:1000 }]
  });
  assert.doesNotMatch(email.html, /<script>/);
  assert.doesNotMatch(email.html, /<b>especial<\/b>/);
  assert.match(email.html, /&lt;script&gt;/);
});
