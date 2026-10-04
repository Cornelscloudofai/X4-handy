// Paket 2 prüfen: Warenfluss mit Filter, Problemsymbole (Tipp öffnet Reiter), Kapitelbanner, Sektor-Hintergründe.
// node scripts/flow-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { pathToFileURL } from 'node:url';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (msg) => errors.push(msg);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL('/home/user/X4-handy/dist/index.html').href);
await page.waitForTimeout(700);
await page.click('text=Loslegen');
// Betrieb mit Minern und Händlern: Flüsse entstehen
await page.evaluate(() => {
  const g = window.__game, s = g.state, A = g.actions;
  s.help = { coachOff: true };
  s.credits = 50e6;
  const a = s.stations[0];
  for (const d of ['prod_refinedmetals', 'prod_graphene', 'storage_liquid', 'storage_container_m', 'storage_solid_l', 'dock_m']) a.modules.push({ uid: s.nextId++, def: d, t: 0, running: true, stall: '', util: 1 });
  A.buyShip(s, 'alligator_min', a.id); A.buyShip(s, 'alligator_gas', a.id); A.buyShip(s, 'tuatara', a.id); A.buyShip(s, 'tuatara', a.id);
  g.step(3 * 3600);
  g.refresh();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/p2-0-routes.png` });
// Standard: Handelsrouten an, Warenflüsse aus; über „Routen“ die Ebenen öffnen und Warenflüsse zuschalten
const layers0 = await page.evaluate(() => ({ r: window.__game.ui.routes, f: window.__game.ui.flows }));
if (!layers0.r || layers0.f) fail('Standard-Ebenen falsch: ' + JSON.stringify(layers0));
await page.click('[data-act="layer-menu"]');
await page.waitForTimeout(200);
if ((await page.locator('.layer-chip').count()) !== 2) fail('Ebenen-Schalter fehlen');
await page.click('[data-act="layer-toggle"][data-layer="flows"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/p2-1-flows.png` });
const chips = await page.locator('.flow-chip').count();
if (chips < 2) fail(`Warenfilter fehlt (${chips} Chips)`);
await page.locator('.flow-chip').nth(1).click();
await page.waitForTimeout(400);
const filtered = await page.evaluate(() => window.__game.ui.flowWare);
if (!filtered) fail('Warenfilter greift nicht');
await page.screenshot({ path: `${out}/p2-2-filter.png` });
await page.locator('.flow-chip').first().click();
// Alles aus: beide Ebenen abschalten
await page.click('[data-act="layer-toggle"][data-layer="routes"]');
await page.click('[data-act="layer-toggle"][data-layer="flows"]');
await page.waitForTimeout(300);
const layers1 = await page.evaluate(() => ({ r: window.__game.ui.routes, f: window.__game.ui.flows }));
if (layers1.r || layers1.f) fail('Ebenen lassen sich nicht ausschalten: ' + JSON.stringify(layers1));
await page.screenshot({ path: `${out}/p2-2b-alles-aus.png` });
await page.click('[data-act="layer-toggle"][data-layer="routes"]');
await page.click('[data-act="layer-menu"]');

// Paket 3: Warensymbole im Lager, Verlaufslinie antippen → große Ansicht, Zeitraum wechseln, Symbolstil umschalten
await page.evaluate(() => { const g = window.__game; g.openPanel('station', g.state.stations[0].id, 'storage'); g.refresh(); });
await page.waitForTimeout(400);
if (!(await page.locator('#panel .ware-tile svg.wi').count())) fail('Warensymbole fehlen im Lager');
if (!(await page.locator('#panel .spark').count())) fail('Verlaufslinien fehlen im Lager');
await page.locator('#panel .spark').first().click();
await page.waitForTimeout(300);
if (!(await page.locator('#modal svg.bigchart').isVisible())) fail('Große Diagrammansicht fehlt');
await page.click('[data-act="chart-range"][data-hours="24"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/p3-chart.png` });
await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'wareIcons' }; g.refresh(); });
await page.waitForTimeout(300);
if ((await page.locator('#modal .wi-cell').count()) < 55) fail('Symbolübersicht unvollständig');
await page.click('#modal [data-act="icon-style"][data-style="line"]');
await page.waitForTimeout(200);
if (!(await page.evaluate(() => window.__game.ui.iconStyle === 'line'))) fail('Symbolstil lässt sich nicht umschalten');
await page.click('#modal [data-act="icon-style"][data-style="glow"]');
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.ui.panel = null; g.refresh(); });

// Problemsymbole: Tipp auf das Lager-Symbol öffnet den Reiter „Lager“
await page.evaluate(() => {
  const g = window.__game, a = g.state.stations[0];
  g.ui.paused = true;
  g.ui.selection = null;
  a.modules.find((m) => m.def === 'prod_refinedmetals').stall = 'storage';
  g.cam.x = a.x; g.cam.z = a.z; g.cam.zoom = g.cam.fitZoom * 1.8;
  g.refresh();
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/p2-3-markers.png` });
// Position des Symbols: rechts oben neben der Station
const hit = await page.evaluate(() => {
  const g = window.__game, a = g.state.stations[0];
  const [sx, sy] = g.cam.toScreen(a.x, a.z);
  for (let dx = 0; dx < 80; dx += 2) for (let dy = 0; dy < 80; dy += 2) {
    const x = sx + dx, y = sy - dy;
    if (g.renderer?.markerAt?.(x, y)) return [x, y];
  }
  return null;
});
if (!hit) fail('Problemsymbol nicht gefunden');
else {
  const box = await page.locator('#map').boundingBox();
  await page.touchscreen.tap(box.x + hit[0], box.y + hit[1]);
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => window.__game.ui.panel);
  if (panel?.type !== 'station' || panel.tab !== 'storage') fail('Tipp auf Problemsymbol öffnet nicht den Lager-Reiter: ' + JSON.stringify(panel));
  await page.screenshot({ path: `${out}/p2-4-marker-tap.png` });
}

// Kapitel abschließen: großes Banner
await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.ui.paused = false; g.refresh(); g.claim(); });
await page.waitForTimeout(500);
if (!(await page.locator('#banner.show .banner-in').isVisible())) fail('Kapitelbanner nicht sichtbar');
await page.screenshot({ path: `${out}/p2-5-banner.png` });
await page.waitForTimeout(3300);
if (await page.locator('#banner .banner-in').isVisible()) fail('Kapitelbanner bleibt stehen');

// Alle Sektoren mit eigenem Hintergrund
await page.evaluate(() => { const g = window.__game; g.state.sectors.push('tkr', 'cascade', 'ravine', 'rhy', 'hoa', 'zyarth'); });
for (const id of ['cascade', 'ravine', 'zyarth']) {
  await page.evaluate((id) => window.__game.gotoSector(id), id);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/p2-6-${id}.png` });
}
console.log(JSON.stringify(errors));
await browser.close();
if (errors.length) process.exit(1);
