import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error('Uso: node generate-glowro-seed.mjs catalog.js migration.sql');
const source = readFileSync(sourcePath, 'utf8');
const products = runInNewContext(`${source}\nPRODUCTS`, {});
const quote = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const rows = products.map((product, index) => {
  const values = [product.id, product.name, product.description, product.category, product.price, product.image, index];
  return `INSERT OR IGNORE INTO products (id, name, description, category, price, default_image, sort_order, updated_at, active, store_id) VALUES (${values.map(quote).join(', ')}, datetime('now'), 1, 'glowro');`;
});
writeFileSync(outputPath, [
  '-- GlowRo: catálogo inicial. Después de esta carga, el panel es la fuente de precios e imágenes.',
  'ALTER TABLE orders ADD COLUMN customer_phone TEXT;',
  "INSERT OR IGNORE INTO stores (id, name, active, created_at, updated_at, slug, public_host, setup_status, route_status, dns_status, worker_service) VALUES ('glowro', 'GlowRo', 1, datetime('now'), datetime('now'), 'glowro', 'glowro.restia.net.ar', 'activo', 'activo', 'activo', 'restia-tenant-glowro');",
  "INSERT OR IGNORE INTO order_counters (store_id, name, value) VALUES ('glowro', 'orders', 0);",
  ...rows,
  "UPDATE stores SET name = 'GlowRo', setup_status = 'activo', route_status = 'activo', dns_status = 'activo', worker_service = 'restia-tenant-glowro', updated_at = datetime('now') WHERE id = 'glowro' AND public_host = 'glowro.restia.net.ar';",
  "INSERT INTO store_settings (store_id, key, value, secret, updated_at) VALUES ('glowro', 'business', 'GlowRo', 0, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;",
  ''
].join('\n'));
