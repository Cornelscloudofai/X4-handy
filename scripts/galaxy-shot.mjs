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
// Auswahl von Familie Zhin zeigt die Karte mit Bild und „Hinfliegen“
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = 'zhin'; g.refresh(); });
await page.waitForTimeout(900);
if (!(await page.locator('.gx-card [data-act="goto-sector"]').count())) fail('Antippen zeigt keine Sektorkarte');
await page.screenshot({ path: `${out}/sektorenkarte-3.png` });
await page.click('.gx-card [data-act="select-clear"]');
await page.waitForTimeout(300);
await page.click('#hud .tool-row .btn.outline-teal');
await page.waitForTimeout(500);
if (!(await page.evaluate(() => window.__game.ui.view === 'sector'))) fail('„Zum Sektor“ führt nicht zurück');
// Unbekannter Raum: entdeckte Sektoren erscheinen, gefundene Torsignaturen zeigen ins Leere, Unentdecktes bleibt unsichtbar
await page.evaluate(() => { const g = window.__game; g.state.frontier = { discovered: ['f-ausblick', 'f-glut1', 'f-asche'], signatures: ['f-asche>f-rhak', 'f-glut1>f-schmiede'] }; g.refresh(); });
await page.click('#nav [data-act="nav"][data-tab="map"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/sektorenkarte-4-neu.png` });
const hitNew = await page.evaluate(() => /Sektoren bekannt/i.test(document.getElementById('hud').textContent));
if (!hitNew) fail('Kopfzeile ohne bekannte Sektoren');
// Späher: kaufen und nach Rhy's Defiance schicken, Flug und Suche laufen, danach Spur oder Signatur
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = 'rhy'; g.refresh(); });
await page.waitForTimeout(400);
await page.click('.gx-card [data-act="scout-buy"]');
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="scout-send"]');
await page.waitForTimeout(300);
await page.evaluate(() => { const g = window.__game; g.step(25 * 60); g.refresh(); });
await page.waitForTimeout(900);
if (!(await page.locator('.gx-card .gx-scout').count())) fail('Suche wird nicht angezeigt');
await page.screenshot({ path: `${out}/sektorenkarte-5-suche.png` });
const after = await page.evaluate(() => { const g = window.__game; g.step(2.2 * 3600); g.refresh(); const f = g.state.frontier; return { busy: !!f.scouts[0].task, sig: f.signatures.includes('rhy>f-ausblick'), log: g.state.log.filter((x) => /Späher/.test(x.text)).map((x) => x.text).join(' | ') }; });
if (after.busy) fail('Späher wird nicht fertig');
if (!after.sig && !/Keine Spur/.test(after.log)) fail('Suche ohne Ergebnis: ' + after.log);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/sektorenkarte-6-ergebnis.png` });
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
