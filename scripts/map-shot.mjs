// Kartengrafik in mehreren Zoomstufen fotografieren (Gesamtansicht, Station, Felder, Funkenregen).
// node scripts/map-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { pathToFileURL } from 'node:url';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL('/home/user/X4-handy/dist/index.html').href);
await page.waitForTimeout(700);
await page.click('text=Loslegen');
await page.evaluate(() => {
  const g = window.__game, s = g.state, A = g.actions;
  s.help = { coachOff: true };
  s.credits = 50e6;
  const a = s.stations[0];
  for (const d of ['prod_refinedmetals', 'prod_graphene', 'storage_liquid', 'storage_container_m', 'storage_solid_l', 'prod_hullparts', 'yard_m']) a.modules.push({ uid: s.nextId++, def: d, t: 0, running: true, stall: '', util: 1 });
  a.inventory.ore = 30000; a.inventory.energycells = 9000; a.inventory.methane = 20000;
  A.buyShip(s, 'alligator_min', a.id); A.buyShip(s, 'alligator_gas', a.id); A.buyShip(s, 'boa', a.id); A.buyShip(s, 'buffalo', a.id); A.buyShip(s, 'tuatara', a.id);
  for (const d of ['prod_siliconwafers', 'prod_microchips', 'dock_m', 'pier_l']) { if (!s.blueprints.includes(d)) s.blueprints.push(d); A.queueModule(s, a.id, d); }
  g.step(900);
  g.refresh();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/gfx-1-overview.png` });
const zoomTo = async (x, z, rel) => { await page.evaluate(([x, z, rel]) => { const g = window.__game; g.cam.x = x; g.cam.z = z; g.cam.zoom = g.cam.fitZoom * rel; }, [x, z, rel]); await page.waitForTimeout(900); };
const st = await page.evaluate(() => { const a = window.__game.state.stations[0]; return [a.x, a.z]; });
await zoomTo(st[0], st[1], 2); await page.screenshot({ path: `${out}/gfx-2-zoom2.png` });
await zoomTo(st[0], st[1], 4); await page.screenshot({ path: `${out}/gfx-3-station4.png` });
await zoomTo(st[0], st[1], 9); await page.screenshot({ path: `${out}/gfx-4-station9.png` });
// Felder: Erz, Methan und Helium
await zoomTo(-115, -10, 3); await page.screenshot({ path: `${out}/gfx-5-ore.png` });
await zoomTo(62, 105, 3); await page.screenshot({ path: `${out}/gfx-6-methane.png` });
await zoomTo(-95, 95, 1.6); await page.screenshot({ path: `${out}/gfx-7-helium.png` });
// Modul wird fertig: Funkenregen
await zoomTo(st[0], st[1], 5);
await page.evaluate(() => { const g = window.__game, a = g.state.stations[0]; if (a.build) { const d = a.build; d.paid = 1; d.remaining = 0.5; } g.step(1); });
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/gfx-8-burst.png` });
console.log(JSON.stringify(errors));
if (errors.length) process.exit(1);
await browser.close();
