import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.cloudflare-dist');
const store = join(output, 'burger-tin');
const platform = join(output, 'restia-admin');
const landing = join(output, 'restia-site');
const burgerSource = join(root, 'tenants', 'burger-tin');
const platformSource = join(root, 'apps', 'restia-admin');
const landingSource = join(root, 'apps', 'restia-site');
const adminUiSource = join(root, 'packages', 'admin-ui');

await rm(output, { recursive:true, force:true });
await mkdir(join(store, 'admin'), { recursive:true });
await mkdir(platform, { recursive:true });
await mkdir(landing, { recursive:true });

const copyFrom = (source, name, destination) => cp(join(source, name), join(destination, name), { recursive:true });
for (const name of ['_headers','analytics-config.js','analytics.mjs','app.mjs','assets','catalog.json','checkout-config.js','index.html','order.mjs','privacidad.html','robots.txt','sitemap.xml','styles-v2.css','terminos.html','panel-pro.mjs']) {
  await copyFrom(burgerSource, name, store);
}
for (const name of ['panel-pro.css','restia-platform.css']) await copyFrom(adminUiSource, name, store);

const localAdmin = (await readFile(join(burgerSource, 'admin.html'), 'utf8')).replace('<head>', '<head><base href="/">');
await writeFile(join(store, 'admin', 'index.html'), localAdmin);
await writeFile(join(store, '_redirects'), '/admin /admin/ 301\n');

for (const name of ['_headers','assets','checkout-config.js']) await copyFrom(burgerSource, name, platform);
for (const name of ['panel-pro.css','restia-platform.css']) await copyFrom(adminUiSource, name, platform);
for (const name of ['platform.css','platform-v2.mjs']) await copyFrom(platformSource, name, platform);
const superAdmin = (await readFile(join(platformSource, 'platform.html'), 'utf8'))
  .replace('<head>', '<head><base href="/">')
  .replaceAll('href="admin.html"', 'href="https://burger-tin.restia.net.ar/admin/"');
await writeFile(join(platform, 'index.html'), superAdmin);

await cp(landingSource, landing, { recursive:true });
for (const name of ['analytics-config.js','analytics.mjs']) await copyFrom(burgerSource, name, landing);

console.log(`Cloudflare Pages listo en ${output}`);
