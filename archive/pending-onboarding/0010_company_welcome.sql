ALTER TABLE stores ADD COLUMN initial_admin_profile_id TEXT;
ALTER TABLE stores ADD COLUMN welcome_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN welcome_status TEXT NOT NULL DEFAULT 'not_scheduled';
ALTER TABLE stores ADD COLUMN welcome_error TEXT;
ALTER TABLE stores ADD COLUMN welcome_next_check_at TEXT;

CREATE TABLE company_invitations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expected_password_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  encrypted_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  claim_id TEXT,
  sent_at TEXT,
  provider_id TEXT,
  used_at TEXT,
  consumed_nonce TEXT
);

CREATE INDEX stores_welcome_due_idx ON stores(welcome_enabled, welcome_next_check_at);
