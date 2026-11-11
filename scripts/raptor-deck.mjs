// Raptor-Flugdeck: Vorschläge für die Rumpf-Ebene (was liegt über startenden/landenden Jägern) aus dem Grundbild
// berechnen und als Vorschau zeigen. node scripts/raptor-deck.mjs <ordner> [A|B|C zum Übernehmen]
// A Deckbahn: das ganze graublaue Deck durchgehend frei, Außengitter vorn
// B wie A, dazu je Bucht eine Schleuse im Außengitter
// C wie A, Außengitter ganz hinten (Jäger fliegen darüber)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchOpts } from './browser.mjs';
const [out, take] = process.argv.slice(2);
const b64 = (f) => 'data:image/webp;base64,' + readFileSync(f).toString('base64');
const base = b64('src/assets/sprites/split-raptor-ki.webp'), jet = b64('src/assets/sprites/split-jaeger-s-ki.webp');
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const res = await page.evaluate(async ({ base, jet, take }) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [A, J] = await Promise.all([load(base), load(jet)]);
  const W = A.naturalWidth, H = A.naturalHeight, AXIS = 625;
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
  const bg = bc.getContext('2d'); bg.drawImage(A, 0, 0);
  const px = bg.getImageData(0, 0, W, H).data;
  const at = (x, y) => (y * W + x) * 4;
  // Deckfarbe: graublau, nicht rot/orange, mittelhell
  const deck = (x, y) => { const o = at(x, y), r = px[o], g = px[o + 1], b = px[o + 2], a = px[o + 3]; const l = (r + g + b) / 3; return a > 200 && b >= r - 6 && l > 22 && l < 160; };
  const Y0 = 1560, Y1 = 3580;
  const xa = new Float32Array(H).fill(NaN), xb = new Float32Array(H).fill(NaN);
  for (let y = Y0; y < Y1; y++) {
    // längster Deckabschnitt links (Lücken bis 16 px überbrückt)
    let best = [0, 0], s = -1, gap = 0, last = -1;
    for (let x = 100; x < 480; x++) {
      if (deck(x, y)) { if (s < 0) s = x; last = x; gap = 0; }
      else if (s >= 0 && ++gap > 16) { if (last - s > best[1] - best[0]) best = [s, last]; s = -1; gap = 0; }
    }
    if (s >= 0 && last - s > best[1] - best[0]) best = [s, last];
    if (best[1] - best[0] > 40 && best[0] < 330) { xa[y] = best[0]; xb[y] = best[1]; }
  }
  // glätten: Median über ±40 Zeilen, Lücken überbrücken
  const med = (arr, y) => { const v = []; for (let k = -40; k <= 40; k++) { const q = arr[y + k]; if (!Number.isNaN(q)) v.push(q); } v.sort((p, q) => p - q); return v.length > 20 ? v[v.length >> 1] : NaN; };
  const A1 = new Float32Array(H).fill(NaN), B1 = new Float32Array(H).fill(NaN);
  for (let y = Y0; y < Y1; y++) { A1[y] = med(xa, y); B1[y] = med(xb, y); }
  // Panzerkante (für C): erste Stelle ab x 160, an der die nächsten 24 px überwiegend roter Panzer sind –
  // auch dort, wo das Deck unten nur noch schmal und neutralgrau ist
  const armor = (x, y) => { const o = at(x, y), r = px[o], g = px[o + 1], b = px[o + 2]; return px[o + 3] > 200 && r > 40 && r > g * 1.55 && b < g * 1.4 + 10; };
  const YE = 3565;
  let yFirst = Y1; for (let y = Y0; y < Y1; y++) if (!Number.isNaN(A1[y])) { yFirst = y; break; }
  const E0 = new Float32Array(H).fill(NaN), E1 = new Float32Array(H).fill(NaN);
  for (let y = yFirst; y < YE; y++) {
    for (let x = 160; x < 520; x++) {
      let n = 0; for (let k = 0; k < 24; k++) if (armor(x + k, y)) n++;
      if (n >= 18) { E0[y] = x; break; }
    }
  }
  for (let y = yFirst; y < YE; y++) E1[y] = med(E0, y);
  // Turmplatten auf dem Deck bleiben vorn (Seitendeck vorn: Spalten 247/282, Zeilen 1918–2006)
  const plates = [{ cx: 264, y0: 1830, y1: 2095, hw: 46 }];
  const inPlate = (x, y) => plates.some((p) => { if (y < p.y0 || y > p.y1) return false; const t = Math.min(y - p.y0, p.y1 - y) / ((p.y1 - p.y0) / 2); return Math.abs(x - p.cx) < p.hw * Math.min(1, 0.35 + t * 1.6); });
  // fünf Buchten gleichmäßig auf der Deckbahn, frei von der Turmplatte
  const BAYS = [1660, 2180, 2500, 2820, 3140];
  const bays = BAYS.map((y) => ({ y, out: 18, deck: Math.round((A1[y] + B1[y]) / 2), in: Math.round((Number.isNaN(E1[y]) ? B1[y] : Math.max(B1[y], E1[y])) + 80) }));
  // Masken (1 = Rumpf-Ebene durchsichtig) für die linke Seite, rechts gespiegelt
  const mask = (v) => {
    const m = new Float32Array(W * H);
    for (let y = Y0; y < Math.max(Y1, YE); y++) {
      // C: alles links der Panzerkante frei (Gitter und Deck unter den Jägern), A/B: nur die erkannte Deckbahn
      const xr = v === 'C' ? (Number.isNaN(E1[y]) ? B1[y] : E1[y]) : B1[y];
      if (Number.isNaN(xr) || (v !== 'C' && Number.isNaN(A1[y]))) continue;
      const lock = v === 'B' ? BAYS.some((by) => Math.abs(y - by) < 30) : false;
      const xl = v === 'C' || lock ? 0 : A1[y];
      for (let x = Math.floor(xl); x <= xr; x++) {
        if (inPlate(x, y)) continue;
        // weiche Kante zum Panzer (6 px)
        const f = Math.min(1, (xr - x) / 6 + 0.001);
        m[y * W + x] = f; m[y * W + (2 * AXIS - x)] = f;
      }
    }
    return m;
  };
  const hullOf = (m) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(A, 0, 0);
    const d = g.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) if (m[i] > 0) d.data[i * 4 + 3] = Math.round(d.data[i * 4 + 3] * (1 - m[i]));
    g.putImageData(d, 0, 0);
    return c;
  };
  const tint = (hull) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const hd = hull.getContext('2d').getImageData(0, 0, W, H).data, m = new ImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      if (hd[o + 3] > 128) { m.data[o] = 255; m.data[o + 1] = 70; m.data[o + 2] = 60; m.data[o + 3] = 105; }
      else if (px[o + 3] > 128) { m.data[o] = 40; m.data[o + 1] = 170; m.data[o + 2] = 255; m.data[o + 3] = 150; }
    }
    g.putImageData(m, 0, 0);
    return c;
  };
  const X0 = 0, CY0 = 1560, CW = 640, CH = 2020, SC = 0.42;
  const variants = ['A', 'B', 'C'], names = { A: 'A · Deckbahn', B: 'B · Deckbahn + Schleusen', C: 'C · Gitter hinten' };
  const cols = variants.map((v) => { const h = hullOf(mask(v)); return { v, h, t: tint(h) }; });
  const pane = Math.round(CW * SC), ph = Math.round(CH * SC), gap = 16, top = 34;
  const sheet = document.createElement('canvas'); sheet.width = 3 * pane + 4 * gap; sheet.height = 2 * ph + 3 * gap + 2 * top + 70;
  const s = sheet.getContext('2d');
  s.fillStyle = '#05090f'; s.fillRect(0, 0, sheet.width, sheet.height);
  const JL = 120;
  cols.forEach(({ v, h, t }, i) => {
    const x = gap + i * (pane + gap);
    for (const [row, real] of [[0, false], [1, true]]) {
      const y = top + row * (ph + top + gap);
      s.fillStyle = '#e8f4f2'; s.font = '600 15px sans-serif';
      s.fillText(row ? `${v} · so sieht es aus` : names[v], x, y - 10);
      s.save(); s.beginPath(); s.rect(x, y, pane, ph); s.clip();
      s.translate(x, y); s.scale(SC, SC); s.translate(-X0, -CY0);
      s.drawImage(A, 0, 0);
      if (real) {
        // Jäger auf dem Weg: außen, im Gitter, auf dem Deck, halb unter dem Panzer – zwischen Grundbild und Rumpf-Ebene
        // je Bucht zwei Stellen: abwechselnd außen + Deck bzw. im Gitter + halb unter dem Panzer
        for (const [i, b] of bays.entries()) for (const fx of i % 2 ? [(b.out + b.deck) / 2 - 20, b.in - 40] : [b.out + 30, b.deck]) {
          s.save(); s.translate(fx, b.y); s.rotate(Math.PI / 2); s.drawImage(J, -JL / 2, -JL / 2, JL, JL); s.restore();
        }
        s.drawImage(h, 0, 0);
      } else {
        s.drawImage(t, 0, 0);
        s.lineWidth = 4 / SC; s.setLineDash([10 / SC, 7 / SC]); s.strokeStyle = '#fff';
        for (const b of bays) { s.beginPath(); s.moveTo(b.out, b.y); s.lineTo(b.in, b.y); s.stroke(); for (const [xx, c] of [[b.out, '#ffd24a'], [b.deck, '#5dff9a'], [b.in, '#ff5cf0']]) { s.fillStyle = c; s.beginPath(); s.arc(xx, b.y, 9 / SC, 0, 7); s.fill(); } }
        s.setLineDash([]);
      }
      s.restore();
    }
  });
  s.font = '600 14px sans-serif';
  const ly = sheet.height - 52;
  s.fillStyle = 'rgba(255,70,60,0.8)'; s.fillRect(gap, ly - 11, 18, 13); s.fillStyle = '#e8f4f2'; s.fillText('Rumpf-Ebene vorn (verdeckt Jäger)', gap + 26, ly);
  s.fillStyle = 'rgba(40,170,255,0.9)'; s.fillRect(gap + 290, ly - 11, 18, 13); s.fillStyle = '#e8f4f2'; s.fillText('frei: Jäger sichtbar', gap + 316, ly);
  s.fillStyle = '#9fb8bb'; s.fillText('Weg gelb → grün → pink: außen → Deck → unter den Panzer (Start umgekehrt). Unten: Jäger an je zwei Stellen des Wegs.', gap, ly + 24);
  const pick = take ? cols.find((c) => c.v === take) : null;
  return { sheet: sheet.toDataURL('image/png'), bays, hull: pick ? pick.h.toDataURL('image/webp', 0.95) : '' };
}, { base, jet, take });
writeFileSync(`${out}/raptor-deck-vorschlaege.png`, Buffer.from(res.sheet.split(',')[1], 'base64'));
console.log(JSON.stringify(res.bays));
if (res.hull) { writeFileSync('src/assets/sprites/split-raptor-rumpf-ki.webp', Buffer.from(res.hull.split(',')[1], 'base64')); console.log('Rumpf-Ebene übernommen:', take); }
await browser.close();
