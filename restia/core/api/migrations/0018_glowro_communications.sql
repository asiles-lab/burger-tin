ALTER TABLE glowro_confirmation_emails ADD COLUMN content_json TEXT;
ALTER TABLE orders ADD COLUMN mp_status TEXT;
CREATE TABLE glowro_mail_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE glowro_messages (
 id TEXT PRIMARY KEY, order_id INTEGER REFERENCES orders(id), stage TEXT NOT NULL,
 recipient TEXT NOT NULL, content_json TEXT NOT NULL, actor TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, first_attempt_at TEXT, lease_until TEXT, next_attempt_at TEXT,
 provider_id TEXT, sent_at TEXT, last_error TEXT
);
CREATE INDEX glowro_messages_due ON glowro_messages(status,next_attempt_at);
CREATE TABLE glowro_mail_events (id INTEGER PRIMARY KEY, message_id TEXT NOT NULL, at TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, error TEXT);
CREATE TABLE glowro_withdrawals (id TEXT PRIMARY KEY, order_code TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, actor TEXT);
CREATE TABLE glowro_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'preparing';
