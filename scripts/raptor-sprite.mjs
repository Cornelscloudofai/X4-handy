// Träger Raptor: das KI-Bild kommt wegen der Auflösung in vier Abschnitten (vom Heck zum Bug, je 1254 × 1254 px).
// Zusammensetzen, Nähte glätten, um 180° drehen (Bug oben wie bei allen Schiffen) und in voller Auflösung als WebP
// speichern. node scripts/raptor-sprite.mjs <heck.png> <2.png> <3.png> <bug.png> [vorschau-ordner]
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const args = process.argv.slice(2);
const parts = args.slice(0, 4), preview = args[4];
if (parts.length < 4) { console.error('Aufruf: node scripts/raptor-sprite.mjs <heck> <2> <3> <bug> [vorschau]'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const srcs = await Promise.all(parts.map(async (f) => 'data:image/png;base64,' + (await readFile(f)).toString('base64')));
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const out = await page.evaluate(async ([srcs, wantPreview]) => {
  const imgs = await Promise.all(srcs.map(async (s) => { const i = new Image(); i.src = s; await i.decode(); return i; }));
  const W = imgs[0].width, P = imgs[0].height, H = P * imgs.length;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // vom Heck (oben) zum Bug (unten) stapeln, dann drehen: Bug oben
  g.translate(W, H); g.rotate(Math.PI);
  imgs.forEach((im, i) => g.drawImage(im, 0, i * P));
  g.setTransform(1, 0, 0, 1, 0, 0);
  const seams = imgs.slice(1).map((_, i) => H - (i + 1) * P);
  // Nähte: Die Abschnitte sind gegeneinander leicht verschoben und seitlich gestaucht. Je Naht Versatz t und Streckung s
  // suchen, bei denen die erste Zeile unter der Naht am besten zur letzten darüber passt, und den Abschnitt darunter
  // über BAND Zeilen weich von (s, t) zurück auf unverändert biegen.
  const BAND = 160, cx = W / 2;
  const id = g.getImageData(0, 0, W, H), src = new Uint8ClampedArray(id.data), a = id.data;
  const px = (x, y, k) => src[(y * W + x) * 4 + k];
  const sample = (y, xf, k) => { const x0 = Math.floor(xf), f = xf - x0; if (x0 < 0 || x0 >= W - 1) return 0; return px(x0, y, k) * (1 - f) + px(x0 + 1, y, k) * f; };
  const fits = [];
  for (const y of seams) {
    let best = { s: 1, t: 0, e: Infinity };
    for (let sc = 0.92; sc <= 1.08; sc += 0.002) for (let t = -40; t <= 40; t += 0.5) {
      let e = 0, n = 0;
      for (let x = 20; x < W - 20; x += 2) {
        const xl = cx + (x - cx - t) / sc;
        if (xl < 1 || xl > W - 2) continue;
        for (let k = 0; k < 4; k++) {
          const up = (px(x, y - 1, k) + px(x, y - 2, k) + px(x, y - 3, k)) / 3;
          const lo = (sample(y, xl, k) + sample(y + 1, xl, k) + sample(y + 2, xl, k)) / 3;
          e += Math.abs(up - lo) * (k === 3 ? 2 : 1);
        }
        n++;
      }
      if (n && e / n < best.e) best = { s: sc, t, e: e / n };
    }
    fits.push({ y, ...best });
    for (let r = 0; r < BAND && y + r < H; r++) {
      const w = 1 - r / BAND, ss = 1 + (best.s - 1) * w, tt = best.t * w, yy = y + r;
      for (let x = 0; x < W; x++) {
        const xl = cx + (x - cx - tt) / ss, o = (yy * W + x) * 4;
        for (let k = 0; k < 4; k++) a[o + k] = sample(yy, xl, k);
      }
    }
  }
  g.putImageData(id, 0, 0);
  const crops = {};
  if (wantPreview) for (const y of seams) {
    const k = document.createElement('canvas'); k.width = W; k.height = 240;
    k.getContext('2d').drawImage(c, 0, y - 120, W, 240, 0, 0, W, 240);
    crops[y] = k.toDataURL('image/png');
  }
  // Rumpf-Ebene für den Hangar: die blaugrauen Flugdecks werden durchsichtig (weich ausgeblendet), alles andere bleibt.
  // Gelandete Jäger liegen zwischen Schiffsbild und dieser Ebene – auf dem Deck sichtbar, unter dem roten Rumpf verdeckt.
  const hull = document.createElement('canvas');
  hull.width = W; hull.height = H;
  const hg = hull.getContext('2d');
  hg.drawImage(c, 0, 0);
  const hd = hg.getImageData(0, 0, W, H), q = hd.data;
  for (let k = 0; k < q.length; k += 4) {
    const r = q[k], gg = q[k + 1], b = q[k + 2];
    // Deck: blaugrau (Blau über Rot), nicht zu dunkel; Übergang weich, damit keine harten Kanten entstehen
    const blue = (b - r - 6) / 22, lum = (r + gg + b) / 3;
    const deck = Math.max(0, Math.min(1, blue)) * Math.max(0, Math.min(1, (lum - 28) / 25)) * (gg >= r ? 1 : 0.4);
    if (deck > 0) q[k + 3] = Math.round(q[k + 3] * (1 - deck));
  }
  hg.putImageData(hd, 0, 0);
  return { hull: hull.toDataURL('image/webp', 0.95), webp: c.toDataURL('image/webp', 0.95), png: wantPreview ? c.toDataURL('image/png') : '', W, H, seams, crops, fits };
}, [srcs, !!preview]);
await browser.close();
const save = (file, url) => writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
await save(`${root}src/assets/sprites/split-raptor-ki.webp`, out.webp);
await save(`${root}src/assets/sprites/split-raptor-rumpf-ki.webp`, out.hull);
if (preview) {
  await save(`${preview}/raptor.png`, out.png);
  for (const [y, u] of Object.entries(out.crops)) await save(`${preview}/naht-${y}.png`, u);
}
console.log(`split-raptor-ki.webp: ${out.W} × ${out.H} px`);
for (const f of out.fits) console.log(`Naht y = ${f.y}: Streckung ${f.s.toFixed(3)}, Versatz ${f.t} px, Restfehler ${f.e.toFixed(1)}`);
