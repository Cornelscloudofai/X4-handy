// Querformat im Kampf und HUD-Größe prüfen: keine überlappenden Bedienelemente quer, Regler wirkt auf Oberfläche
// und Spielfeld (Minispiel rechnet in HUD-Pixeln), Verbesserungskarten passen quer unter die Kopfzeile.
// node scripts/quer-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const errors = [];
const fail = (msg) => errors.push(msg);

async function open(viewport, mobile, hud) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (hud) await page.addInitScript((k) => localStorage.setItem('x4-sektorbau-hud', k), String(hud));
  await page.goto(await distUrl());
  await page.waitForTimeout(700);
  await page.click('text=Loslegen');
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.refresh(); });
  await page.waitForTimeout(400);
  return page;
}
async function combat(page, kind = 'xenon') {
  await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
  await page.waitForTimeout(300);
  await page.click(`#modal [data-act="mg-play"][data-kind="${kind}"]`);
  await page.waitForTimeout(500);
  await page.click('#minigame [data-mg="start"]');
  await page.waitForTimeout(1500);
}

// --- Handy quer: Kampf ---
{
  const page = await open({ width: 844, height: 390 }, true);
  await combat(page);
  const r = await page.evaluate(() => {
    const g = window.__mg.game;
    const circ = { cam: g.btnCam, out: g.btnZoomOut, in: g.btnZoomIn, dash: g.btnDash, fire: g.btnFire, rak: g.btnMissile };
    const [rx, ry, rw, rh] = g.radarRect;
    return { quer: g.quer, w: g.w, h: g.h, circ, radar: { x: rx, y: ry, w: rw, h: rh } };
  });
  if (!r.quer) fail('Querformat nicht erkannt');
  const c = Object.entries(r.circ);
  for (let i = 0; i < c.length; i++) {
    const [n, [x, y, rad]] = c[i];
    if (x - rad < 0 || x + rad > r.w || y - rad < 0 || y + rad > r.h) fail(`quer: ${n} ragt aus dem Bild`);
    // Kreis gegen Radar
    const nx = Math.max(r.radar.x, Math.min(x, r.radar.x + r.radar.w)), ny = Math.max(r.radar.y, Math.min(y, r.radar.y + r.radar.h));
    if (Math.hypot(nx - x, ny - y) < rad) fail(`quer: ${n} liegt auf dem Radar`);
    for (let j = i + 1; j < c.length; j++) {
      const [m, [x2, y2, r2]] = c[j];
      if (Math.hypot(x - x2, y - y2) < rad + r2 + 4) fail(`quer: ${n} überlappt ${m}`);
    }
  }
  await page.screenshot({ path: `${out}/quer-kampf.png` });
  // Verbesserungskarten: alle drei ganz im Bild, unter der Kopfzeile
  const cards = await page.evaluate(() => { const g = window.__mg.game; g.offerCards(); return g.cardRects(); });
  for (const [, y, , h] of cards) if (y < 120 || y + h > 390) fail('quer: Verbesserungskarte ragt aus dem Bild');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/quer-karten.png` });
  await page.close();
}

// --- PC groß, HUD 150 % ---
{
  const page = await open({ width: 1440, height: 900 }, false, 1.5);
  const zoom = await page.evaluate(() => getComputedStyle(document.getElementById('hud')).zoom);
  if (Math.abs(Number(zoom) - 1.5) > 0.01) fail(`HUD 150 %: Kopfleiste nicht gezoomt (${zoom})`);
  const navH = await page.evaluate(() => document.getElementById('nav').getBoundingClientRect().height);
  // Einstellungen: Regler vorhanden, Wert stimmt
  await page.evaluate(() => { const g = window.__game; g.ui.panel = { type: 'more', tab: 'settings' }; g.refresh(); });
  await page.waitForTimeout(300);
  const val = await page.locator('#panel input[data-change="hud-scale"]').inputValue().catch(() => null);
  if (val !== '150') fail(`HUD-Regler fehlt oder falscher Wert (${val})`);
  await page.screenshot({ path: `${out}/hud-150.png` });
  // Regler auf 100 %: Leiste wird kleiner
  await page.locator('#panel input[data-change="hud-scale"]').fill('100');
  await page.waitForTimeout(300);
  const navH1 = await page.evaluate(() => document.getElementById('nav').getBoundingClientRect().height);
  if (!(navH1 < navH * 0.8)) fail(`HUD-Regler wirkt nicht (${navH} → ${navH1})`);
  if (await page.evaluate(() => localStorage.getItem('x4-sektorbau-hud')) !== '1') fail('HUD-Größe nicht gespeichert');
  await page.locator('#panel input[data-change="hud-scale"]').fill('150');
  await page.waitForTimeout(300);
  await combat(page);
  // Spielfeld in HUD-Pixeln
  const gw = await page.evaluate(() => window.__mg.game.w);
  if (Math.abs(gw - 1440 / 1.5) > 2) fail(`HUD 150 %: Kampf rechnet nicht in HUD-Pixeln (${gw})`);
  await page.screenshot({ path: `${out}/hud-150-kampf.png` });
  await page.close();
}

// --- Handy hochkant, HUD 150 %: auf 340 px Breite begrenzt ---
{
  const page = await open({ width: 390, height: 844 }, true, 1.5);
  const zoom = Number(await page.evaluate(() => getComputedStyle(document.getElementById('hud')).zoom));
  if (zoom > 390 / 340 + 0.01) fail(`HUD auf schmalem Handy nicht begrenzt (${zoom})`);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error('Fehler:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Querformat und HUD-Größe in Ordnung');
