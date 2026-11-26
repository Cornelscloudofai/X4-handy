// Größenvergleich aller Schiffe im Spiel (eigene und gegnerische), nach X4-Länge (Kha'ak geschätzt): drei Bänder –
// Großkampfschiffe in eigenem Maßstab (Cobra als Bezug), darunter Korvetten/Fregatten und Jäger im selben Maßstab.
// node scripts/schiffe-vergleich.mjs <ausgabe.png>
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { launchOpts } from './browser.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] ?? 'schiffe-vergleich.png';
/** Seite: Farbe der Kennung */
const SIDE = { split: '#5ff0d8', pirat: '#ff9a4a', xenon: '#ff4a5a', khaak: '#c77dff' };
/** Name, Bild, Länge in m (X4 5.00; Kha'ak und Wolf geschätzt bzw. angenommen), Seite, Rolle */
const SHIPS = [
  ['Raptor', 'split-raptor-ki', 3191, 'split', 'Träger'],
  ['Xenon K', 'xenon-k-gross-ki', 1670, 'xenon', 'Zerstörer'],
  ['Piratenträger', 'pirat-traeger-ki', 1164, 'pirat', 'Träger'],
  ['Klapperschlange', 'split-klapperschlange-ki', 906.4, 'split', 'Zerstörer'],
  ['Kha’ak-Brutschiff', 'khaak-brutschiff-ki', 600, 'khaak', 'Brutschiff (geschätzt)'],
  ['Kha’ak-Zerstörer', 'khaak-zerstoerer-ki', 300, 'khaak', 'Zerstörer (geschätzt)'],
  ['Piratenfregatte', 'pirat-fregatte-ki', 149.5, 'pirat', 'Fregatte'],
  ['Dragon', 'split-dragon-ki', 149.2, 'split', 'Korvette'],
  ['Cobra', 'split-cobra-ki', 147.7, 'split', 'Fregatte'],
  ['Xenon P', 'xenon-p-ki', 137.7, 'xenon', 'Fregatte'],
  ['Piratenfrachter', 'frachter-m-ki', 122.5, 'pirat', 'Frachter'],
  ['Kanonenboot', 'pirat-kanonenboot-s-ki', 122.1, 'pirat', 'Korvette'],
  ['Raketenboot', 'pirat-raketenboot-s-ki', 97.3, 'pirat', 'Korvette'],
  ['Kha’ak-Korvette', 'khaak-korvette-ki', 60, 'khaak', 'Korvette (geschätzt)'],
  ['Schildträger', 'pirat-schildtraeger-s-ki', 52.8, 'pirat', 'Begleitschiff'],
  ['Kha’ak-Abfangjäger', 'khaak-abfangjaeger-ki', 35, 'khaak', 'Abfangjäger (geschätzt)'],
  ['Xenon N', 'xenon-n-ki', 34.7, 'xenon', 'Jäger'],
  ['Piratenjäger', 'pirat-jaeger-s-ki', 32.2, 'pirat', 'Jäger'],
  ['Mamba', 'split-jaeger-s-ki', 32.0, 'split', 'Jäger'],
  ['Xenon M', 'xenon-m-ki', 31.7, 'xenon', 'Jäger'],
  ['Chimera', 'split-chimera-ki', 31.2, 'split', 'Schwerer Jäger'],
  ['Balaur', 'split-balaur-ki', 30.7, 'split', 'Schwerer Jäger'],
  ['Wolf', 'split-wolf-ki', 30.7, 'split', 'Bomber (angenommen)'],
  ['Schirmdrohne', 'xenon-schirmdrohne-ki', 30.6, 'xenon', 'Schilddrohne'],
  ['Asp', 'split-asp-ki', 26.9, 'split', 'Jäger'],
  ['Jaguar', 'split-jaguar-ki', 25.8, 'split', 'Aufklärer'],
  ['Kha’ak-Jäger', 'khaak-jaeger-ki', 25, 'khaak', 'Jäger (geschätzt)'],
  ['Argon-Jäger', 'argon-jaeger-s-ki', 21.7, 'split', 'Jäger (Grafikvergleich)'],
  ['Kha’ak-Späher', 'khaak-spaeher-ki', 15, 'khaak', 'Späher (geschätzt)'],
];
const img = async (name) => 'data:image/webp;base64,' + (await readFile(`${root}src/assets/sprites/${name}.webp`)).toString('base64');
const data = await Promise.all(SHIPS.map(async ([name, file, m, side, role]) => ({ name, src: await img(file), m, color: SIDE[side], role })));

