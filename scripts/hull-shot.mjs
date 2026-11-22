// Trefferform prüfen: über jedes eigene Schiff die Punkte legen, die als Treffer zählen (rot ohne Schild, cyan nur mit
// Schild). So sieht man, ob die Trefferzone genau auf der Außenhülle liegt.
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
import { playSim } from './simNav.mjs';
const out = process.argv[2] ?? 'shots';
const ships = (process.argv[3] ?? 'jaguar,mamba,asp,balaur,chimera,dragon,cobra,klapperschlange,raptor,wolf,argon').split(',');
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('FEHLER', e.message));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Bergbau');
await page.waitForTimeout(800);
const errors = [];
for (const ship of ships) {
  await page.evaluate((ship) => { const lo = JSON.parse(localStorage.getItem('x4-sektorbau-ausruestung') ?? '{}'); lo.ship = ship; localStorage.setItem('x4-sektorbau-ausruestung', JSON.stringify(lo)); }, ship);
  await page.reload();
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; document.getElementById('reveal')?.remove(); g.ui.modal = null; });
  await playSim(page, 'pirates');
  await page.waitForTimeout(300);
  await page.click('#minigame [data-mg="start"]');
  await page.waitForTimeout(1500);
  // anhalten (Schiff zeigt nach oben), Zoom so, dass das Schiff gut ein Drittel der Breite füllt
  const res = await page.evaluate(() => {
    const g = window.__mg.game;
    g.update = () => {};
    g.aimA = -Math.PI / 2;
    g.zoom = Math.min(4, 140 / g.ship.size);
    g.camX = g.px - g.w / 2 / g.zoom;
    g.camY = g.py - g.h / 2 / g.zoom;
    return { size: g.ship.size, mask: !!g.hullGeo?.() };
  });
  await page.waitForTimeout(400);
  const stats = await page.evaluate(() => {
    const g = window.__mg.game, cv = document.querySelector('#minigame canvas');
    const r = cv.getBoundingClientRect();
    const ov = document.createElement('canvas');
    ov.width = r.width * 2; ov.height = r.height * 2;
    Object.assign(ov.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: 99999, pointerEvents: 'none' });
    document.body.appendChild(ov);
    const o = ov.getContext('2d');
    const S = g.ship.size * 0.75, st = S / 45;
    let n = 0, nS = 0;
    for (let y = -S; y <= S; y += st) for (let x = -S; x <= S; x += st) {
      const wx = g.px + x, wy = g.py + y;
      g.shield = 0; const hit = g.onHull(wx, wy, 0);
      g.shield = 1; const hitS = g.onHull(wx, wy, 0);
      if (!hit && !hitS) continue;
      const sx = (wx - g.camX) * g.zoom * 2, sy = (wy - g.camY) * g.zoom * 2;
      o.fillStyle = hit ? 'rgba(255,40,60,0.55)' : 'rgba(80,220,255,0.8)';
      o.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      if (hit) n++; else nS++;
    }
    return { n, nS };
  });
  await page.screenshot({ path: `${out}/hull-${ship}.png` });
  console.log(ship, JSON.stringify({ ...res, ...stats }));
  if (!res.mask && ship !== 'raptor') errors.push(`${ship}: keine Trefferform aus dem Bild`);
  await page.evaluate(() => document.querySelectorAll('canvas[style*="99999"]').forEach((c) => c.remove()));
  await page.evaluate(() => { window.__mg?.quit?.(); });
  await page.reload();
}
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
process.exit(errors.length ? 1 : 0);
