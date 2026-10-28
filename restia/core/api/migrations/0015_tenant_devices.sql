-- Defensa en profundidad para datos operativos y credenciales individuales de impresión.

ALTER TABLE order_items ADD COLUMN store_id TEXT REFERENCES stores(id);
UPDATE order_items
SET store_id = (SELECT store_id FROM orders WHERE orders.id = order_items.order_id)
WHERE store_id IS NULL;
CREATE INDEX order_items_store_order_idx ON order_items(store_id, order_id, id);

ALTER TABLE print_jobs ADD COLUMN store_id TEXT REFERENCES stores(id);
UPDATE print_jobs
SET store_id = (SELECT store_id FROM orders WHERE orders.id = print_jobs.order_id)
WHERE store_id IS NULL;
CREATE INDEX print_jobs_store_status_created_idx ON print_jobs(store_id, status, created_at);

CREATE TRIGGER order_items_tenant_guard_insert
BEFORE INSERT ON order_items
WHEN NEW.store_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM orders WHERE id = NEW.order_id AND store_id = NEW.store_id
)
BEGIN
  SELECT RAISE(ABORT, 'order_items tenant mismatch');
END;

CREATE TRIGGER order_items_tenant_guard_update
BEFORE UPDATE OF order_id, store_id ON order_items
WHEN NEW.store_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM orders WHERE id = NEW.order_id AND store_id = NEW.store_id
)
BEGIN
  SELECT RAISE(ABORT, 'order_items tenant mismatch');
END;

CREATE TRIGGER print_jobs_tenant_guard_insert
BEFORE INSERT ON print_jobs
WHEN NEW.store_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM orders WHERE id = NEW.order_id AND store_id = NEW.store_id
)
BEGIN
  SELECT RAISE(ABORT, 'print_jobs tenant mismatch');
END;

CREATE TRIGGER print_jobs_tenant_guard_update
BEFORE UPDATE OF order_id, store_id ON print_jobs
WHEN NEW.store_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM orders WHERE id = NEW.order_id AND store_id = NEW.store_id
)
BEGIN
  SELECT RAISE(ABORT, 'print_jobs tenant mismatch');
END;

CREATE TABLE print_devices (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_id, name)
);

CREATE INDEX print_devices_store_active_idx
ON print_devices(store_id, active, name);