const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent('<html><body style="margin:0;background:#04080c"><canvas id="c"></canvas></body></html>');
await page.evaluate(async (ships) => {
  // Bilder laden und auf den sichtbaren Rumpf zuschneiden (Bug oben: Länge = Höhe des Zuschnitts)
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  for (const s of ships) {
    const im = await load(s.src);
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    s.im = im; s.crop = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }
  const W = 2400, PAD = 56, S = 3; // 7200 px breit: Schrift und Schiffe bleiben auch stark vergrößert scharf
  const bands = [
    { title: 'Großkampfschiffe', sub: 'Träger, Zerstörer, Brutschiff', pick: (s) => s.m >= 250, ref: 'Cobra', H: 760, bar: 500 },
    // Korvetten/Fregatten und Jäger im selben Maßstab (group): so sieht man, wie viel größer eine Fregatte ist
    { title: 'Korvetten, Fregatten und Frachter', sub: '50 bis 150 m', pick: (s) => s.m >= 50 && s.m < 250, ref: null, H: 430, bar: 50, group: 'mf' },
    { title: 'Jäger', sub: 'unter 40 m · gleicher Maßstab wie die Korvetten und Fregatten darüber', pick: (s) => s.m < 50, ref: null, H: 430, bar: 10, group: 'mf' },
  ];
  // Maßstab je Band: höchstes Schiff füllt H; passt die Breite nicht (Platz je Schiff mindestens so breit wie seine
  // Beschriftung), kleiner. Bänder einer Gruppe bekommen den kleinsten Maßstab der Gruppe.
  const gap = 22, avail = W - 2 * PAD;
  const mc = document.createElement('canvas').getContext('2d');
  const label = (s) => { mc.font = '600 17px Barlow, sans-serif'; const a = mc.measureText(s.isRef ? `${s.name} (Bezug)` : s.name).width; mc.font = '400 14px Barlow, sans-serif'; return Math.max(a, mc.measureText(s.role).width) + 16; };
  for (const b of bands) {
    b.list = ships.filter(b.pick).sort((a, c) => c.m - a.m);
    const ref = b.ref ? ships.find((s) => s.name === b.ref) : null;
    b.all = ref ? [...b.list, { ...ref, isRef: true }] : b.list;
    for (const s of b.all) s.lw = label(s);
    const slot = (s, kk) => Math.max(s.crop[2] * (s.m * kk / s.crop[3]), s.lw);
    b.widthAt = (kk) => b.all.reduce((a, s) => a + slot(s, kk) + gap, -gap);
    b.slot = slot;
    let k = b.H / Math.max(...b.list.map((s) => s.m));
    for (let i = 0; i < 200 && b.widthAt(k) > avail; i++) k *= 0.98;
    b.k = k;
  }
  for (const b of bands) if (b.group) b.k = Math.min(...bands.filter((c) => c.group === b.group).map((c) => c.k));
  for (const b of bands) b.H = Math.max(...b.list.map((s) => s.m)) * b.k;
  // Höhe: Kopf + Bänder (Band: Titelzeile 70, Schiffe H, Beschriftung 92, Abstand 40)
  const head = 150, total = head + bands.reduce((a, b) => a + 70 + b.H + 92 + 40, 0) + 40;
  const cv = document.getElementById('c'); cv.width = W * S; cv.height = total * S;
  const g = cv.getContext('2d'); g.scale(S, S); g.imageSmoothingQuality = 'high';
  // Hintergrund: dunkles Blau mit leichtem Verlauf und Sternen
  const bg = g.createLinearGradient(0, 0, 0, total); bg.addColorStop(0, '#07111a'); bg.addColorStop(1, '#03070b');
  g.fillStyle = bg; g.fillRect(0, 0, W, total);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(200,230,255,${0.08 + rnd() * 0.35})`; g.fillRect(rnd() * W, rnd() * total, rnd() < 0.1 ? 1.6 : 1, rnd() < 0.1 ? 1.6 : 1); }
  g.fillStyle = '#e4f3f0'; g.font = '600 44px "Chakra Petch", Barlow, sans-serif'; g.fillText('Schiffe im Größenvergleich', PAD, 74);
  g.fillStyle = 'rgba(169,195,198,0.9)'; g.font = '400 20px Barlow, sans-serif';
  g.fillText('Rumpflänge nach X4 (Kha’ak geschätzt). Großkampfschiffe in eigenem Maßstab (die Cobra steht als Bezug mit drin, gestrichelt); Korvetten, Fregatten und Jäger darunter im selben Maßstab.', PAD, 110);
  // Legende der Seiten
  let lx = PAD;
  for (const [n, c] of [['Split (eigene Schiffe)', '#5ff0d8'], ['Piraten', '#ff9a4a'], ['Xenon', '#ff4a5a'], ['Kha’ak', '#c77dff']]) {
    g.fillStyle = c; g.fillRect(lx, 128, 22, 4); g.fillStyle = 'rgba(228,243,240,0.85)'; g.font = '500 17px Barlow, sans-serif'; g.fillText(n, lx + 30, 135); lx += g.measureText(n).width + 70;
  }
  const fmt = (m) => (m >= 1000 ? (m / 1000).toFixed(2).replace('.', ',') + ' km' : (m >= 100 ? Math.round(m) : m.toFixed(1).replace('.', ',').replace(',0', '')) + ' m');
  let y = head;
  for (const b of bands) {
    const { all, slot, widthAt, k } = b;
    // Bandkopf
    g.strokeStyle = 'rgba(110,220,205,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(PAD, y + 8); g.lineTo(W - PAD, y + 8); g.stroke();
    g.fillStyle = '#e4f3f0'; g.font = '600 28px "Chakra Petch", Barlow, sans-serif'; g.fillText(b.title, PAD, y + 46);
    const tw = g.measureText(b.title).width;
    g.fillStyle = 'rgba(169,195,198,0.8)'; g.font = '400 18px Barlow, sans-serif'; g.fillText(b.sub, PAD + tw + 18, y + 46);
    // Maßstabsleiste rechts
    const bl = b.bar * k, bx = W - PAD - bl, by = y + 40;
    g.strokeStyle = '#e4f3f0'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bl, by); g.moveTo(bx, by - 7); g.lineTo(bx, by + 7); g.moveTo(bx + bl, by - 7); g.lineTo(bx + bl, by + 7); g.stroke();
    g.fillStyle = '#e4f3f0'; g.font = '500 17px Barlow, sans-serif'; g.textAlign = 'right'; g.fillText(`${b.bar} m`, bx - 10, by + 6); g.textAlign = 'left';
    // Schiffe: Unterkante auf einer Linie
    const base = y + 70 + b.H;
    const tot = widthAt(k);
    let x = PAD + (avail - tot) / 2;
    for (const s of all) {
      const h = s.m * k, w = s.crop[2] * (h / s.crop[3]), sw = slot(s, k);
      x += (sw - w) / 2;
      g.save();
      if (s.isRef) g.globalAlpha = 0.85;
      g.drawImage(s.im, s.crop[0], s.crop[1], s.crop[2], s.crop[3], x, base - h, w, h);
      g.restore();
      if (s.isRef) { g.setLineDash([5, 5]); g.strokeStyle = 'rgba(228,243,240,0.5)'; g.lineWidth = 1; g.strokeRect(x - 6, base - h - 6, w + 12, h + 12); g.setLineDash([]); }
      // Beschriftung unter dem Schiff (bei sehr schmalen Schiffen mindestens 110 breit, mittig)
      const cx = x + w / 2;
      g.fillStyle = s.color; g.fillRect(cx - 18, base + 14, 36, 3);
      g.textAlign = 'center';
      g.fillStyle = '#e4f3f0'; g.font = '600 17px Barlow, sans-serif'; g.fillText(s.isRef ? `${s.name} (Bezug)` : s.name, cx, base + 40);
      g.fillStyle = 'rgba(255,210,122,0.95)'; g.font = '600 16px Barlow, sans-serif'; g.fillText(fmt(s.m), cx, base + 61);
      g.fillStyle = 'rgba(169,195,198,0.75)'; g.font = '400 14px Barlow, sans-serif'; g.fillText(s.role, cx, base + 80);
      g.textAlign = 'left';
      x += w + (sw - w) / 2 + gap;
    }
    y = base + 92 + 40;
  }
}, data);
// Beschriftungen dürfen sich nicht überlappen: Breite je Schiff mindestens so breit wie der Name – vorab geprüft
const png = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
await (await import('node:fs/promises')).writeFile(out, Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
