// Größenvergleich aller Schiffe: so groß, wie das Spiel sie zeichnet – im Kampf-Minispiel (Spielpunkte) und auf der
// Sektorkarte (Moduleinheiten, mit dem S/M-Andockmodul). Gemessen wird die sichtbare Rumpflänge (ohne leeren Rand im
// Bild). Liest die Größen aus dem Quelltext, damit der Bogen nach jeder Änderung neu erzeugt werden kann.
// node scripts/size-sheet.mjs <ausgabe.png> [jetzt|A|B]
//   jetzt – Größen, wie das Spiel sie heute zeichnet
//   A     – X4-Längen: S-Schiffe wie heute (Mamba 38) mit echten Verhältnissen untereinander, ab der Cobra (80) alles im
//           echten X4-Verhältnis; dazwischen (z. B. Manticore) stufenlos übergeleitet. Karte: M wie heute.
//   B     – durchgehend echtes X4-Verhältnis, Maßstab an der Mamba (38 wie heute). Karte: S wie heute.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] ?? 'groessen.png';
const mode = process.argv[3] ?? 'jetzt';
/**
 * Schiffslängen aus X4 5.00 in Metern (Tabelle „X4 5.00 Ship Lengths“, im Spiel gemessen). Wolf: eigener Entwurf, wie
 * Balaur angenommen; Argon-Jäger: wie Elite (Argon-S-Jäger).
 */
const X4_LEN = {
  jaguar: 25.8, asp: 26.9, balaur: 30.7, chimera: 31.2, mamba: 32.0, wolf: 30.7, argon: 21.7, tuatara: 34.2, tuatara_min: 34.2,
  manticore: 57.4, boa: 141.5, alligator_gas: 146.1, alligator_min: 146.1, cobra: 147.7, dragon: 149.2,
  wyvern_gas: 557.9, wyvern_min: 557.9, buffalo: 577.3, klapperschlange: 906.4, rattlesnake: 906.4, raptor: 3191,
};
/** Ziel-Länge im Kampf-Minispiel (Spielpunkte) aus der X4-Länge – je nach Variante */
function fightLen(m) {
  if (mode === 'B') return m * (38 / 32.0);
  // A: bis 35 m wie die S-Jäger (Mamba 38), von 35 m bis zur Cobra linear auf 80, darüber echtes Verhältnis zur Cobra
  const s = 38 / 32.0, at35 = 35 * s, cobra = 80, k = cobra / 147.7;
  if (m <= 35) return m * s;
  if (m <= 147.7) return at35 + ((m - 35) / (147.7 - 35)) * (cobra - at35);
  return m * k;
}
/** Ziel-Länge auf der Sektorkarte (Moduleinheiten): A – Cobra wie heute (0,175); B – Mamba wie heute (0,076) */
const mapLen = (m) => (mode === 'B' ? m * (0.076 / 32.0) : fightLen(m) * (0.175 / 80));
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

if (mode !== 'jetzt') {
  for (const f of fight) { const m = X4_LEN[f.id]; if (m) { f.m = m; f.target = fightLen(m); } }
  for (const s2 of map) { const m = X4_LEN[s2.id]; if (m) { s2.m = m; s2.target = mapLen(m); } }
}
const title = mode === 'A' ? 'Variante A – X4-Längen, S-Jäger wie heute, ab der Cobra echtes Verhältnis' : mode === 'B' ? 'Variante B – durchgehend echtes X4-Verhältnis (Maßstab: Mamba wie heute)' : 'Heute';
const all = [...new Set([...fight.map((f) => f.sprite), ...map.map((m) => m.sprite), 'split-dock-ki'])];
const data = Object.fromEntries(await Promise.all(all.map(async (n) => [n, await sprites(n)])));
// Raptor: M-Landeplatz im Bild (gemessen, Bildpunkte)
const PAD = { x: 548, y: 3310, w: 157, h: 330, imgH: 5016 };

