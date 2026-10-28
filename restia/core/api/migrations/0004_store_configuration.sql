ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));

CREATE TABLE store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
  updated_at TEXT NOT NULL
);
