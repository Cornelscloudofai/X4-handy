// Handy-Test Planer + Vollbild-Editor mit Touch-Gesten: node scripts/planner-shot.mjs <outdir>
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
await page.waitForTimeout(600);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.ui.paused = true; g.state.blueprints.push('prod_hullparts'); });
await page.click('[data-act="nav"][data-tab="planner"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/pl-1-draft.png` });
await page.click('.diagram-preview');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/pl-2-editor.png` });
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
// Kästchen "Veredelte Metalle" ziehen
const box = await page.locator('.dg-editor [data-node="refinedmetals"] rect').first().boundingBox();
const before = await page.evaluate(() => JSON.stringify(window.__game.ui.plan.layout ?? {}));
const sx = box.x + 30, sy = box.y + 12;
await touch('touchStart', [[sx, sy]]);
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[sx + i * 4, sy + i * 12]]); await page.waitForTimeout(20); }
await touch('touchEnd', []);
await page.waitForTimeout(300);
const after = await page.evaluate(() => JSON.stringify(window.__game.ui.plan.layout ?? {}));
console.log('Layout vorher', before, 'nachher', after);
// Pinch-Zoom
const k0 = await page.evaluate(() => window.__game.ui.dg.k);
await touch('touchStart', [[150, 500], [240, 500]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[150 - i * 8, 500], [240 + i * 8, 500]]); await page.waitForTimeout(20); }
await touch('touchEnd', []);
await page.waitForTimeout(200);
console.log('Zoom', k0.toFixed(2), '→', (await page.evaluate(() => window.__game.ui.dg.k)).toFixed(2));
// Minus an Veredelte Metalle → Unterversorgung + Empfehlung
await page.locator('.dg-editor [data-act="dg-mod"][data-ware="refinedmetals"][data-d="-1"]').click();
await page.waitForTimeout(300);
await page.click('[data-act="dg-fit"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/pl-3-deficit.png` });
const rec = await page.locator('.dg-editor [data-act="dg-rec"]').count();
console.log('Empfehlungen sichtbar:', rec);
await page.locator('.dg-editor [data-act="dg-rec"]').first().click();
await page.waitForTimeout(300);
console.log('nach Empfehlung Engpässe:', await page.locator('.dg-legend').innerText());
await page.click('[data-act="modal-close"]');
// Station planen: Quelle umschalten, + drücken, Baureihenfolge prüfen
await page.selectOption('#planSource', { index: 1 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/pl-4-station.png` });
await page.click('.diagram-preview');
await page.waitForTimeout(500);
await page.click('#modal [data-act="plan-pick"]');
await page.click('[data-act="plan-add"][data-ware="refinedmetals"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/pl-5-station-editor.png` });
const recs = await page.locator('.dg-editor [data-act="dg-rec"]').count();
console.log('Station: Empfehlungen', recs);
await page.locator('.dg-editor [data-act="dg-mod"][data-ware="refinedmetals"][data-d="1"]').click();
await page.waitForTimeout(200);
console.log('Queue', await page.evaluate(() => window.__game.state.stations[0].queue.map((q) => q.def)));
await page.click('[data-act="modal-close"]');
await page.click('#panel [data-act="open-station"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/pl-6-buildorder.png` });
console.log('errors', errors);
await browser.close();
