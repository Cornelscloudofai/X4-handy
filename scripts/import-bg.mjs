// Hintergrundbild übernehmen: in Originalauflösung als JPEG (Qualität 0,95) nach src/assets/<ordner>/<name>.jpg
// node scripts/import-bg.mjs <eingabe.png> <ordner> <name>
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchOpts } from './browser.mjs';

const [input, dir, name] = process.argv.slice(2);
if (!input || !dir || !name) { console.error('Aufruf: node scripts/import-bg.mjs <eingabe> <ordner> <name>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const src = `data:image/png;base64,${(await readFile(input)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const r = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: c.toDataURL('image/jpeg', 0.95) };
}, src);
await browser.close();
await mkdir(join(root, 'src/assets', dir), { recursive: true });
const out = join(root, 'src/assets', dir, `${name}.jpg`);
const buf = Buffer.from(r.data.split(',')[1], 'base64');
await writeFile(out, buf);
console.log(`${name}.jpg ${r.w}×${r.h} ${Math.round(buf.length / 1024)} KB`);
