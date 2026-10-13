// Menübild übernehmen, volle Auflösung und Seitenverhältnis bleiben erhalten:
// – freigestellt (PNG mit Transparenz): durchsichtige Ränder abschneiden, als WebP (Qualität 0,95) → src/assets/menu/<name>.webp
// – deckend (Szene/Hintergrund): unverändert als JPEG (Qualität 0,94) → src/assets/menu/<name>.jpg
// node scripts/import-menu-art.mjs <eingabe.png> <name>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchOpts } from './browser.mjs';

const [input, name] = process.argv.slice(2);
if (!input || !name) { console.error('Aufruf: node scripts/import-menu-art.mjs <eingabe.png> <name>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const src = `data:image/png;base64,${(await readFile(input)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const r = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, W, H).data;
  let opaque = true;
  for (let p = 3; p < a.length; p += 4) if (a[p] < 250) { opaque = false; break; }
  if (opaque) return { w: W, h: H, W, H, data: c.toDataURL('image/jpeg', 0.94), ext: 'jpg' };
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 4;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const o = document.createElement('canvas');
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, -x0, -y0);
  return { w: o.width, h: o.height, W, H, data: o.toDataURL('image/webp', 0.95), ext: 'webp' };
}, src);
await browser.close();
const buf = Buffer.from(r.data.split(',')[1], 'base64');
await writeFile(join(root, 'src/assets/menu', `${name}.${r.ext}`), buf);
console.log(`${name}.${r.ext} ${r.w}×${r.h} (Original ${r.W}×${r.H})`, Math.round(buf.length / 1024), 'KB');
