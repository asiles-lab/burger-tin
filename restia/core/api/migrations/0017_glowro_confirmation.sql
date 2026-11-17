ALTER TABLE orders ADD COLUMN customer_email TEXT;
ALTER TABLE orders ADD COLUMN confirmation_token_hash TEXT;
CREATE UNIQUE INDEX orders_confirmation_token_idx ON orders(confirmation_token_hash);
CREATE TABLE glowro_confirmation_emails (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('buyer','internal')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  lease_until TEXT,
  next_attempt_at TEXT,
  provider_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  PRIMARY KEY(order_id, kind)
);
CREATE INDEX glowro_confirmation_due_idx ON glowro_confirmation_emails(status, next_attempt_at);
