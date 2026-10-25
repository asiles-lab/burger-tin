import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const products = [
  ['promo-doble-cheddar', 'https://wa.me/p/24501502926189778/5491127798677'],
  ['promo-doble-bacon', 'https://wa.me/p/26211631998475245/5491127798677'],
  ['triple-cheeseburger', 'https://wa.me/p/6802426323143765/5491127798677'],
  ['ranch-doble', 'https://wa.me/p/28287588584227119/5491127798677'],
  ['sanguches', 'https://wa.me/p/26282915318037318/5491127798677'],
  ['promo-triple-cheese', 'https://wa.me/p/26584418291223649/5491127798677'],
  ['promo-cuatro-simple', 'https://wa.me/p/26197484073243371/5491127798677'],
  ['extra-huevo', 'https://wa.me/p/25861974343498605/5491127798677'],
  ['papas-tasty', 'https://wa.me/p/34750405351239684/5491127798677'],
  ['papas-tasty-bacon', 'https://wa.me/p/26093866053556062/5491127798677'],
  ['nuggets-papas', 'https://wa.me/p/24090395627323646/5491127798677'],
  ['cuadruple-americana', 'https://wa.me/p/32405970422380758/5491127798677'],
  ['nuggets-12', 'https://wa.me/p/25691032630502470/5491127798677'],
  ['nuggets-6', 'https://wa.me/p/25246271315043231/5491127798677'],
  ['tasty', 'https://wa.me/p/26180775708283433/5491127798677'],
  ['papas-cheddar-bacon', 'https://wa.me/p/24326981483554076/5491127798677'],
  ['extra-cheddar-bacon', 'https://wa.me/p/24096789890023302/5491127798677'],
  ['pileta-cheddar', 'https://wa.me/p/7933428066718189/5491127798677'],
  ['cheddar-chiquito', 'https://wa.me/p/8284847271638375/5491127798677'],
  ['cuadruple-bacon', 'https://wa.me/p/9132120316845909/5491127798677'],
  ['triple-oklahoma', 'https://wa.me/p/9243234002456633/5491127798677'],
  ['triple-americana', 'https://wa.me/p/9191276657562396/5491127798677'],
  ['triple-bacon', 'https://wa.me/p/7804951622852674/5491127798677'],
  ['triple-clasica', 'https://wa.me/p/29228578820062514/5491127798677'],
  ['simple', 'https://wa.me/p/6811425808972544/5491127798677'],
  ['kid', 'https://wa.me/p/24148358778150084/5491127798677'],
  ['simple-americana', 'https://wa.me/p/9172373946141168/5491127798677'],
  ['simple-bacon', 'https://wa.me/p/8969871383061236/5491127798677'],
  ['simple-oklahoma', 'https://wa.me/p/9630492926972687/5491127798677'],
  ['cheeseburger', 'https://wa.me/p/7078094342235090/5491127798677'],
  ['doble-bacon', 'https://wa.me/p/24027878136859236/5491127798677'],
  ['doble-americana', 'https://wa.me/p/6947098878703833/5491127798677'],
  ['doble-oklahoma', 'https://wa.me/p/7134270923250150/5491127798677'],
  ['doble-clasica', 'https://wa.me/p/6722630744451191/5491127798677'],
];

const decodeHtml = value => value
  .replaceAll('&amp;', '&')
  .replaceAll('&#xb7;', '·')
  .replaceAll('&#x27;', "'")
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const meta = (html, property) => {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`, 'i');
  const reverse = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${property}"`, 'i');
  const match = html.match(pattern) || html.match(reverse);
  return match ? decodeHtml(match[1]) : '';
};

const assetsDir = new URL('../assets/catalog/', import.meta.url);
const evidence = [];
await mkdir(assetsDir, { recursive: true });

for (const [id, sourceUrl] of products) {
  const pageResponse = await fetch(sourceUrl, { redirect: 'follow' });
  if (!pageResponse.ok) throw new Error(`${id}: product page returned ${pageResponse.status}`);
  const html = await pageResponse.text();
  const imageUrl = meta(html, 'og:image');
  if (!imageUrl) throw new Error(`${id}: product page has no og:image`);

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`${id}: image returned ${imageResponse.status}`);
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('webp') ? '.webp' : extname(new URL(imageUrl).pathname) || '.jpg';
  const filename = `${id}${extension}`;
  await writeFile(new URL(`../assets/catalog/${filename}`, import.meta.url), Buffer.from(await imageResponse.arrayBuffer()));

  evidence.push({
    id,
    sourceUrl,
    resolvedUrl: pageResponse.url,
    title: meta(html, 'og:title'),
    description: meta(html, 'og:description'),
    image: `assets/catalog/${filename}`,
    contentType,
  });
  console.log(`Downloaded ${id}`);
}

await writeFile(
  new URL('../work/catalog-source.json', import.meta.url),
  `${JSON.stringify({ verifiedAt: new Date().toISOString(), products: evidence }, null, 2)}\n`,
);

console.log(`Saved ${evidence.length} official catalog images to ${join('assets', 'catalog')}`);
