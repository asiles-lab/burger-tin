ALTER TABLE admin_profiles ADD COLUMN username TEXT;
ALTER TABLE admin_profiles ADD COLUMN password_hash TEXT;
ALTER TABLE admin_profiles ADD COLUMN password_salt TEXT;
ALTER TABLE admin_profiles ADD COLUMN password_iterations INTEGER;
ALTER TABLE admin_profiles ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_profiles ADD COLUMN locked_until TEXT;
ALTER TABLE admin_profiles ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));

CREATE UNIQUE INDEX admin_profiles_username_idx ON admin_profiles(lower(username)) WHERE username IS NOT NULL;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);
