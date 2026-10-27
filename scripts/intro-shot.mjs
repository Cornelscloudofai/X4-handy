// Intro prüfen: Startschirm beim ersten Start, Trailer lädt (Ladebalken), Antippen startet ihn (im Test-Chromium
// fehlt der H.264-Decoder – dann endet das Intro sofort, wie bei einem Ladefehler), danach Karrierewahl. Am selben
// Tag kein zweites Mal, am nächsten Tag wieder (überspringbar); abschaltbar.
// node scripts/intro-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
const url = (await distUrl()) + '?intro=1';
await page.goto(url);
await page.waitForTimeout(4000);
if (!(await page.locator('#intro').count())) fail('Erster Start ohne Intro');
await page.screenshot({ path: `${out}/intro-1-start.png` });
await page.waitForFunction(() => document.querySelector('#intro')?.classList.contains('ready'), null, { timeout: 30000 }).catch(() => fail('Trailer lädt nicht'));
await page.click('#intro');
await page.waitForTimeout(2500);
if (await page.locator('#intro:not(.out)').count()) {
  // Video spielt (Chromium mit H.264): erster Start ohne Überspringen
  if (await page.locator('#intro .intro-skip:not([hidden])').count()) fail('Erster Start lässt sich überspringen');
  await page.screenshot({ path: `${out}/intro-2-video.png` });
  await page.evaluate(() => { const v = document.querySelector('#intro video'); v.currentTime = v.duration - 0.3; });
  await page.waitForTimeout(2000);
}
if (await page.locator('#intro').count()) fail('Intro endet nicht');
// Willkommen in drei Schritten: Geschichte → Kernelemente → Schiffswahl
if (!(await page.locator('#modal .wl-story').count())) fail('Nach dem Intro keine Geschichte');
await page.waitForTimeout(5500);
await page.screenshot({ path: `${out}/intro-3-geschichte.png` });
await page.click('#modal .wl-next');
await page.waitForTimeout(2600);
if (!(await page.locator('#modal .wl-card').count())) fail('Kernelemente fehlen');
await page.screenshot({ path: `${out}/intro-4-kern.png` });
await page.click('#modal .wl-next');
await page.waitForTimeout(1500);
if (!(await page.locator('text=Loslegen mit Bergbau').isVisible())) fail('Keine Karrierewahl nach den Kernelementen');
await page.screenshot({ path: `${out}/intro-5-karriere.png` });
// Zurück und Überspringen
await page.click('#modal [data-act="welcome-step"][data-step="1"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="welcome-step"][data-step="0"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="welcome-step"][data-step="2"]');
await page.waitForTimeout(600);
if (!(await page.locator('text=Loslegen mit Handel').isVisible())) fail('Überspringen führt nicht zur Karrierewahl');
// gleicher Tag: kein Intro
await page.reload();
await page.waitForTimeout(1500);
if (await page.locator('#intro').count()) fail('Intro am selben Tag erneut');
// nächster Tag: wieder, abschaltbar
await page.evaluate(() => localStorage.setItem('x4-sektorbau-intro', JSON.stringify({ n: 1, day: '2000-1-1' })));
await page.reload();
await page.waitForTimeout(1500);
if (!(await page.locator('#intro').count())) fail('Intro am nächsten Tag fehlt');
await page.evaluate(() => { localStorage.setItem('x4-sektorbau-intro', JSON.stringify({ n: 2, day: '2000-1-1' })); localStorage.setItem('x4-sektorbau-intro-aus', '1'); });
await page.reload();
await page.waitForTimeout(1500);
if (await page.locator('#intro').count()) fail('Abgeschaltetes Intro läuft trotzdem');
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
