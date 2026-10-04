// Bild (z. B. aus einem KI-Bildgenerator) als Sprite übernehmen: Hintergrund freistellen (falls nicht schon
// transparent: schwarzer Rand wird von außen her entfernt, dunkle Stellen im Schiff bleiben), auf 512 px
// verkleinern, als WebP nach src/assets/sprites/<name>.webp schreiben.
// node scripts/import-sprite.mjs <eingabe.png> <name> [vorschau.png]
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchOpts } from './browser.mjs';

const [input, name, preview] = process.argv.slice(2);
if (!input || !name) { console.error('Aufruf: node scripts/import-sprite.mjs <eingabe> <name> [vorschau]'); process.exit(1); }
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
  const d = g.getImageData(0, 0, W, H);
  const a = d.data;
  const corners = [0, W - 1, (H - 1) * W, H * W - 1].map((p) => a[p * 4 + 3]);
  let keyed = false;
  if (corners.some((v) => v > 200)) {
    // Hintergrund deckend: von den Rändern her alle sehr dunklen, zusammenhängenden Punkte entfernen
    keyed = true;
    const lum = (p) => Math.max(a[p * 4], a[p * 4 + 1], a[p * 4 + 2]);
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      seen[p] = 1;
      if (lum(p) > 22) continue;
      a[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    // weicher Rand: Punkte neben freigestellten Flächen je nach Helligkeit halb durchsichtig
    for (let p = 0; p < W * H; p++) {
      if (a[p * 4 + 3] === 0) continue;
      const x = p % W, y = (p / W) | 0;
      const near = (x > 0 && a[(p - 1) * 4 + 3] === 0) || (x < W - 1 && a[(p + 1) * 4 + 3] === 0) || (y > 0 && a[(p - W) * 4 + 3] === 0) || (y < H - 1 && a[(p + W) * 4 + 3] === 0);
      if (near) a[p * 4 + 3] = Math.min(255, Math.round((lum(p) / 60) * 255));
    }
    g.putImageData(d, 0, 0);
  }
  const shrink = (cv, size) => {
    let cur = cv;
    while (cur.width / 2 >= size) {
      const h = document.createElement('canvas');
      h.width = h.height = cur.width / 2;
      const hg = h.getContext('2d');
      hg.imageSmoothingQuality = 'high';
      hg.drawImage(cur, 0, 0, h.width, h.height);
      cur = h;
    }
    const o = document.createElement('canvas');
    o.width = o.height = size;
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(cur, 0, 0, size, size);
    return o;
  };
  const out = shrink(c, 512);
  const pv = document.createElement('canvas');
  pv.width = pv.height = 512;
  const pg = pv.getContext('2d');
  pg.fillStyle = '#050b14';
  pg.fillRect(0, 0, 512, 512);
  pg.drawImage(out, 0, 0);
  return { keyed, corners, sprite: out.toDataURL('image/webp', 0.9), preview: pv.toDataURL('image/png') };
}, src);
await browser.close();
const buf = Buffer.from(r.sprite.split(',')[1], 'base64');
await writeFile(join(root, 'src/assets/sprites', `${name}.webp`), buf);
if (preview) await writeFile(preview, Buffer.from(r.preview.split(',')[1], 'base64'));
console.log(`${name}.webp`, Math.round(buf.length / 1024), 'KB', r.keyed ? '(Hintergrund freigestellt)' : '(bereits transparent)', 'Ecken-Alpha', r.corners.join(','));
