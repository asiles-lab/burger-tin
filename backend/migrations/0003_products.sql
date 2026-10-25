CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  default_image TEXT,
  image_data BLOB,
  image_type TEXT,
  image_updated_at TEXT,
  sort_order INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX products_sort_idx ON products(sort_order);
