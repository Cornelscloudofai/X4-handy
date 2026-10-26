// App-Symbol (Startbildschirm): Sektor-Sechseck in Türkis mit dem Split-Jäger, dazu „X4“ – 1024 px gezeichnet,
// als 512er und 192er PNG gespeichert (Inhalt im sicheren Bereich, damit auch runde/maskierte Symbole passen).
// node scripts/render-icon.mjs
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';
const root = new URL('..', import.meta.url).pathname;
const ship = `data:image/webp;base64,${(await readFile(`${root}src/assets/sprites/split-jaeger-s-ki.webp`)).toString('base64')}`;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const out = await page.evaluate(async (ship) => {
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const bg = g.createRadialGradient(N / 2, N * 0.46, 40, N / 2, N / 2, N * 0.72);
  bg.addColorStop(0, '#0f3a40'); bg.addColorStop(0.55, '#08202a'); bg.addColorStop(1, '#040a12');
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  // Sechseck (wie das Sektor-Symbol), mit Leuchten
  const hex = (r) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; g.lineTo(N / 2 + Math.cos(a) * r, N * 0.47 + Math.sin(a) * r); } g.closePath(); };
  hex(330); g.fillStyle = 'rgba(63,224,197,0.07)'; g.fill();
  g.shadowColor = '#3fe0c5'; g.shadowBlur = 40; g.strokeStyle = '#3fe0c5'; g.lineWidth = 22; hex(330); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(191,247,236,0.9)'; g.lineWidth = 6; hex(330); g.stroke();
  const img = new Image(); img.src = ship; await img.decode();
  const s = 470;
  g.shadowColor = 'rgba(255,140,60,0.55)'; g.shadowBlur = 50;
  g.drawImage(img, N / 2 - s / 2, N * 0.45 - s / 2, s, s);
  g.shadowBlur = 0;
  g.font = '700 150px "DejaVu Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#040a12'; g.strokeText('X4', N / 2, N * 0.84);
  g.shadowColor = '#3fe0c5'; g.shadowBlur = 30; g.fillStyle = '#effffb'; g.fillText('X4', N / 2, N * 0.84);
  const scaled = (n) => { const o = document.createElement('canvas'); o.width = o.height = n; const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, n, n); return o.toDataURL('image/png'); };
  return { big: scaled(512), small: scaled(192) };
}, ship);
await browser.close();
await writeFile(`${root}public/icon-512.png`, Buffer.from(out.big.split(',')[1], 'base64'));
await writeFile(`${root}public/icon-192.png`, Buffer.from(out.small.split(',')[1], 'base64'));
console.log('public/icon-512.png, public/icon-192.png');
