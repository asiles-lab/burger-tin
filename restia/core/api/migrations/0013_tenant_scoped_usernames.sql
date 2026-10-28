DROP INDEX IF EXISTS admin_profiles_username_idx;

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_store_username_idx
ON admin_profiles(store_id, lower(username))
WHERE username IS NOT NULL;
