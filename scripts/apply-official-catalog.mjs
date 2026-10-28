import { access, readFile, writeFile } from 'node:fs/promises';

const catalogUrl = new URL('../tenants/burger-tin/catalog.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));

const imageById = {
  'promo-doble-cheddar': 'promo-doble-cheddar.jpg',
  'promo-doble-bacon': 'promo-doble-bacon.jpg',
  'promo-triple-cheese': 'promo-triple-cheese.jpg',
  'promo-cuatro-simple': 'promo-cuatro-simple.jpg',
  'triple-cheeseburger': 'triple-cheeseburger.jpg',
  'ranch-doble': 'ranch-doble.jpg',
  'cuadruple-americana': 'cuadruple-americana.jpg',
  tasty: 'tasty.jpg',
  'cuadruple-bacon': 'cuadruple-bacon.jpg',
  'triple-oklahoma': 'triple-oklahoma.jpg',
  'triple-americana': 'triple-americana.jpg',
  'triple-bacon': 'triple-bacon.jpg',
  'triple-clasica': 'triple-clasica.jpg',
  simple: 'simple.jpg',
  kid: 'kid.jpg',
  'simple-americana': 'simple-americana.jpg',
  'simple-bacon': 'simple-bacon.jpg',
  'simple-oklahoma': 'simple-oklahoma.jpg',
  cheeseburger: 'cheeseburger.jpg',
  'doble-bacon': 'doble-bacon.jpg',
  'doble-americana': 'doble-americana.jpg',
  'doble-oklahoma': 'doble-oklahoma.jpg',
  'doble-clasica': 'doble-clasica.jpg',
  'sanguche-lt': 'sanguches.jpg',
  'sanguche-lt-papas': 'sanguches.jpg',
  'sanguche-huevo': 'sanguches.jpg',
  'sanguche-huevo-papas': 'sanguches.jpg',
  'sanguche-bacon': 'sanguches.jpg',
  'sanguche-bacon-papas': 'sanguches.jpg',
  'papas-tasty': 'papas-tasty.jpg',
  'papas-tasty-bacon': 'papas-tasty-bacon.jpg',
  'nuggets-papas': 'nuggets-papas.jpg',
  'nuggets-12': 'nuggets-12.jpg',
  'nuggets-6': 'nuggets-6.jpg',
  'papas-cheddar-bacon': 'papas-cheddar-bacon.jpg',
  'extra-huevo': 'extra-huevo.jpg',
  'extra-cheddar-bacon': 'extra-cheddar-bacon.jpg',
  'pileta-cheddar': 'pileta-cheddar.jpg',
  'cheddar-chiquito': 'cheddar-chiquito.jpg',
};

const missingProducts = [
  { id: 'doble-bacon', name: 'Doble Bacon', price: 12500, category: 'Hamburguesas', description: 'Doble carne, tres fetas de cheddar, bacon y salsa de ketchup, mayonesa y cebolla.' },
  { id: 'doble-americana', name: 'Americana', price: 12500, category: 'Hamburguesas', description: 'Doble carne, lechuga, tomate, tres fetas de cheddar, cebolla morada y salsa thousand island.' },
  { id: 'doble-oklahoma', name: 'Doble Oklahoma', price: 12500, category: 'Hamburguesas', description: 'Doble carne, cuatro fetas de cheddar y cebolla cruda.' },
  { id: 'doble-clasica', name: 'Doble Clásica', price: 12500, category: 'Hamburguesas', description: 'Doble carne, tres fetas de cheddar, lechuga, tomate y cebolla caramelizada.' },
];

const cheeseburgerIndex = catalog.products.findIndex(product => product.id === 'cheeseburger');
const newProducts = missingProducts.filter(product => !catalog.products.some(existing => existing.id === product.id));
catalog.products.splice(cheeseburgerIndex + 1, 0, ...newProducts);

catalog.phone = '5491127798677';
catalog.source = 'https://wa.me/c/5491127798677';
catalog.verifiedAt = '2026-10-24';

for (const product of catalog.products) {
  const filename = imageById[product.id];
  if (!filename) throw new Error(`No official image mapping for ${product.id}`);
  product.image = `assets/catalog/${filename}`;
  await access(new URL(`../${product.image}`, import.meta.url));
}

await writeFile(catalogUrl, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Catalog updated: ${catalog.products.length} selectable products, all with official photos.`);
