CREATE TABLE sale_email_notifications (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  provider_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE (store_id, order_id)
);

CREATE INDEX sale_email_notifications_due_idx
ON sale_email_notifications(status, next_attempt_at, created_at);

-- La función se habilita inicialmente solo para GlowRo. Otros comercios pueden
-- activarla desde configuración cuando tengan un correo de ventas definido.
INSERT INTO store_settings (store_id, key, value, secret, updated_at)
VALUES ('glowro', 'sales_notification_enabled', '1', 0, datetime('now'))
ON CONFLICT(store_id, key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

-- El correo no se fija en el repositorio. Se toma del administrador principal
-- de GlowRo y luego puede reemplazarse por una casilla operativa del comercio.
INSERT INTO store_settings (store_id, key, value, secret, updated_at)
SELECT 'glowro', 'sales_notification_email', email, 1, datetime('now')
FROM admin_profiles
WHERE store_id = 'glowro' AND active = 1 AND email IS NOT NULL AND trim(email) <> ''
ORDER BY
  CASE WHEN lower(role) = 'administrador' THEN 0 ELSE 1 END,
  created_at ASC
LIMIT 1
ON CONFLICT(store_id, key) DO NOTHING;
