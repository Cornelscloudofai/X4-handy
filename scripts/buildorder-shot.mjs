// Handy-Test der Baureihenfolge inkl. Touch-Ziehen: node scripts/buildorder-shot.mjs <outdir>
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
await page.evaluate(() => {
  const g = window.__game, A = g.actions, s = g.state;
  s.credits = 900_000; // reicht für den ersten Bau, nicht für alles
  const st = s.stations[0];
  for (const d of ['prod_refinedmetals', 'storage_liquid', 'prod_graphene', 'prod_refinedmetals', 'storage_container', 'prod_siliconwafers', 'prod_superfluidcoolant']) A.queueModule(s, st.id, d);
  g.step(5);
  g.ui.paused = true;
  g.openPanel('station', st.id, 'modules');
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/build-1.png` });
const order = () => page.evaluate(() => window.__game.state.stations[0].queue.map((q) => q.def.replace('prod_', '').replace('storage_', 'L:')));
console.log('vorher', await order());
// Pfeil: zweite Position nach oben
await page.locator('.build-row[data-uid] [data-act="q-move"]').nth(2).click();
await page.waitForTimeout(300);
console.log('Pfeil hoch', await order());
// Touch-Ziehen: letzte sichtbare Position auf Platz 1
const handles = page.locator('[data-drag-handle]');
const n = await handles.count();
const src = await handles.nth(Math.min(4, n - 1)).boundingBox();
const dst = await handles.nth(0).boundingBox();
const cdp = await page.context().newCDPSession(page);
const scroll0 = await page.evaluate(() => document.querySelector('#panel .sheet-body').scrollTop);
const pt = (x, y) => [{ x, y, id: 1 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(src.x + src.width / 2, src.y + src.height / 2) });
const steps = 14;
for (let i = 1; i <= steps; i++) {
  const y = src.y + src.height / 2 + ((dst.y - src.y - 10) * i) / steps;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(src.x + src.width / 2, y) });
  await page.waitForTimeout(30);
  if (i === steps - 3) await page.screenshot({ path: `${out}/build-2-drag.png` });
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
const scroll1 = await page.evaluate(() => document.querySelector('#panel .sheet-body').scrollTop);
console.log('nach Ziehen', await order(), 'Seite gescrollt um', scroll1 - scroll0);
// Einfügen: Lager an Position 2
await page.locator('.insert-slot button').nth(1).click();
await page.waitForTimeout(300);
await page.click('#modal .tabs button:has-text("Lager")');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/build-3-insert.png` });
await page.locator('[data-act="queue"]').first().click();
await page.waitForTimeout(300);
console.log('nach Einfügen', await order());
await page.screenshot({ path: `${out}/build-4.png` });
console.log('errors', errors);
await browser.close();
