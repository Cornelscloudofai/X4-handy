// Werft-Schauraum prüfen: Leiste mit allen Schiffen (Draufsicht), Auswahl wechselt Bühne und Werte, Rollenfilter
// (auch Kampf mit Kampfwert), Kauf.
// node scripts/shipyard-shot.mjs <outdir>
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
await page.click('text=Loslegen mit Handel');
await page.waitForTimeout(2200);
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 5_000_000; g.ui.modal = { type: 'buyShip', station: g.state.stations[0].id, role: 'all' }; g.refresh(); });
await page.waitForTimeout(1500);
// 8 zivile Schiffe (Miner, Transporter) und 7 Kampfschiffe
if ((await page.locator('#modal .sy-thumb').count()) !== 15) fail('Nicht alle 15 Schiffe in der Leiste');
if ((await page.locator('#modal .sy-thumb img').count()) !== 15) fail('Draufsichten fehlen');
await page.screenshot({ path: `${out}/werft-1.png` });
await page.click('#modal [data-act="buyship-sel"][data-cls="tuatara"]');
await page.waitForTimeout(1300);
if (!(await page.locator('#modal .sy-stage.scene').count())) fail('Tuatara ohne Szenenbild');
await page.screenshot({ path: `${out}/werft-2-tuatara.png` });
await page.click('#modal [data-act="buyship-role"][data-role="miner"]');
await page.waitForTimeout(400);
if ((await page.locator('#modal .sy-thumb').count()) !== 5) fail('Filter Miner zeigt nicht 5 Schiffe');
await page.click('#modal [data-act="buyship-sel"][data-cls="wyvern_gas"]');
await page.waitForTimeout(1300);
await page.screenshot({ path: `${out}/werft-3-wyvern.png` });
await page.click('#modal [data-act="buyship-role"][data-role="fighter"]');
await page.waitForTimeout(400);
if ((await page.locator('#modal .sy-thumb').count()) !== 7) fail('Filter Kampf zeigt nicht 7 Schiffe');
await page.click('#modal [data-act="buyship-sel"][data-cls="cobra"]');
await page.waitForTimeout(1300);
if (!(await page.locator('#modal .sy-stat', { hasText: 'Kampfwert' }).count())) fail('Kampfschiff ohne Kampfwert');
await page.screenshot({ path: `${out}/werft-4-cobra.png` });
await page.click('#modal [data-act="buyship-role"][data-role="trader"]');
await page.click('#modal [data-act="buyship-sel"][data-cls="boa"]');
await page.waitForTimeout(400);
const before = await page.evaluate(() => window.__game.state.ships.filter((s) => s.cls === 'boa').length);
await page.click('#modal [data-act="buyship"][data-cls="boa"]');
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__game.state.ships.filter((s) => s.cls === 'boa').length);
if (after !== before + 1) fail('Kauf der Boa hat nicht geklappt');
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
