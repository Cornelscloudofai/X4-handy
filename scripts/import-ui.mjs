// Oberflächenbild (Knopf, Rahmen) übernehmen: durchsichtigen Rand abschneiden, in voller Auflösung als WebP (Qualität
// 0,95) nach src/assets/hud/<name>.webp schreiben. Gibt die Maße und – für Leisten mit Feldern – die Feldgrenzen aus
// (dunkle Innenflächen entlang der Mittelzeile, als Anteile der Breite).
// node scripts/import-ui.mjs <eingabe.png> <name>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const [input, name] = process.argv.slice(2);
if (!input || !name) { console.error('Aufruf: node scripts/import-ui.mjs <eingabe> <name>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const src = `data:image/png;base64,${(await readFile(input)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const r = await page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  o.getContext('2d').drawImage(c, -x0, -y0);
  // Felder: entlang der Mittelzeile zusammenhängende dunkle Abschnitte (Helligkeit < 40, breiter als 5 % der Breite)
  const ym = Math.round(y0 + h / 2), cells = [];
  let start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const k = (ym * W + Math.min(x, x1)) * 4, lum = (d[k] + d[k + 1] + d[k + 2]) / 3;
    const dark = x <= x1 && d[k + 3] > 200 && lum < 40;
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) { if (x - start > w * 0.05) cells.push([+((start - x0) / w).toFixed(4), +((x - x0) / w).toFixed(4)]); start = -1; }
  }
  // senkrechte Ausdehnung des mittleren Felds
  const xm = cells.length ? Math.round(x0 + ((cells[0][0] + cells[0][1]) / 2) * w) : x0 + w / 2;
  let t = ym, b = ym;
  const darkAt = (y) => { const k = (y * W + xm) * 4; return d[k + 3] > 200 && (d[k] + d[k + 1] + d[k + 2]) / 3 < 40; };
  while (t > y0 && darkAt(t - 1)) t--;
  while (b < y1 && darkAt(b + 1)) b++;
  // Form jedes Felds: dunkle Innenfläche vom Feldmittelpunkt aus füllen, Umriss als konvexe Hülle, vereinfacht
  // (Ramer-Douglas-Peucker); Ausgabe: Rechteck des Felds (Anteile des Bilds) und Umriss (Anteile dieses Rechtecks)
  const lumAt = (x, y) => { const k = (y * W + x) * 4; return d[k + 3] > 200 ? (d[k] + d[k + 1] + d[k + 2]) / 3 : 999; };
  const shapes = cells.map(([a, b]) => {
    // nicht über das Feld hinaus füllen (zwischen den Feldern gibt es dunkle Fugen)
    const lx = Math.floor(x0 + (a - 0.012) * w), rx = Math.ceil(x0 + (b + 0.012) * w);
    const sx = Math.round(x0 + ((a + b) / 2) * w), sy = ym;
    // Grenze nach der Helligkeit im Feld (Mittel um den Mittelpunkt): Rahmen und Fugen sind deutlich heller
    let base = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) base += lumAt(sx + dx, sy + dy) / 169;
    const isDark = (x, y) => lumAt(x, y) < base + 22;
    // Strahlen vom Mittelpunkt: jeder stoppt am ersten hellen Punkt (Rahmen, Fuge) – kann nicht durch Lücken auslaufen
    const pts = [];
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (let i = 0; i < 120; i++) {
      const an = (i / 120) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
      let r = 0, x = sx, y = sy;
      while (true) {
        const nx = Math.round(sx + cx * (r + 1)), ny = Math.round(sy + cy * (r + 1));
        if (nx < Math.max(0, lx) || nx > Math.min(W - 1, rx) || ny < 0 || ny >= H || !isDark(nx, ny)) break;
        r++; x = nx; y = ny;
      }
      pts.push([x, y]);
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    // konvexe Hülle (monotone Kette)
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    let hull = lo.slice(0, -1).concat(up.slice(0, -1));
    // vereinfachen
    const tol = Math.max(2, (by1 - by0) * 0.012);
    const rdp = (ps) => {
      if (ps.length < 3) return ps;
      const [p0, p1] = [ps[0], ps[ps.length - 1]];
      let md = 0, mi = 0;
      for (let i = 1; i < ps.length - 1; i++) {
        const [x, y] = ps[i], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        const dd = Math.abs((p1[0] - p0[0]) * (p0[1] - y) - (p0[0] - x) * (p1[1] - p0[1])) / L;
        if (dd > md) { md = dd; mi = i; }
      }
      return md > tol ? [...rdp(ps.slice(0, mi + 1)).slice(0, -1), ...rdp(ps.slice(mi))] : [p0, p1];
    };
    // geschlossener Umriss: in zwei Hälften vereinfachen (am weitesten vom Startpunkt entfernten Punkt teilen)
    let far = 0;
    for (let i = 1; i < hull.length; i++) if (Math.hypot(hull[i][0] - hull[0][0], hull[i][1] - hull[0][1]) > Math.hypot(hull[far][0] - hull[0][0], hull[far][1] - hull[0][1])) far = i;
    hull = [...rdp(hull.slice(0, far + 1)).slice(0, -1), ...rdp([...hull.slice(far), hull[0]]).slice(0, -1)];
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    return {
      box: [+((bx0 - x0) / w).toFixed(4), +((by0 - y0) / h).toFixed(4), +((bx1 + 1 - x0) / w).toFixed(4), +((by1 + 1 - y0) / h).toFixed(4)],
      poly: hull.map(([x, y]) => `${((x - bx0) / bw * 100).toFixed(1)},${((y - by0) / bh * 100).toFixed(1)}`).join(' '),
    };
  });
  return { w, h, cells, shapes, top: +((t - y0) / h).toFixed(4), bottom: +((b - y0) / h).toFixed(4), url: o.toDataURL('image/webp', 0.95) };
}, src);
await browser.close();
await writeFile(`${root}src/assets/hud/${name}.webp`, Buffer.from(r.url.split(',')[1], 'base64'));
console.log(JSON.stringify({ name, w: r.w, h: r.h, ratio: +(r.w / r.h).toFixed(3), cells: r.cells, top: r.top, bottom: r.bottom, shapes: r.shapes }));
