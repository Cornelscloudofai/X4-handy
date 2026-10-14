// Kanonenrohr (KI-Bild mit durchsichtigem Hintergrund) als Sprite übernehmen: auf den Umriss zuschneiden, so drehen,
// dass die Mündung nach oben zeigt (Wurzel unten), und in hoher Qualität als WebP nach src/assets/sprites/<name>.webp
// schreiben – längste Seite höchstens 1024 px, kleinere Vorlagen bleiben in Originalgröße.
// node scripts/import-barrel.mjs <eingabe.png> <name> <mündung: oben|rechts|links|unten>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchOpts } from './browser.mjs';

const [input, name, dir = 'oben'] = process.argv.slice(2);
if (!input || !name) { console.error('Aufruf: node scripts/import-barrel.mjs <eingabe> <name> <oben|rechts|links|unten>'); process.exit(1); }
const ROT = { oben: 0, rechts: -90, unten: 180, links: 90 }[dir];
if (ROT === undefined) { console.error('Mündung: oben, rechts, links oder unten'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const src = `data:image/png;base64,${(await readFile(input)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const r = await page.evaluate(async ([src, ROT]) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 4;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const turned = ROT === 90 || ROT === -90;
  const ow = turned ? ch : cw, oh = turned ? cw : ch;
  const k = Math.min(1, 1024 / Math.max(ow, oh));
  // erst in voller Größe drehen, dann in Halbschritten verkleinern (hohe Qualität)
  let cur = document.createElement('canvas');
  cur.width = ow; cur.height = oh;
  const rg = cur.getContext('2d');
  rg.translate(ow / 2, oh / 2);
  rg.rotate((ROT * Math.PI) / 180);
  rg.drawImage(c, x0, y0, cw, ch, -cw / 2, -ch / 2, cw, ch);
  const tw = Math.round(ow * k), th = Math.round(oh * k);
  while (cur.width / 2 >= tw) {
    const h = document.createElement('canvas');
    h.width = Math.round(cur.width / 2); h.height = Math.round(cur.height / 2);
    const hg = h.getContext('2d');
    hg.imageSmoothingQuality = 'high';
    hg.drawImage(cur, 0, 0, h.width, h.height);
    cur = h;
  }
  const o = document.createElement('canvas');
  o.width = tw; o.height = th;
  const og = o.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(cur, 0, 0, tw, th);
  return { w: tw, h: th, sprite: o.toDataURL('image/webp', 0.95) };
}, [src, ROT]);
await browser.close();
const buf = Buffer.from(r.sprite.split(',')[1], 'base64');
await writeFile(join(root, 'src/assets/sprites', `${name}.webp`), buf);
console.log(`${name}.webp`, `${r.w}×${r.h}`, Math.round(buf.length / 1024), 'KB');
