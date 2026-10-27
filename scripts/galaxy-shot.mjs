// Sektorenkarte prüfen: „Sektor“ erneut antippen öffnet sie, Sektorbilder, Rohstoffe, eigene Stationen/Schiffe,
// Tipp auf einen Sektor zeigt seine Karte, „Zum Sektor“ führt zurück.
// node scripts/galaxy-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Bergbau');
await page.waitForTimeout(2200);
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.refresh(); });
await page.click('#nav [data-act="nav"][data-tab="map"]');
await page.waitForTimeout(1800);
if (!(await page.evaluate(() => window.__game.ui.view === 'galaxy'))) fail('„Sektor“ öffnet die Sektorenkarte nicht');
if (!(await page.locator('#nav [data-tab="map"]:has-text("Karte")').count())) fail('Reiter heißt nicht „Karte“');
await page.screenshot({ path: `${out}/sektorenkarte-1.png` });
// ausgebaut: zweiter Sektor mit Station, Schiffe
await page.evaluate(() => {
  const g = window.__game, s = g.state, A = g.actions;
  s.credits = 50e6;
  if (!s.sectors.includes('cascade')) s.sectors.push('cascade');
  A.foundStation(s, 'cascade', 30, 20);
  for (const k of ['boa', 'alligator_min', 'alligator_gas']) A.buyShip(s, k, s.stations[0].id);
  g.refresh();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/sektorenkarte-2.png` });
await page.click('#hud .tool-row .btn.outline-teal');
await page.waitForTimeout(500);
if (!(await page.evaluate(() => window.__game.ui.view === 'sector'))) fail('„Zum Sektor“ führt nicht zurück');
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
