// Peil-Minispiel und Entwicklerregler prüfen: Peilen öffnet das Radar, Antenne auf dem Signal füllt die Peilung,
// danach fliegt der Späher mit Vorsprung los. Der Regler „Alles“ zeigt alle Sektoren (nur Ansicht).
// node scripts/peil-shot.mjs <outdir>
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
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 5e6; g.refresh(); });
await page.click('#nav [data-act="nav"][data-tab="map"]');
await page.waitForTimeout(900);
// Entwicklerregler
await page.click('[data-act="dev-reveal"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/peil-0-alles.png` });
const revealed = await page.evaluate(() => !(window.__game.state.frontier?.discovered?.length));
if (!revealed) fail('Regler verändert den Spielstand');
await page.click('[data-act="dev-reveal"]');
await page.waitForTimeout(400);
// Späher kaufen, in Rhy's Defiance peilen
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = 'rhy'; g.refresh(); });
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="scout-buy"]');
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="scout-peil"]');
await page.waitForTimeout(1500);
if (!(await page.locator('#peilung').count())) fail('Peilung öffnet sich nicht');
await page.screenshot({ path: `${out}/peil-1-suche.png` });
// Antenne aufs Signal halten
for (let i = 0; i < 90; i++) {
  if (await page.locator('#peilung .peil-end:not([hidden])').count()) break;
  await page.evaluate(() => window.__peil?.set(window.__peil.target));
  if (i === 25) await page.screenshot({ path: `${out}/peil-2-gehalten.png` });
  await page.waitForTimeout(100);
}
await page.locator('#peilung .peil-end:not([hidden])').waitFor({ timeout: 8000 }).catch(() => fail('Peilung endet nicht'));
await page.screenshot({ path: `${out}/peil-3-ergebnis.png` });
await page.click('#peilung [data-peil="go"]');
await page.waitForTimeout(400);
const task = await page.evaluate(() => window.__game.state.frontier.scouts[0].task);
if (!task || (task.bonus ?? 0) < 0.9) fail('Späher ohne Peil-Vorsprung unterwegs: ' + JSON.stringify(task));
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
