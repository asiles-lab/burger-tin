PRAGMA foreign_keys = OFF;

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO stores (id, name, active, created_at, updated_at)
VALUES ('burger-tin', 'Burger Tin', 1, datetime('now'), datetime('now'));

ALTER TABLE orders ADD COLUMN store_id TEXT NOT NULL DEFAULT 'burger-tin';
ALTER TABLE products ADD COLUMN store_id TEXT NOT NULL DEFAULT 'burger-tin';

CREATE INDEX orders_store_status_created_idx ON orders(store_id, status, created_at DESC);
CREATE INDEX products_store_sort_idx ON products(store_id, active, sort_order);

ALTER TABLE store_settings RENAME TO store_settings_legacy;
CREATE TABLE store_settings (
  store_id TEXT NOT NULL REFERENCES stores(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, key)
);
INSERT INTO store_settings (store_id, key, value, secret, updated_at)
SELECT 'burger-tin', key, value, secret, updated_at FROM store_settings_legacy;
DROP TABLE store_settings_legacy;

ALTER TABLE order_counters RENAME TO order_counters_legacy;
CREATE TABLE order_counters (
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  PRIMARY KEY (store_id, name)
);
INSERT INTO order_counters (store_id, name, value)
SELECT 'burger-tin', name, value FROM order_counters_legacy;
DROP TABLE order_counters_legacy;

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_store_created_idx ON audit_log(store_id, created_at DESC);

PRAGMA foreign_keys = ON;
