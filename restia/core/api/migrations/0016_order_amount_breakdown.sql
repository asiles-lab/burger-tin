ALTER TABLE orders ADD COLUMN product_subtotal NUMERIC;
ALTER TABLE orders ADD COLUMN shipping_fee NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0);
ALTER TABLE orders ADD COLUMN total NUMERIC;

UPDATE orders
SET product_subtotal = COALESCE((
      SELECT ROUND(SUM(order_items.subtotal), 2)
      FROM order_items
      WHERE order_items.order_id = orders.id
        AND order_items.store_id = orders.store_id
    ), subtotal),
    shipping_fee = ROUND(MAX(0, subtotal - COALESCE((
      SELECT SUM(order_items.subtotal)
      FROM order_items
      WHERE order_items.order_id = orders.id
        AND order_items.store_id = orders.store_id
    ), subtotal)), 2),
    total = subtotal;
