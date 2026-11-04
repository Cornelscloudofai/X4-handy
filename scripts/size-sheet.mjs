// Größenvergleich aller Schiffe: so groß, wie das Spiel sie zeichnet – im Kampf-Minispiel (Spielpunkte) und auf der
// Sektorkarte (Moduleinheiten, mit dem S/M-Andockmodul). Gemessen wird die sichtbare Rumpflänge (ohne leeren Rand im
// Bild). Liest die Größen aus dem Quelltext, damit der Bogen nach jeder Änderung neu erzeugt werden kann.
// node scripts/size-sheet.mjs <ausgabe.png>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] ?? 'groessen.png';
const src = (f) => readFile(root + f, 'utf8');
const sprites = async (name) => {
  for (const ext of ['webp', 'png', 'jpg']) {
    try { return `data:image/${ext};base64,` + (await readFile(`${root}src/assets/sprites/${name}.${ext}`)).toString('base64'); } catch { /* weiter */ }
  }
  return null;
};

// ---- Kampf-Minispiel: Größe je Schiff aus loadout.ts ----
const lo = await src('src/minigames/loadout.ts');
const consts = Object.fromEntries([...lo.matchAll(/const (RS_SIZE|RP_LEN)\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
for (const m of lo.matchAll(/const RS_IMG = (\d+), RS_SIZE = (\d+)/g)) consts.RS_SIZE = Number(m[2]);
for (const m of lo.matchAll(/RP_H = (\d+), RP_LEN = (\d+)/g)) consts.RP_LEN = Number(m[2]);
const SPRITE_SIZE = 46;
const fight = [];
for (const m of lo.matchAll(/\n {2}(\w+): ship\('(S|M|L|XL)', \{([\s\S]*?)\n {2}\}\),/g)) {
  const [, id, cls, body] = m;
  const size = body.match(/size: (\w+)/)?.[1], sprite = body.match(/sprite: '([\w-]+)'/)?.[1], name = body.match(/name: '([^']+)'/)?.[1];
  const s = Number(size) || consts[size];
  // Jäger mit Größe 40 werden im Spiel etwas kleiner gezeichnet (KI-Bild füllt das Bild fast ganz)
  fight.push({ id, cls, name, sprite: sprite + '-ki', draw: s === 40 ? SPRITE_SIZE * 0.86 : s, aspect: body.includes('aspect:') });
}

// ---- Sektorkarte: Klasse je Schiff, Bild aus MAP_SHIPS, Länge = SHIP_UNIT[Klasse] Moduleinheiten ----
const art = await src('src/render/shipArt.ts'), sv = await src('src/render/sectorView.ts'), ships = await src('src/data/ships.ts');
const unit = Object.fromEntries([...sv.match(/SHIP_UNIT[^=]*=\s*\{([^}]*)\}/)[1].matchAll(/(\w+): ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
const moduleImg = Number(sv.match(/const MODULE_IMG = ([\d.]+)/)[1]);
const mapShips = Object.fromEntries([...art.match(/const MAP_SHIPS[^{]*\{([\s\S]*?)\n\};/)[1].matchAll(/(\w+): '([\w-]+)'/g)].map((m) => [m[1], m[2]]));
const mil = JSON.parse(await src('src/data/militarydata.json')).ships;
const clsOf = Object.fromEntries([...ships.matchAll(/\{ id: '(\w+)', role: '\w+', size: '(\w+)'/g)].map((m) => [m[1], m[2]]));
for (const [k, v] of Object.entries(mil)) clsOf[k] = v.size;
const map = Object.entries(mapShips).map(([id, sprite]) => ({ id, sprite, cls: clsOf[id] ?? 'M', len: unit[clsOf[id] ?? 'M'] }));

const all = [...new Set([...fight.map((f) => f.sprite), ...map.map((m) => m.sprite), 'split-dock-ki'])];
const data = Object.fromEntries(await Promise.all(all.map(async (n) => [n, await sprites(n)])));
// Raptor: M-Landeplatz im Bild (gemessen, Bildpunkte)
const PAD = { x: 548, y: 3310, w: 157, h: 330, imgH: 5016 };

const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const png = await page.evaluate(async ({ fight, map, data, unit, moduleImg, PAD }) => {
  const imgs = {};
  for (const [k, u] of Object.entries(data)) if (u) { const i = new Image(); i.src = u; await i.decode(); imgs[k] = i; }
  // sichtbare Ausdehnung: Rand mit Deckkraft unter 10 % zählt nicht
  const box = (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = 0, y0 = c.height, y1 = 0;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 25) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1, fw: (x1 - x0) / img.width, fh: (y1 - y0) / img.height };
  };
  const W = 2400, H = 2900;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#071219'; g.fillRect(0, 0, W, H);
  const text = (t, x, y, size = 22, col = '#d8ecef', align = 'left', weight = 600) => { g.font = `${weight} ${size}px sans-serif`; g.fillStyle = col; g.textAlign = align; g.fillText(t, x, y); };
  const grid = (x, y, w, h, step) => { g.strokeStyle = 'rgba(95,240,216,0.07)'; g.lineWidth = 1; for (let k = x; k <= x + w; k += step) { g.beginPath(); g.moveTo(k, y); g.lineTo(k, y + h); g.stroke(); } for (let k = y; k <= y + h; k += step) { g.beginPath(); g.moveTo(x, k); g.lineTo(x + w, k); g.stroke(); } };
  // Schiff stehend zeichnen (Bug oben), Fußpunkt bei (x, base); Rückgabe: Breite
  const ship = (img, x, base, drawLen, aspect, label, sub) => {
    const b = box(img), dw = drawLen * (aspect ? img.width / img.height : 1), dh = drawLen;
    const visH = dh * b.fh, visW = dw * b.fw;
    // Bild so setzen, dass der sichtbare Rumpf auf der Grundlinie steht
    const top = base - dh * (b.y1 / img.height);
    const left = x - dw * (b.x0 / img.width);
    g.drawImage(img, left, top, dw, dh);
    g.strokeStyle = 'rgba(255,210,122,0.35)'; g.lineWidth = 1;
    g.strokeRect(x, base - visH, visW, visH);
    text(label, x + visW / 2, base + 26, 19, '#e4f3f0', 'center');
    if (sub) text(sub, x + visW / 2, base + 48, 15, '#8fb7c4', 'center', 500);
    return visW;
  };
  const results = [];

  // ===== Teil 1: Kampf-Minispiel =====
  text('Kampf-Minispiel – so groß, wie das Spiel die Schiffe zeichnet (Spielpunkte, sichtbare Rumpflänge)', 40, 56, 28, '#5ff0d8', 'left', 700);
  const k1 = 0.82, base1 = 1170;
  grid(40, 90, W - 80, base1 - 90, 100 * k1);
  text('Raster: 100 Spielpunkte', W - 40, 90 + 22, 15, '#5f8a92', 'right', 500);
  let x = 70;
  const raptor = fight.find((f) => f.aspect);
  for (const f of [raptor, ...fight.filter((q) => !q.aspect).sort((a, b) => b.draw - a.draw)]) {
    const img = imgs[f.sprite]; if (!img) continue;
    const b = box(img), len = f.draw * b.fh;
    const w = ship(img, x, base1, f.draw * k1, f.aspect, f.name, `${f.cls} · ${Math.round(len)}`);
    results.push({ teil: 'Kampf', name: f.name, cls: f.cls, len: Math.round(len) });
    x += Math.max(w, 70) + 46;
  }
  // Ausschnitt ×5: kleine Schiffe neben dem M-Landeplatz des Raptors
  const base2 = 1660, k2 = 0.82 * 5;
  text('Ausschnitt ×5: S- und M-Schiffe neben dem M-Landeplatz auf dem Raptor (gleicher Maßstab wie oben)', 40, base1 + 110, 24, '#ffd27a', 'left', 700);
  const padImg = imgs['split-raptor-ki'];
  let x2 = 70;
  if (padImg) {
    const rL = raptor.draw, pxU = rL / PAD.imgH, pw = PAD.w * pxU * k2, ph = PAD.h * pxU * k2;
    g.drawImage(padImg, PAD.x - 20, PAD.y - 20, PAD.w + 40, PAD.h + 40, x2 - 20 * pxU * k2, base2 - ph - 20 * pxU * k2, pw + 40 * pxU * k2, ph + 40 * pxU * k2);
    g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.strokeRect(x2, base2 - ph, pw, ph);
    text('M-Landeplatz', x2 + pw / 2, base2 + 26, 19, '#ffd27a', 'center');
    text(`${Math.round(PAD.h * pxU)} × ${Math.round(PAD.w * pxU)}`, x2 + pw / 2, base2 + 48, 15, '#8fb7c4', 'center', 500);
    x2 += pw + 60;
  }
  for (const f of fight.filter((q) => !q.aspect && (q.cls === 'S' || q.cls === 'M')).sort((a, b) => b.draw - a.draw)) {
    const img = imgs[f.sprite]; if (!img) continue;
    const b = box(img);
    const w = ship(img, x2, base2, f.draw * k2, false, f.name, `${f.cls} · ${Math.round(f.draw * b.fh)}`);
    x2 += Math.max(w, 60) + 34;
  }

  // ===== Teil 2: Sektorkarte =====
  const top3 = 1790;
  text('Sektorkarte – Schiffe neben dem S/M-Andockmodul (Moduleinheiten; jede Klasse hat eine feste Bildgröße)', 40, top3, 28, '#5ff0d8', 'left', 700);
  const k3 = 520, base3 = 2560;
  grid(40, top3 + 30, W - 80, base3 - top3 - 30, 0.1 * k3);
  text('Raster: 0,1 Moduleinheiten', W - 40, top3 + 52, 15, '#5f8a92', 'right', 500);
  let x3 = 70;
  const dock = imgs['split-dock-ki'];
  if (dock) {
    const s = moduleImg * k3;
    g.drawImage(dock, x3, base3 - s, s, s);
    text('S/M-Andockmodul', x3 + s / 2, base3 + 26, 19, '#e4f3f0', 'center');
    text(`Bild ${moduleImg} Einheiten`, x3 + s / 2, base3 + 48, 15, '#8fb7c4', 'center', 500);
    x3 += s + 50;
  }
  const order = { XL: 0, L: 1, M: 2, S: 3 };
  for (const m of map.sort((a, b) => order[a.cls] - order[b.cls])) {
    const img = imgs[m.sprite]; if (!img) continue;
    const b = box(img);
    const w = ship(img, x3, base3, m.len * k3, false, m.id, `${m.cls} · ${(m.len * b.fh).toFixed(2)}`);
    results.push({ teil: 'Karte', name: m.id, cls: m.cls, len: +(m.len * b.fh).toFixed(3) });
    x3 += Math.max(w, 60) + 22;
  }
  text(`Bildgröße je Klasse auf der Karte: S ${unit.S} · M ${unit.M} · L ${unit.L} · XL ${unit.XL} Moduleinheiten (Zahl unter dem Schiff: sichtbare Rumpflänge)`, 40, H - 40, 20, '#8fb7c4', 'left', 500);
  return { url: c.toDataURL('image/png'), results };
}, { fight, map, data, unit, moduleImg, PAD });
await browser.close();
await writeFile(out, Buffer.from(png.url.split(',')[1], 'base64'));
console.log(JSON.stringify(png.results));
