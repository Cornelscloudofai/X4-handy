// Ebenenbild des Raptors (node scripts/raptor-ebenen.mjs <ordner>): Rumpf-Ebene (vorn, rot), Flugdeck (hinten, blau), Wege der Hangarbuchten
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchOpts } from './browser.mjs';
const out = process.argv[2];
const b64 = (f) => 'data:image/webp;base64,' + readFileSync(f).toString('base64');
const base = b64('src/assets/sprites/split-raptor-ki.webp'), hull = b64('src/assets/sprites/split-raptor-rumpf-ki.webp');
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const res = await page.evaluate(async ({ base, hull }) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [A, H] = await Promise.all([load(base), load(hull)]);
  const W = A.naturalWidth, Hh = A.naturalHeight;
  const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, Hh); return g.getImageData(0, 0, W, Hh); };
  const a = px(A), h = px(H);
  // Ebenenkarte: Rumpf-Ebene deckend = rot (vorn), nur im Grundbild = blau (Flugdeck/Hintergrund), sonst leer
  const m = new ImageData(W, Hh);
  for (let i = 0; i < W * Hh; i++) {
    const ha = h.data[i * 4 + 3], aa = a.data[i * 4 + 3];
    const o = i * 4;
    if (ha > 128) { m.data[o] = 255; m.data[o + 1] = 70; m.data[o + 2] = 60; m.data[o + 3] = 110; }
    else if (aa > 128) { m.data[o] = 40; m.data[o + 1] = 170; m.data[o + 2] = 255; m.data[o + 3] = 150; }
  }
  const mc = document.createElement('canvas'); mc.width = W; mc.height = Hh; mc.getContext('2d').putImageData(m, 0, 0);
  // Buchten (aus loadout.ts): je Seite fünf, Anflug außen (x 70) → Deck (x 290) → unter den Rumpf (x 430)
  const AXIS = 625, YS = [1720, 2250, 2650, 3050, 3420];
  const draw = (scale, x0, y0, w, hgt, labels) => {
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(hgt * scale) + (labels ? 150 : 0);
    const g = c.getContext('2d');
    g.fillStyle = '#04080e'; g.fillRect(0, 0, c.width, c.height);
    g.save(); g.beginPath(); g.rect(0, 0, c.width, Math.round(hgt * scale)); g.clip(); g.scale(scale, scale); g.translate(-x0, -y0);
    g.drawImage(A, 0, 0); g.drawImage(mc, 0, 0);
    g.lineWidth = 5 / scale; g.font = `600 ${15 / scale}px sans-serif`;
    for (const [k, y] of YS.entries()) for (const side of [1, -1]) {
      const X = (p) => (side > 0 ? p : 2 * AXIS - p);
      const pts = [[X(70), y, '#ffd24a', 'außen'], [X(290), y, '#5dff9a', 'Deck'], [X(430), y, '#ff5cf0', 'innen']];
      g.strokeStyle = '#ffffff'; g.setLineDash([12 / scale, 8 / scale]);
      g.beginPath(); g.moveTo(pts[0][0], y); g.lineTo(pts[2][0], y); g.stroke(); g.setLineDash([]);
      for (const [x, yy, col, name] of pts) {
        g.fillStyle = col; g.beginPath(); g.arc(x, yy, 9 / scale, 0, Math.PI * 2); g.fill();
        if (labels && side > 0) { g.fillStyle = '#fff'; g.fillText(name, x - 18 / scale, yy - 14 / scale); }
      }
      if (labels && side > 0) { g.fillStyle = '#fff'; g.fillText(`Bucht ${k + 1}`, X(70) - 30 / scale, y + 32 / scale); }
    }
    g.restore();
    if (labels) {
      const L = c.height - 140;
      g.font = '600 17px sans-serif';
      const row = (y, col, t) => { g.fillStyle = col; g.fillRect(14, y - 13, 22, 16); g.fillStyle = '#e8f4f2'; g.fillText(t, 46, y); };
      row(L + 18, 'rgba(255,70,60,0.75)', 'Rot: Rumpf-Ebene – liegt ÜBER startenden/landenden Schiffen (verdeckt sie)');
      row(L + 46, 'rgba(40,170,255,0.85)', 'Blau: Flugdeck – liegt UNTER ihnen (Schiffe sichtbar)');
      row(L + 74, '#ffd24a', 'Gelb → Grün → Pink: Weg außen → Deckmitte → unter die Panzerplatte');
      g.fillStyle = '#9fb8bb'; g.fillText('Start: umgekehrt (innen → Deck → außen). Ohne Färbung: leer (Weltraum).', 46, L + 102);
    }
    return c.toDataURL('image/png');
  };
  return { full: draw(0.4, 0, 0, W, Hh, false), detail: draw(0.75, 0, 1550, 1254, 2050, true) };
}, { base, hull });
writeFileSync(`${out}/raptor-ebenen-gesamt.png`, Buffer.from(res.full.split(',')[1], 'base64'));
writeFileSync(`${out}/raptor-ebenen-deck.png`, Buffer.from(res.detail.split(',')[1], 'base64'));
await browser.close();
