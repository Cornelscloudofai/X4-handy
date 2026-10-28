// Sektorinfo mit Reitern (Allgemein, Wirtschaft, Erkundung) in der Karte und auf der Detailseite. node scripts/sectortabs-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Bergbau');
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 4.7e6; g.refresh(); });
await page.click('[data-act="sector-info"]');
await page.waitForTimeout(400);
for (const [tab, check] of [['general', '.sec-license'], ['economy', '.sec-fields'], ['explore', '.gx-explore']]) {
  await page.click(`.gx-card [data-act="sector-tab"][data-tab="${tab}"]`);
  await page.waitForTimeout(300);
  if (!(await page.locator(`.gx-card ${check.split(', ').join(', .gx-card ')}`).count())) errors.push(`Reiter ${tab} ohne Inhalt`);
  await page.screenshot({ path: `${out}/sectabs-${tab}.png` });
}
// Detailseite eines Nachbarsektors: dieselben Reiter
await page.evaluate(() => { const g = window.__game; g.openPanel('sector', 'tkr'); g.refresh(); });
await page.waitForTimeout(500);
if ((await page.locator('#panel .sec-tabs button').count()) !== 3) errors.push('Detailseite ohne Reiter');
await page.click('#panel [data-act="sector-tab"][data-tab="general"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/sectabs-panel.png` });
await browser.close();
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
