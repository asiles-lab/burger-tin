CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('delivery', 'pickup')),
  address TEXT,
  notes TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mercadopago')),
  status TEXT NOT NULL CHECK (status IN ('pending_cash', 'pending_payment', 'confirmed', 'cancelled')),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  mp_preference_id TEXT,
  mp_payment_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 30),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'leased', 'printed', 'failed')),
  device_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_until TEXT,
  created_at TEXT NOT NULL,
  printed_at TEXT,
  last_error TEXT
);

CREATE INDEX orders_status_created_idx ON orders(status, created_at DESC);
CREATE INDEX print_jobs_status_created_idx ON print_jobs(status, created_at);
