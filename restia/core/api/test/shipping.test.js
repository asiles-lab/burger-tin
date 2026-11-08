import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShippingConfig, shippingMethodsForCart, validateShippingConfig } from '../src/shipping.js';

const config = validateShippingConfig({
  pickup:{ enabled:true, address:'Av. Siempre Viva 123', instructions:'Tocar timbre.' },
  delivery:{ enabled:true, freeAbove:50000, zones:[
    { id:'centro', name:'Centro', areas:['Palermo', 'Recoleta'], postalCodes:['1425'], fee:3500 }
  ] },
  coordinate:{ enabled:true, instructions:'Confirmamos el costo por mensaje.' }
});

test('calcula retiro, tarifa por zona y envío gratuito desde el monto configurado', () => {
  const standard = shippingMethodsForCart(config, { subtotal:40000, locality:'Palermo' });
  assert.deepEqual(standard.map(method => [method.id, method.fee]), [['pickup', 0], ['delivery', 3500], ['coordinate', null]]);
  const free = shippingMethodsForCart(config, { subtotal:50000, postalCode:'1425' });
  assert.equal(free.find(method => method.id === 'delivery').fee, 0);
});

test('no ofrece envío tarifado fuera de cobertura y no presenta coordinar como gratis', () => {
  const methods = shippingMethodsForCart(config, { subtotal:10000, locality:'Rosario', postalCode:'2000' });
  assert.equal(methods.some(method => method.id === 'delivery'), false);
  assert.equal(methods.find(method => method.id === 'coordinate').fee, null);
});

test('convierte la tarifa fija anterior en una zona compatible', () => {
  const legacy = normalizeShippingConfig(null, { deliveryFee:2500, deliveryZones:'' });
  const methods = shippingMethodsForCart(legacy, { subtotal:1000, locality:'Cualquier lugar' });
  assert.equal(methods.find(method => method.id === 'delivery').fee, 2500);
});

test('rechaza configuraciones activas sin cobertura', () => {
  assert.throws(() => validateShippingConfig({ pickup:{enabled:false}, delivery:{enabled:true,zones:[]}, coordinate:{enabled:false} }), /zona/);
  assert.throws(() => validateShippingConfig({ pickup:{enabled:false}, delivery:{enabled:true,zones:[{name:'Centro',allLocations:true,fee:-1}]}, coordinate:{enabled:false} }), /tarifa/);
});
