// Handy-Test der Kauf- und Verkaufsorder: Station → Lager → „Ware einkaufen/verkaufen …“ – Preis und Füllstand, kein eigenes Schiff nötig
// node scripts/buyorder-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(600);
await page.click('.start-card[data-kind="mining"]');
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  g.ui.coachOff = true;
  if (s.help) s.help.coachOff = true;
  g.ui.paused = true;
  g.openPanel('station', s.stations[0].id, 'storage');
});
await page.waitForTimeout(400);
await page.click('#panel [data-act="buy-open"][data-ware=""]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/buyorder-1.png` });
const noShipNeeded = await page.evaluate(() => !document.querySelector('#modal [data-act="buy-ship"]') && !!document.querySelector('#modal [data-act="buy-order-set"]'));
await page.$eval('#buyOrderFill', (el) => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/buyorder-2-fill.png` });
await page.click('#modal [data-act="buy-order-set"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/buyorder-3-set.png` });
// Verkaufsorder für dieselbe Ware – läuft parallel zur Kauforder, ebenfalls ohne Schiff
await page.click('#panel [data-act="sell-open"][data-ware="energycells"]');
await page.waitForTimeout(400);
const sellNoShip = await page.evaluate(() => !document.querySelector('#modal [data-act="sell-ship"]') && !!document.querySelector('#modal [data-act="sell-order-set"]'));
await page.$eval('#sellOrderPrice', (el) => { el.value = '16'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/buyorder-4-sell.png` });
await page.click('#modal [data-act="sell-order-set"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/buyorder-5-both.png` });
const rule = await page.evaluate(() => { const s = window.__game.state; return s.stations[0].trade.energycells; });
const report = { noShipNeeded, sellNoShip, rule, errors };
console.log(JSON.stringify(report, null, 1));
await browser.close();
const ok = noShipNeeded && sellNoShip && rule?.buy && rule.price != null && Math.abs(rule.fill - 0.5) < 1e-6 && rule.sell && rule.sellPrice === 16 && !errors.length;
if (!ok) { console.error('Fehlgeschlagen'); process.exit(1); }
