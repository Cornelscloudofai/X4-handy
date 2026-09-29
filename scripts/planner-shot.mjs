// Screenshots des Stationsplaners: node scripts/planner-shot.mjs <outdir>
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, hasTouch: name === 'phone', isMobile: name === 'phone' });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.waitForTimeout(600);
  await page.click('text=Loslegen');
  await page.click('[data-act="nav"][data-tab="planner"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/planner-${name}-1.png` });
  await page.evaluate(() => document.querySelector('.diagram-wrap').scrollIntoView());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/planner-${name}-2.png` });
  await page.evaluate(() => { const g = window.__game; g.ui.plan.targets = [{ ware: 'claytronics', modules: 1 }]; g.refresh(); document.querySelector('.diagram-wrap').scrollIntoView(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/planner-${name}-3.png` });
  await page.evaluate(() => document.querySelector('.plan-row').scrollIntoView());
  await page.screenshot({ path: `${out}/planner-${name}-4.png` });
  await page.close();
}
console.log('errors', errors);
await browser.close();
