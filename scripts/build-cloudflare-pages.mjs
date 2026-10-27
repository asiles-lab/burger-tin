import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.cloudflare-dist');
const store = join(output, 'burger-tin');
const platform = join(output, 'restia-admin');
const landing = join(output, 'restia-site');

await rm(output, { recursive:true, force:true });
await mkdir(join(store, 'admin'), { recursive:true });
await mkdir(platform, { recursive:true });
await mkdir(landing, { recursive:true });

const copy = (name, destination = store) => cp(join(root, name), join(destination, name), { recursive:true });
for (const name of ['_headers','analytics-config.js','analytics.mjs','app.mjs','assets','catalog.json','checkout-config.js','index.html','order.mjs','privacidad.html','robots.txt','sitemap.xml','styles-v2.css','clean-food.css','terminos.html','panel-pro.css','panel-pro.mjs','restia-platform.css']) await copy(name);

const localAdmin = (await readFile(join(root, 'admin.html'), 'utf8')).replace('<head>', '<head><base href="/">');
await writeFile(join(store, 'admin', 'index.html'), localAdmin);
await writeFile(join(store, '_redirects'), '/admin /admin/ 301\n');

for (const name of ['_headers','assets','checkout-config.js','panel-pro.css','platform.css','restia-platform.css','platform-v2.mjs']) await copy(name, platform);
const superAdmin = (await readFile(join(root, 'platform.html'), 'utf8'))
  .replace('<head>', '<head><base href="/">')
  .replaceAll('href="admin.html"', 'href="https://burger-tin.restia.net.ar/admin/"');
await writeFile(join(platform, 'index.html'), superAdmin);

await cp(join(root, 'restia-site'), landing, { recursive:true });
for (const name of ['analytics-config.js','analytics.mjs']) await copy(name, landing);

console.log(`Cloudflare Pages listo en ${output}`);