const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const png = await page.evaluate(async ({ fight, map, data, unit, moduleImg, PAD, title, mode }) => {
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
  text(title, W - 40, 56, 26, mode === 'jetzt' ? '#8fb7c4' : '#ffd27a', 'right', 700);
  text('Kampf-Minispiel (Spielpunkte, sichtbare Rumpflänge)', 40, 56, 28, '#5ff0d8', 'left', 700);
  // Kampfkarte zum Vergleich: so breit ist das Spielfeld
  text('Kampfkarte: 2.600 Spielpunkte breit', 40, 86, 16, '#5f8a92', 'left', 500);
  // Maßstab so, dass das längste Schiff (Raptor) in die obere Hälfte passt
  const raptorF = fight.find((f) => f.aspect);
  const rBox = raptorF && imgs[raptorF.sprite] ? box(imgs[raptorF.sprite]) : { fh: 1 };
  const rDraw = raptorF ? (raptorF.target ? raptorF.target / rBox.fh : raptorF.draw) : 1000;
  const k1 = Math.min(0.82, 1010 / rDraw), base1 = 1170;
  grid(40, 90, W - 80, base1 - 90, 100 * k1);
  text(`Raster: 100 Spielpunkte · Maßstab ${k1 < 0.8 ? 'verkleinert' : 'wie bisher'}`, W - 40, 90 + 22, 15, '#5f8a92', 'right', 500);
  // Breite der Kampfkarte als Linie
  g.strokeStyle = 'rgba(255,210,122,0.5)'; g.lineWidth = 2; g.setLineDash([8, 6]);
  g.beginPath(); g.moveTo(40, 100); g.lineTo(40 + Math.min(W - 80, 2600 * k1), 100); g.stroke(); g.setLineDash([]);
  let x = 70;
  const raptor = fight.find((f) => f.aspect);
  for (const f of [raptor, ...fight.filter((q) => !q.aspect).sort((a, b) => b.draw - a.draw)]) {
    const img = imgs[f.sprite]; if (!img) continue;
    const b = box(img), len = f.target ?? f.draw * b.fh;
    // Variante: Bild so groß, dass der sichtbare Rumpf die Ziel-Länge hat
    const draw = f.target ? f.target / b.fh : f.draw;
    const w = ship(img, x, base1, draw * k1, f.aspect, f.name, `${f.cls} · ${Math.round(len)}${f.m ? ` · X4 ${f.m} m` : ''}`);
    results.push({ teil: 'Kampf', name: f.name, cls: f.cls, len: Math.round(len) });
    x += Math.max(w, 112) + 34;
  }
  // Ausschnitt ×5: kleine Schiffe neben dem M-Landeplatz des Raptors
  // Ausschnitt: so vergrößert, dass die Cobra etwa 230 px lang ist
  const cobraF = fight.find((f) => f.id === 'cobra'), cobraLen = cobraF ? (cobraF.target ?? 80) : 80;
  const base2 = 1660, k2 = 230 / cobraLen;
  text(`Ausschnitt ×${(k2 / k1).toFixed(1).replace('.', ',')}: S- und M-Schiffe neben dem M-Landeplatz auf dem Raptor`, 40, base1 + 110, 24, '#ffd27a', 'left', 700);
  const padImg = imgs['split-raptor-ki'];
  let x2 = 70;
  if (padImg) {
    const rL = rDraw, pxU = rL / PAD.imgH, pw = PAD.w * pxU * k2, ph = PAD.h * pxU * k2;
    g.drawImage(padImg, PAD.x - 20, PAD.y - 20, PAD.w + 40, PAD.h + 40, x2 - 20 * pxU * k2, base2 - ph - 20 * pxU * k2, pw + 40 * pxU * k2, ph + 40 * pxU * k2);
    g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.strokeRect(x2, base2 - ph, pw, ph);
    text('M-Landeplatz', x2 + pw / 2, base2 + 26, 19, '#ffd27a', 'center');
    text(`${Math.round(PAD.h * pxU)} × ${Math.round(PAD.w * pxU)}`, x2 + pw / 2, base2 + 48, 15, '#8fb7c4', 'center', 500);
    x2 += pw + 60;
  }
  for (const f of fight.filter((q) => !q.aspect && (q.cls === 'S' || q.cls === 'M')).sort((a, b) => b.draw - a.draw)) {
    const img = imgs[f.sprite]; if (!img) continue;
    const b = box(img);
    const draw = f.target ? f.target / b.fh : f.draw;
    const w = ship(img, x2, base2, draw * k2, false, f.name, `${f.cls} · ${Math.round(f.target ?? f.draw * b.fh)}`);
    x2 += Math.max(w, 60) + 34;
  }

  // ===== Teil 2: Sektorkarte =====
  const top3 = 1790;
  text('Sektorkarte – Schiffe neben dem S/M-Andockmodul (Moduleinheiten; jede Klasse hat eine feste Bildgröße)', 40, top3, 28, '#5ff0d8', 'left', 700);
  // Maßstab so, dass alle Schiffe und das Modul in die Breite passen
  const visLen = (m) => m.target ?? m.len * 0.9;
  const need = moduleImg + map.reduce((a, m) => a + Math.max(visLen(m) * 0.75, 0.1), 0);
  const k3 = Math.min(520, (W - 200 - map.length * 22) / need), base3 = 2560;
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
    const draw = m.target ? m.target / b.fh : m.len;
    const vis = m.target ?? m.len * b.fh;
    const w = ship(img, x3, base3, draw * k3, false, m.id, `${m.cls} · ${vis.toFixed(2)}`);
    results.push({ teil: 'Karte', name: m.id, cls: m.cls, len: +vis.toFixed(3) });
    x3 += Math.max(w, 54) + 22;
  }
  text(`Bildgröße je Klasse auf der Karte: S ${unit.S} · M ${unit.M} · L ${unit.L} · XL ${unit.XL} Moduleinheiten (Zahl unter dem Schiff: sichtbare Rumpflänge)`, 40, H - 40, 20, '#8fb7c4', 'left', 500);
  return { url: c.toDataURL('image/png'), results };
}, { fight, map, data, unit, moduleImg, PAD, title, mode });
await browser.close();
await writeFile(out, Buffer.from(png.url.split(',')[1], 'base64'));
console.log(JSON.stringify(png.results));
