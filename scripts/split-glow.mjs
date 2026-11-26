// Leuchtflächen aus einem Bild lösen: reines Grün (Effektfläche) wird im Grundbild durch eine dunkle, ungeladene Leuchtbahn
// ersetzt, dazu eine Maske (weiß, Deckkraft = Grünanteil) für die Beleuchtung im Spiel. Ränder bleiben weich.
//   node scripts/split-glow.mjs <bild.png> <grundbild.png> <maske.png> [dunkel=#18202a]
// Danach beide mit scripts/import-sprite.mjs übernehmen.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const [input, baseOut, maskOut, darkArg] = process.argv.slice(2);
if (!input || !baseOut || !maskOut) { console.error('Aufruf: node scripts/split-glow.mjs <bild> <grundbild> <maske> [#dunkel]'); process.exit(1); }
const dark = (darkArg ?? '#18202a').replace('#', '');
const D = [0, 2, 4].map((i) => parseInt(dark.slice(i, i + 2), 16));
const src = `data:image/png;base64,${(await readFile(input)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const [base, mask, n] = await page.evaluate(async ([src, D]) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H), a = d.data;
  const m = new ImageData(W, H), b = m.data;
  let n = 0;
  for (let k = 0; k < a.length; k += 4) {
    const r = a[k], gg = a[k + 1], bl = a[k + 2];
    // Grünanteil: wie weit Grün über Rot und Blau liegt (weiche Ränder bleiben anteilig)
    const q = Math.max(0, Math.min(1, (gg - Math.max(r, bl) - 40) / 120));
    if (q <= 0) continue;
    n++;
    b[k] = b[k + 1] = b[k + 2] = 255; b[k + 3] = Math.round(255 * q * (a[k + 3] / 255));
    // Grundbild: Grün durch die dunkle Leuchtbahn ersetzen (Helligkeitsverlauf leicht erhalten)
    const l = gg / 255;
    for (let i = 0; i < 3; i++) a[k + i] = Math.round(a[k + i] * (1 - q) + D[i] * (0.7 + 0.5 * l) * q);
  }
  g.putImageData(d, 0, 0);
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.getContext('2d').putImageData(m, 0, 0);
  return [c.toDataURL('image/png'), mc.toDataURL('image/png'), n];
}, [src, D]);
await writeFile(baseOut, Buffer.from(base.split(',')[1], 'base64'));
await writeFile(maskOut, Buffer.from(mask.split(',')[1], 'base64'));
console.log(`${n} Bildpunkte Leuchtfläche → ${maskOut}`);
await browser.close();
