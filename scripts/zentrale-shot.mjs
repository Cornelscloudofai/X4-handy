// Bildschirmfotos der Einsatzzentrale (Hoch- und Querformat) und ihrer Ziele
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? 'shots';
const browser = await chromium.launch(launchOpts());
for (const [w, h, tag] of [[390, 844, 'hoch'], [844, 390, 'quer']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('FEHLER', e.message));
  await page.goto(await distUrl());
  await page.click('text=Loslegen mit Bergbau');
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.step(3600); document.getElementById('reveal')?.remove(); g.ui.modal = null; g.openPanel('more'); g.refresh(); });
  await page.waitForTimeout(300);
  await page.click('[data-act="zentrale"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/z-${tag}.png` });
  const ed = await page.$('.z-edge.right:not([hidden])');
  if (ed) { await ed.click(); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/z-${tag}-rechts.png` }); }
  for (const a of ['z-lage', 'z-dev', 'z-sim']) {
    await page.evaluate((a) => document.querySelector(`.z-bar [data-act="${a}"]`).click(), a);
    await page.waitForTimeout(400);
    if (tag === 'hoch') await page.screenshot({ path: `${out}/z-${a}.png` });
    await page.evaluate(() => document.querySelector('[data-act="modal-close"]').click());
    await page.waitForTimeout(300);
    console.log(tag, a, 'zurück in Zentrale:', !!(await page.$('.zentrale')));
  }
  await page.close();
}
await browser.close();
