// Lichtstellen eines animierten Wracks finden: Unterschied jedes Bilds zum dunklen Grundbild (Bild 1), zu Flecken
// zusammengefasst. Ausgabe: je Bild Flecken {x, y (0…1 im Bild), r (Anteil der Bildgröße), c (Farbe), k (Stärke)}
// node scripts/wreck-lights.mjs wrack-frachter 5
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';
const [name, nArg] = process.argv.slice(2);
const n = Number(nArg);
const root = new URL('..', import.meta.url).pathname;
const srcs = [];
for (let i = 1; i <= n; i++) srcs.push(`data:image/webp;base64,${(await readFile(`${root}src/assets/sprites/${name}-${i}.webp`)).toString('base64')}`);
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const out = await page.evaluate(async (srcs) => {
  const data = [];
  let W = 0;
  for (const s of srcs) {
    const im = new Image(); im.src = s; await im.decode();
    W = im.naturalWidth;
    const c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    data.push(g.getImageData(0, 0, W, W).data);
  }
  const C = 24, N = Math.ceil(W / C), res = [];
  for (let f = 1; f < data.length; f++) {
    const a = data[f], b = data[0];
    const cells = new Float32Array(N * N * 5);
    for (let p = 0; p < W * W; p++) {
      const o = p * 4;
      const d = Math.max(a[o] - b[o], a[o + 1] - b[o + 1], a[o + 2] - b[o + 2]);
      if (d < 40 || a[o + 3] < 128) continue;
      const x = p % W, y = (p / W) | 0, k = ((y / C) | 0) * N + ((x / C) | 0);
      cells[k * 5] += d; cells[k * 5 + 1] += a[o] * d; cells[k * 5 + 2] += a[o + 1] * d; cells[k * 5 + 3] += a[o + 2] * d; cells[k * 5 + 4]++;
    }
    // Flecken: zusammenhängende Zellen mit genug Anteil
    const on = new Uint8Array(N * N), seen = new Uint8Array(N * N), spots = [];
    for (let k = 0; k < N * N; k++) on[k] = cells[k * 5 + 4] > C * C * 0.04 ? 1 : 0;
    for (let k = 0; k < N * N; k++) {
      if (!on[k] || seen[k]) continue;
      const st = [k]; let sw = 0, sx = 0, sy = 0, r = 0, g2 = 0, bl = 0, cnt = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      seen[k] = 1;
      while (st.length) {
        const q = st.pop(), qx = q % N, qy = (q / N) | 0, w = cells[q * 5];
        sw += w; sx += (qx + 0.5) * w; sy += (qy + 0.5) * w; r += cells[q * 5 + 1]; g2 += cells[q * 5 + 2]; bl += cells[q * 5 + 3]; cnt += cells[q * 5 + 4];
        x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = qx + dx, ny = qy + dy, nk = ny * N + nx;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && on[nk] && !seen[nk]) { seen[nk] = 1; st.push(nk); }
        }
      }
      if (cnt < 30) continue;
      const hex = (v) => Math.round(Math.min(255, v / sw)).toString(16).padStart(2, '0');
      spots.push({ x: +(sx / sw / N).toFixed(3), y: +(sy / sw / N).toFixed(3), r: +(Math.max(x1 - x0 + 1, y1 - y0 + 1) / N / 2).toFixed(3), c: `#${hex(r)}${hex(g2)}${hex(bl)}`, k: +Math.min(1, cnt / 1500).toFixed(2) });
    }
    res.push(spots.sort((p, q) => q.k - p.k).slice(0, 10));
  }
  return res;
}, srcs);
await browser.close();
console.log(JSON.stringify(out));
