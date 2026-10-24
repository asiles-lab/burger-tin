export function validateOrderInput(input, products) {
  if (!input || typeof input !== 'object') throw new Error('Pedido invalido.');
  const name = String(input.name || '').trim();
  const fulfillment = String(input.fulfillment || '');
  const address = String(input.address || '').trim();
  const notes = String(input.notes || '').trim();
  const paymentMethod = String(input.paymentMethod || '');
  if (name.length < 2 || name.length > 80) throw new Error('Nombre invalido.');
  if (!['delivery', 'pickup'].includes(fulfillment)) throw new Error('Modalidad invalida.');
  if (fulfillment === 'delivery' && (address.length < 5 || address.length > 250)) throw new Error('Direccion invalida.');
  if (notes.length > 500) throw new Error('Las aclaraciones son demasiado largas.');
  if (!['cash', 'mercadopago'].includes(paymentMethod)) throw new Error('Medio de pago invalido.');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new Error('Pedido vacio o demasiado grande.');

  const productMap = new Map(products.map(product => [product.id, product]));
  const seen = new Set();
  const items = input.items.map(item => {
    const id = String(item.id || '');
    const quantity = Number(item.quantity);
    const product = productMap.get(id);
    if (!product || seen.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 30) throw new Error('Productos o cantidades invalidos.');
    seen.add(id);
    return { productId: id, name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw new Error('Total invalido.');
  return { name, fulfillment, address: fulfillment === 'delivery' ? address : '', notes, paymentMethod, items, subtotal };
}

export function makeOrderCode(now = new Date(), uuid = crypto.randomUUID()) {
  const date = now.toISOString().slice(2, 10).replaceAll('-', '');
  return `BT-${date}-${uuid.replaceAll('-', '').slice(0, 6).toUpperCase()}`;
}

export function timingSafeEqualText(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  if (a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index += 1) different |= a[index] ^ b[index];
  return different === 0;
}

export function formatMoney(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}
