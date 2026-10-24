CREATE TABLE order_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0)
);

INSERT INTO order_counters (name, value) VALUES ('orders', 0);
