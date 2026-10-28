import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const requestedEnvironment = process.argv.find(argument => argument.startsWith('--environment='))?.split('=', 2)[1] || 'production';
if (!['production', 'qa'].includes(requestedEnvironment)) throw new Error(`Ambiente desconocido: ${requestedEnvironment}`);
const environmentConfig = JSON.parse(await readFile(join(root, 'restia', 'environments', `${requestedEnvironment}.json`), 'utf8'));
const output = requestedEnvironment === 'production'
  ? join(root, '.cloudflare-dist')
  : join(root, '.cloudflare-dist', requestedEnvironment);
const store = join(output, 'burger-tin');
const platform = join(output, 'restia-admin');
const landing = join(output, 'restia-site');
const glowro = join(output, 'glowro');
const burgerSiteSource = join(root, 'clients', 'burger-tin', 'site');
const burgerAdminSource = join(root, 'clients', 'burger-tin', 'admin');
const burgerConfigSource = join(root, 'clients', 'burger-tin', 'config');
const glowroSiteSource = join(root, 'clients', 'glowro', 'site');
const glowroAdminSource = join(root, 'clients', 'glowro', 'admin');
const platformSource = join(root, 'restia', 'admin');
const landingSource = join(root, 'restia', 'site');
const coreSource = join(root, 'restia', 'core');
const adminUiSource = join(coreSource, 'admin-ui');
const runtimeTemplate = await readFile(join(coreSource, 'runtime-config.js'), 'utf8');

await rm(output, { recursive:true, force:true });
await mkdir(join(store, 'admin'), { recursive:true });
await mkdir(platform, { recursive:true });
await mkdir(landing, { recursive:true });
await mkdir(glowro, { recursive:true });

const copyFrom = (source, name, destination) => cp(join(source, name), join(destination, name), { recursive:true });
const runtimeConfig = storeId => runtimeTemplate
  .replaceAll('__RESTIA_API__', environmentConfig.apiBaseUrl)
  .replaceAll('__RESTIA_STORE_ID__', storeId);
const writeRuntime = (destination, storeId) => writeFile(join(destination, 'checkout-config.js'), runtimeConfig(storeId));
const writeHeaders = async (source, destination) => {
  const headers = await readFile(source, 'utf8');
  await writeFile(destination, headers.replaceAll('__RESTIA_API__', environmentConfig.apiBaseUrl));
};
for (const name of ['_headers','analytics-config.js','analytics.mjs','app.mjs','assets','index.html','order.mjs','privacidad.html','robots.txt','sitemap.xml','styles-v2.css','terminos.html']) {
  await copyFrom(burgerSiteSource, name, store);
}
await writeHeaders(join(burgerSiteSource, '_headers'), join(store, '_headers'));
await copyFrom(burgerConfigSource, 'catalog.json', store);
await writeRuntime(store, 'burger-tin');
await copyFrom(burgerAdminSource, 'panel-pro.mjs', store);
await copyFrom(adminUiSource, 'print-devices.mjs', store);
for (const name of ['panel-pro.css','restia-platform.css']) await copyFrom(adminUiSource, name, store);

const localAdmin = (await readFile(join(burgerAdminSource, 'index.html'), 'utf8')).replace('<head>', '<head><base href="/">');
await writeFile(join(store, 'admin', 'index.html'), localAdmin);
await writeFile(join(store, '_redirects'), '/admin /admin/ 301\n');

await copyFrom(burgerSiteSource, '_headers', platform);
await cp(join(landingSource, 'assets'), join(platform, 'assets'), { recursive:true });
await cp(join(burgerSiteSource, 'assets', 'logo-burger-tun.png'), join(platform, 'assets', 'logo-burger-tun.png'));
await writeRuntime(platform, 'platform');
for (const name of ['panel-pro.css','restia-platform.css']) await copyFrom(adminUiSource, name, platform);
for (const name of ['platform.css','platform-v2.mjs']) await copyFrom(platformSource, name, platform);
const superAdmin = (await readFile(join(platformSource, 'platform.html'), 'utf8'))
  .replace('<head>', '<head><base href="/">')
  .replaceAll('href="admin.html"', 'href="https://burger-tin.restia.net.ar/admin/"');
await writeFile(join(platform, 'index.html'), superAdmin);

await cp(landingSource, landing, { recursive:true });
for (const name of ['analytics-config.js','analytics.mjs']) await copyFrom(burgerSiteSource, name, landing);

await cp(glowroSiteSource, glowro, { recursive:true });
await cp(glowroAdminSource, join(glowro, 'admin'), { recursive:true });
await copyFrom(adminUiSource, 'print-devices.mjs', join(glowro, 'admin'));
await writeRuntime(glowro, 'glowro');
await writeRuntime(join(glowro, 'admin'), 'glowro');
await writeHeaders(join(glowroSiteSource, '_headers'), join(glowro, '_headers'));

console.log(`Cloudflare Pages (${requestedEnvironment}) listo en ${output}`);
