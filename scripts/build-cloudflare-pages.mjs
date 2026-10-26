import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.cloudflare-dist');
const store = join(output, 'burger-tin');
const platform = join(output, 'restia-admin');

await rm(output, { recursive:true, force:true });
await mkdir(join(store, 'admin'), { recursive:true });
await mkdir(platform, { recursive:true });

const copy = (name, destination = store) => cp(join(root, name), join(destination, name), { recursive:true });
for (const name of ['analytics-config.js','analytics.mjs','app.mjs','assets','catalog.json','checkout-config.js','index.html','order.mjs','styles-v2.css','panel-pro.css','panel-pro.mjs']) await copy(name);

const localAdmin = (await readFile(join(root, 'admin.html'), 'utf8')).replace('<head>', '<head><base href="/">');
await writeFile(join(store, 'admin', 'index.html'), localAdmin);
await writeFile(join(store, '_redirects'), '/admin /admin/ 301\n');

for (const name of ['assets','checkout-config.js','panel-pro.css','platform.css','restia-platform.css','platform-v2.mjs']) await copy(name, platform);
const superAdmin = (await readFile(join(root, 'platform.html'), 'utf8'))
  .replace('<head>', '<head><base href="/">')
  .replaceAll('href="admin.html"', 'href="https://burger-tin.restia.net.ar/admin/"');
await writeFile(join(platform, 'index.html'), superAdmin);

console.log(`Cloudflare Pages listo en ${output}`);
