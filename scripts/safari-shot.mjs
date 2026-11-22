// Vergleich Chrome / Safari-Ersatzweg: dieselben Ansichten einmal mit und einmal ohne ctx.filter (wie Safari bis iOS 17)
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
import { playSim } from './simNav.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
for (const nf of [false, true]) {
  const tag = nf ? 'safari' : 'chrome';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('FEHLER', tag, e.message));
  if (nf) await page.addInitScript(() => { window.__x4NoFilter = true; });
  await page.goto(await distUrl());
  await page.click('text=Loslegen mit Bergbau');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; document.getElementById('reveal')?.remove(); g.ui.modal = null; g.refresh(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/ios-${tag}-sektor.png` });
  await page.evaluate(() => { const g = window.__game; g.actions?.toggleGalaxy?.(); document.querySelector('[data-act="galaxy"]')?.click(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/ios-${tag}-galaxie.png` });
  await page.evaluate(() => document.querySelector('[data-act="galaxy"]')?.click());
  await page.waitForTimeout(500);
  await playSim(page, 'xenon');
  await page.waitForTimeout(400);
  await page.click('#minigame [data-mg="start"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__mg.game; for (let i = 0; i < 60 * 40 && !g.result(); i++) { g.autopilot(); g.update(1 / 60); } });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/ios-${tag}-kampf.png` });
  console.log(tag, await page.evaluate(() => !!window.__x4NoFilter));
  await page.close();
}
await browser.close();
