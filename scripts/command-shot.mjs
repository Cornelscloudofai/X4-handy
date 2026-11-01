// Befehlsebene prüfen: Halten füllt den Ring, Lasso fängt zwei Kampfschiffe, Kugel öffnet die Befehle (untereinander,
// mit Strahlen), Patrouille mit aufgezogenem Radius, Flieg zu per Antippen; Infozeile statt großer Karte, Infoblatt ohne
// Befehle.
// node scripts/command-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Handel');
await page.waitForTimeout(1500);
// zwei Kampfschiffe nebeneinander mitten im Bild, Spiel angehalten
const ids = await page.evaluate(() => {
  const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 1e8; g.ui.paused = true;
  const st = g.state.stations[0];
  g.actions.buyShip(g.state, 'mamba', st.id); g.actions.buyShip(g.state, 'dragon', st.id);
  const fs = g.state.ships.slice(-2);
  const [cx, cz] = g.cam.toWorld(g.cam.w / 2, g.cam.h * 0.42);
  fs.forEach((f, i) => { f.x = cx + (i ? 5 : -5); f.z = cz; f.path = []; f.combat = { kind: 'move', sector: f.sector, x: f.x, z: f.z }; });
  g.refresh();
  return fs.map((f) => f.id);
});
const pos = await page.evaluate((ids) => ids.map((id) => { const g = window.__game; const s = g.state.ships.find((x) => x.id === id); return g.cam.toScreen(s.x, s.z); }), ids);
const cx = (pos[0][0] + pos[1][0]) / 2, cy = (pos[0][1] + pos[1][1]) / 2;
// Halten: nach etwa ⅓ s erscheint der Ring
await page.mouse.move(cx + 70, cy);
await page.mouse.down();
// Zeitgeber laufen unter Last im Testbrowser ungleichmäßig: auf den Zustand warten statt auf eine feste Zeit
const seen = (kind) => page.waitForFunction((k) => window.__game.ui.gesture?.kind === k, kind, { polling: 15, timeout: 3000 }).then(() => true, () => false);
if (!(await seen('hold'))) fail('Halten zeigt keinen Ring');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/cmd-1-halten.png` });
if (!(await seen('lasso'))) fail('Lasso startet nicht');
for (let a = 0; a <= Math.PI * 1.9; a += 0.25) await page.mouse.move(cx + Math.cos(a) * 70, cy + Math.sin(a) * 55);
await page.screenshot({ path: `${out}/cmd-2-lasso.png` });
await page.mouse.up();
await page.waitForTimeout(400);
const group = await page.evaluate(() => window.__game.ui.group);
if (group.length !== 2 || !ids.every((id) => group.includes(id))) fail('Lasso hat nicht beide Kampfschiffe gefangen: ' + JSON.stringify(group));
if (!(await page.locator('#cmd .grp-chip').count())) fail('Gruppenabzeichen fehlt');
if (!(await page.locator('#cmd .orb').count())) fail('Befehlskugel fehlt');
await page.click('#cmd .orb', { force: true });
await page.waitForTimeout(500);
if ((await page.locator('#cmd .orb-item').count()) !== 5) fail('Kugel zeigt nicht fünf Befehle');
if ((await page.locator('#cmd .orb-ray').count()) !== 5) fail('Strahlen fehlen');
await page.screenshot({ path: `${out}/cmd-3-kugel.png` });
// Patrouille: Mitte drücken und Radius aufziehen
await page.click('#cmd .orb-item:has-text("Patrouille")', { force: true });
await page.waitForTimeout(300);
if (!(await page.locator('#cmd .cmd-hint').count())) fail('Kein Hinweis beim Zielwählen');
await page.mouse.move(200, 520);
await page.mouse.down();
await page.mouse.move(240, 520, { steps: 4 });
await page.mouse.move(290, 540, { steps: 4 });
await page.screenshot({ path: `${out}/cmd-4-radius.png` });
await page.mouse.up();
await page.waitForTimeout(300);
const orders = await page.evaluate((ids) => ids.map((id) => window.__game.state.ships.find((x) => x.id === id).combat), ids);
if (!orders.every((o) => o?.kind === 'patrol' && o.r > 15)) fail('Patrouille nicht gesetzt: ' + JSON.stringify(orders));
// Flieg zu per Antippen
await page.click('#cmd .orb', { force: true });
await page.waitForTimeout(300);
await page.click('#cmd .orb-item:has-text("Flieg zu")', { force: true });
await page.mouse.click(cx - 60, cy + 40);
await page.waitForTimeout(300);
const moves = await page.evaluate((ids) => ids.map((id) => window.__game.state.ships.find((x) => x.id === id).combat?.kind), ids);
if (!moves.every((k) => k === 'move')) fail('Flieg zu nicht gesetzt: ' + JSON.stringify(moves));
// Einzelnes Kampfschiff antippen: Infozeile statt Karte, Infoblatt ohne Befehle
await page.evaluate(() => { const g = window.__game; g.ui.group = []; g.refresh(); });
const p0 = await page.evaluate((id) => { const g = window.__game; const s = g.state.ships.find((x) => x.id === id); return g.cam.toScreen(s.x, s.z); }, ids[0]);
await page.mouse.click(p0[0], p0[1]);
await page.waitForTimeout(400);
if (!(await page.locator('#card .infoline').count())) fail('Keine Infozeile');
if ((await page.evaluate(() => window.__game.ui.group.length)) !== 1) fail('Antippen macht das Kampfschiff nicht zur Gruppe');
await page.screenshot({ path: `${out}/cmd-5-infozeile.png` });
await page.click('#card .infoline [data-act="open-ship"]');
await page.waitForTimeout(500);
if (await page.locator('#panel [data-act="combat-mode"]').count()) fail('Infoblatt enthält noch Befehle');
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
