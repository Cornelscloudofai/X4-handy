// Platz für den Sektornamen in der Kopfleiste messen. node scripts/hud-measure.mjs
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const browser = await chromium.launch(launchOpts());
for (const w of [360, 390, 430]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto(await distUrl());
  await page.click('text=Loslegen mit Bergbau');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => [...document.querySelectorAll('.hud-bar > *')].map((e) => `${e.className.split(' ')[0]}:${Math.round(e.getBoundingClientRect().width)}`).join(' ') + ' | name ' + (() => { const b = document.querySelector('.hb-text b'); return `${b.clientWidth}/${b.scrollWidth}`; })());
  console.log(w, r);
  await page.close();
}
await browser.close();
