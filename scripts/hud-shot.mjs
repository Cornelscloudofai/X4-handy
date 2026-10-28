// Kopfleiste ansehen: Sektor, Bauen-Menü offen, Sektorenkarte – in 390 und 360 px Breite. node scripts/hud-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const errors = [];
for (const w of [390, 360]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(await distUrl());
  await page.click('text=Loslegen mit Bergbau');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 8.6e6;
    g.state.frontier ??= { signatures: [], discovered: [] };
    g.discover('f-glut1');
    const t = g.state.time; g.step((3 * 3600 - ((t + 70 * 60) % (3 * 3600))) + 60);
    document.getElementById('reveal')?.remove();
    g.gotoSector('f-glut1'); g.refresh();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('reveal')?.remove());
  await page.screenshot({ path: `${out}/hud-${w}-1-sektor.png` });
  // Leiste darf nicht breiter als der Bildschirm sein
  const over = await page.evaluate(() => { const b = document.querySelector('.hud-bar'); return b ? b.scrollWidth - b.clientWidth : -1; });
  if (over > 1) errors.push(`Leiste läuft über (${w} px): ${over}`);
  await page.click('[data-act="build-menu"]');
  await page.waitForTimeout(300);
  if (!(await page.locator('.build-menu [data-act="place-start"]').count())) errors.push('Bauen-Menü ohne Station');
  await page.screenshot({ path: `${out}/hud-${w}-2-bauen.png` });
  await page.click('.build-menu [data-act="layer-menu"]');
  await page.waitForTimeout(300);
  if (!(await page.locator('.flow-filter').count())) errors.push('Routen-Ebenen öffnen sich nicht');
  await page.click('[data-act="sector-info"]');
  await page.waitForTimeout(400);
  if (!(await page.locator('.gx-card').count())) errors.push('Sektorinfo öffnet keine Karte');
  await page.screenshot({ path: `${out}/hud-${w}-3-info.png` });
  await page.click('.hb-sector');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/hud-${w}-4-karte.png` });
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
