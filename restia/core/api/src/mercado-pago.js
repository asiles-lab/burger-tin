const money = value => Math.round(Number(value) * 100) / 100;

export function orderPaymentAmounts(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) throw new Error('La orden no tiene productos para cobrar.');
  const productSubtotal = money(order.items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = money(quantity * unitPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('La orden contiene importes inválidos.');
    if (item.subtotal !== undefined && money(item.subtotal) !== lineTotal) throw new Error('El subtotal de un producto no coincide con su precio.');
    return sum + lineTotal;
  }, 0));
  const shippingFee = money(order.shippingFee || 0);
  const total = money(productSubtotal + shippingFee);
  if (!Number.isFinite(shippingFee) || shippingFee < 0) throw new Error('El costo de envío no es válido.');
  if (order.productSubtotal !== undefined && money(order.productSubtotal) !== productSubtotal) throw new Error('El subtotal de productos no coincide con la orden.');
  if (order.total !== undefined && money(order.total) !== total) throw new Error('El total a cobrar no coincide con la orden.');
  return { productSubtotal, shippingFee, total };
}

export function mercadoPagoCharge(order) {
  const amounts = orderPaymentAmounts(order);
  const items = order.items.map(item => ({
    id:item.productId,
    title:item.name,
    currency_id:'ARS',
    quantity:item.quantity,
    unit_price:item.unitPrice
  }));
  return {
    items,
    ...(amounts.shippingFee > 0 ? { shipments:{ cost:amounts.shippingFee, mode:'not_specified' } } : {}),
    amounts
  };
}
