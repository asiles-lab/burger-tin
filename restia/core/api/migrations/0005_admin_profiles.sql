CREATE TABLE admin_profiles (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL DEFAULT 'burger-tin',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX admin_profiles_store_idx ON admin_profiles(store_id, active, name);
