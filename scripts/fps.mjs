// Bildrate der Karte messen (Gesamtansicht, Station nah, Gasfeld, reduzierte Animationen).
// node scripts/fps.mjs
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import path from 'node:path';
import { distUrl } from './serve.mjs';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const cdp = await page.context().newCDPSession(page);

await page.goto(await distUrl());
await page.waitForTimeout(800);
await page.click('text=Loslegen');
await page.evaluate(() => {
  const g = window.__game, s = g.state, A = g.actions;
  s.help = { coachOff: true }; s.credits = 80e6;
  const a = s.stations[0];
  for (const d of ['prod_refinedmetals', 'prod_graphene', 'storage_liquid', 'storage_container_m', 'storage_solid_l', 'prod_hullparts', 'yard_m', 'prod_siliconwafers', 'prod_microchips', 'storage_liquid_m']) a.modules.push({ uid: s.nextId++, def: d, t: 0, running: true, stall: '', util: 1 });
  for (let i = 0; i < 6; i++) { A.buyShip(s, 'alligator_min', a.id); A.buyShip(s, 'alligator_gas', a.id); A.buyShip(s, 'boa', a.id); }
  A.queueModule(s, a.id, 'prod_graphene');
  g.step(1200);
  window.__fit = g.cam.fitZoom ?? g.cam.zoom;
});
const measure = async (label, rel, x, z) => {
  await page.evaluate(([rel, x, z]) => { const g = window.__game; if (x !== null) { g.cam.x = x; g.cam.z = z; } g.cam.zoom = window.__fit * rel; }, [rel, x, z]);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (n) => { t.push(n - last); last = n; if (t.length < 240) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
  r.sort((a, b) => a - b);
  console.log(label, 'Mittel', (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1), 'ms · Median', r[120].toFixed(1), 'ms · 90 %', r[216].toFixed(1), 'ms');
};
const st = await page.evaluate(() => [window.__game.state.stations[0].x, window.__game.state.stations[0].z]);
await measure('Gesamtansicht', 1, 0, 0);
await measure('Station nah  ', 6, st[0], st[1]);
await measure('Gasfeld nah  ', 3, 62, 105);
await measure('Erzfeld nah  ', 6, -115, -10);
await measure('Erzfeld sehr nah', 14, -115, -10);
await page.evaluate(() => { window.__game.ui.reducedMotion = true; });
await measure('Reduziert    ', 1, 0, 0);
await browser.close();
