// Hörprobe in den Einstellungen: jede Variante spielt sofort (lädt nur ihre eigene Aufnahme, nicht alle) – bei
// langsamem Netz. node scripts/sound-demo-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '.';
const lo = launchOpts();
const browser = await chromium.launch({ ...lo, args: [...(lo.args ?? []), '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
const cdp = await ctx.newCDPSession(page);
// Handynetz, etwa 12 Mbit/s
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 1.5e6, uploadThroughput: 5e5 });
let sn = 0;
page.on('requestfinished', (r) => { if (/\/sn-/.test(r.url())) sn++; });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(800);
await page.click('text=Loslegen');
await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.openPanel('more', undefined, 'settings'); g.refresh(); });
await page.waitForTimeout(400);
if (!(await page.locator('[data-act="sound-demo"]').count())) { await page.click('[data-act="sound-toggle"]'); await page.waitForTimeout(400); }
await page.click('.sound-demo summary');
await page.waitForTimeout(300);
const labels = await page.locator('[data-act="sound-demo"]').allInnerTexts();
for (const want of ['Splitter 1', 'Splitter 2', 'Tau 2', 'Rakete 3', 'Explosion groß 1', 'Strahlwaffe 2', 'Gestein bricht 4']) if (!labels.some((l) => l.replace(/^\d+\s*/, '').trim() === want)) errors.push(`Hörprobe ohne „${want}“`);
const res = {};
for (const label of ['Splitter 1', 'Tau 2', 'Explosion groß 1']) {
  if (!(await page.locator('.sound-demo').evaluate((d) => d.open))) await page.click('.sound-demo summary');
  const sn0 = sn;
  await page.locator('[data-act="sound-demo"]').filter({ hasText: new RegExp(`^\\s*\\d+\\s*${label}$`) }).first().click({ force: true });
  let peak = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500 && peak < 0.25) { await page.waitForTimeout(100); peak = Math.max(peak, await page.evaluate(() => window.__audio.meterPeak())); }
  res[label] = { peak: +peak.toFixed(2), ms: Date.now() - t0, files: sn - sn0 };
  if (peak < 0.25) errors.push(`${label}: kein Klang innerhalb von 2,5 s (Spitze ${peak.toFixed(2)})`);
  if (sn - sn0 > 2) errors.push(`${label}: ${sn - sn0} Dateien geladen statt nur der eigenen`);
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${out}/hoerprobe.png` });
await browser.close();
console.log(JSON.stringify({ res, errors }, null, 1));
if (errors.length) process.exit(1);
