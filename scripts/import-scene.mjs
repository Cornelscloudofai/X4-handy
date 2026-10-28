// Ebenen eines Sektorbilds aufbereiten (freigestellte KI-Ebenen): harte, grell gefärbte Freistellränder entfernen.
// Innere Farben werden nach außen in den Randbereich „ausgeblutet“ (kein roter/grüner Saum mehr), die Deckkraft läuft
// weich aus. Ergebnis in voller Auflösung als WebP (Qualität 0,95, mit Transparenz) nach src/assets/szenen/<sektor>/.
// node scripts/import-scene.mjs <sektor> <name>=<datei.png>[:weich] ...   (weich = Randbreite in px, Standard 6)
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchOpts } from './browser.mjs';

const [sector, ...specs] = process.argv.slice(2);
if (!sector || !specs.length) { console.error('Aufruf: node scripts/import-scene.mjs <sektor> <name>=<datei.png>[:weich] ...'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'src/assets/szenen', sector);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
for (const spec of specs) {
  const [name, rest] = spec.split('=');
  const [file, softArg] = rest.split(':');
  const soft = Number(softArg ?? 6);
  const src = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  const url = await page.evaluate(async ([src, soft]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;
    let opaque = true;
    for (let k = 3; k < d.length; k += 4) if (d[k] < 250) { opaque = false; break; }
    if (!opaque && soft > 0) {
      // Kastenunschärfe (zweimal ≈ Gauß), getrennt in x und y
      const blur = (src, rad) => {
        const tmp = new Float32Array(N), out = new Float32Array(N);
        for (let y = 0; y < H; y++) {
          let s = 0;
          const row = y * W;
          for (let x = -rad; x <= rad; x++) s += src[row + Math.min(W - 1, Math.max(0, x))];
          for (let x = 0; x < W; x++) {
            tmp[row + x] = s / (2 * rad + 1);
            s += src[row + Math.min(W - 1, x + rad + 1)] - src[row + Math.max(0, x - rad)];
          }
        }
        for (let x = 0; x < W; x++) {
          let s = 0;
          for (let y = -rad; y <= rad; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
          for (let y = 0; y < H; y++) {
            out[y * W + x] = s / (2 * rad + 1);
            s += tmp[Math.min(H - 1, y + rad + 1) * W + x] - tmp[Math.max(0, y - rad) * W + x];
          }
        }
        return out;
      };
      // Randzone: in der Nähe (weich) durchsichtiger Stellen – nur dort kann ein grell gefärbter Freistellsaum liegen
      const low = new Float32Array(N);
      for (let i = 0; i < N; i++) low[i] = d[i * 4 + 3] < 128 ? 1 : 0;
      const nearLow = blur(low, soft * 2);
      // Gewicht je Punkt: seine Deckkraft – grell gefärbte Saumpunkte (reines Rot, Grün über Rot) in der Randzone zählen nicht
      const M = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
        const harsh = nearLow[i] > 0.01 && ((r > 190 && gg < 70 && b < 70) || (gg > r * 1.05 && gg > b * 1.3));
        M[i] = harsh ? 0 : a / 255;
      }
      // Farben aus dem Kern nach außen ausbluten (gewichtetes Mittel), wo der Punkt selbst wenig zählt
      const chans = [0, 1, 2].map((ch) => { const x = new Float32Array(N); for (let i = 0; i < N; i++) x[i] = d[i * 4 + ch] * M[i]; return x; });
      const w = blur(blur(M, soft * 2), soft * 2);
      const cb = chans.map((x) => blur(blur(x, soft * 2), soft * 2));
      for (let i = 0; i < N; i++) {
        if (M[i] > 0.6 || w[i] < 1e-4) continue;
        const k = M[i] / 0.6;
        for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = d[i * 4 + ch] * k + (cb[ch][i] / w[i]) * (1 - k);
      }
      // Deckkraft: weich auslaufend, nie mehr als vorher
      const feather = blur(blur(M, soft), soft);
      for (let i = 0; i < N; i++) {
        const f = Math.min(1, feather[i] * 1.8);
        d[i * 4 + 3] = Math.round(Math.min(d[i * 4 + 3], 255 * f * f * (3 - 2 * f)));
      }
      g.putImageData(id, 0, 0);
    }
    return c.toDataURL('image/webp', 0.95);
  }, [src, soft]);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  await writeFile(join(outDir, `${name}.webp`), buf);
  console.log(`${sector}/${name}.webp`, (buf.length / 1024).toFixed(0), 'KB');
}
await browser.close();
