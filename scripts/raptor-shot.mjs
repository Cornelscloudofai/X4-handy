// Träger Raptor im Kampf-Minispiel: Hangar (Turmgruppen je Cluster wählen), dann ein Gefecht – Bild im richtigen
// Seitenverhältnis, Türme mit eigener Art feuern, Treffer am langen Rumpf. node scripts/raptor-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(600);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(300);
await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="loadout-open"]');
await page.waitForTimeout(400);
// Schiff Raptor wählen
await page.click('#modal .hgr-name');
await page.waitForTimeout(300);
if (!(await page.locator('#modal [data-act="loadout-set"][data-key="ship"][data-value="raptor"]').count())) fail('Raptor fehlt in der Schiffsauswahl');
await page.click('#modal [data-act="loadout-set"][data-key="ship"][data-value="raptor"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/raptor-1-schiff.png` });
await page.click('#modal .lo-back');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/raptor-2-hangar.png` });
// Turmgruppen: Bug-Cluster Bosonen, L vorn Tau, L hinten links Neutronen
await page.click('#modal .hgr-hot[data-view="turret"]');
await page.waitForTimeout(300);
const groups = await page.locator('#modal .hgr-grp').count();
if (groups !== 11) fail(`Turmgruppen: ${groups} statt 11`);
await page.click('#modal [data-act="loadout-group"][data-g="0"][data-value="boson"]');
await page.waitForTimeout(150);
await page.click('#modal [data-act="loadout-group"][data-g="8"][data-value="tau"]');
await page.waitForTimeout(150);
await page.click('#modal [data-act="loadout-group"][data-g="9"][data-value="neutron"]');
await page.waitForTimeout(250);
const lo = await page.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-ausruestung') ?? '{}'));
if (lo.ship !== 'raptor' || lo.groups?.[0] !== 'boson' || lo.groups?.[8] !== 'tau' || lo.groups?.[9] !== 'neutron' || lo.groups?.[10] !== 'plasma') fail('Turmgruppen nicht gemerkt: ' + JSON.stringify(lo.groups));
await page.screenshot({ path: `${out}/raptor-3-tuerme.png` });
await page.click('#modal .lo-back');
await page.waitForTimeout(200);
await page.click('#modal [data-act="mg-back"]');
await page.waitForTimeout(200);
if (!(await page.locator('#modal [data-act="loadout-open"]').innerText()).includes('Raptor')) fail('Raptor erscheint nicht im Menü');
// Gefecht gegen Piraten
await page.click('#modal [data-act="mg-tab"][data-tab="games"]');
await page.waitForTimeout(200);
await page.click('#modal [data-act="mg-play"][data-kind="pirates"]');
await page.waitForTimeout(400);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const g = window.__mg.game; return { ship: g.ship.name, turrets: g.pTur.length, L: g.pTur.filter((t) => t.L).length, types: [...new Set(g.pTur.map((t) => t.type))], zoom: g.zoom }; });
if (info.ship !== 'Raptor' || info.turrets !== 122 || info.L !== 8) fail('Gefecht: ' + JSON.stringify(info));
// weit herauszoomen, Gegner nah an den Bug holen
await page.evaluate(() => { const g = window.__mg.game; g.zoomGoal = 0.27; g.zoom = 0.27; });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/raptor-4-kampf.png` });
const shots = await page.evaluate(() => window.__mg.game.bullets.filter((b) => b.from === 'p').length + window.__mg.game.tBeams.length);
// Treffer am Bug (weit weg von der Mitte) zählen
const hit = await page.evaluate(() => { const g = window.__mg.game; const a = g.aimA; const bx = g.px + Math.cos(a) * g.ship.size * 0.45, by = g.py + Math.sin(a) * g.ship.size * 0.45; return { bow: g.onHull(bx, by, 0), off: g.onHull(g.px + Math.cos(a + Math.PI / 2) * g.ship.size * 0.4, g.py + Math.sin(a + Math.PI / 2) * g.ship.size * 0.4, 0) }; });
if (!hit.bow || hit.off) fail('Rumpftreffer falsch: ' + JSON.stringify(hit));
await page.evaluate(() => { const g = window.__mg.game; g.zoomGoal = 0.72; g.zoom = 0.72; });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/raptor-5-nah.png` });
// Kameraschieber: ganz nah, Griff nach oben ziehen → Kamera wandert zum Bug, zweimal tippen → zurück zur Mitte
await page.evaluate(() => { const g = window.__mg.game; g.zoomGoal = 1.2; g.zoom = 1.2; });
await page.waitForTimeout(800);
const track = await page.evaluate(() => window.__mg.game.panTrack);
const cam0 = await page.evaluate(() => { const g = window.__mg.game; return [g.camX, g.camY]; });
await page.mouse.move(track.x, (track.y0 + track.y1) / 2);
await page.mouse.down();
await page.mouse.move(track.x, track.y0 + 4, { steps: 6 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/raptor-6-bug-nah.png` });
await page.mouse.up();
const pan = await page.evaluate(() => { const g = window.__mg.game; const a = g.aimA; const cx = g.camX + g.w / 2 / g.zoom, cy = g.camY + g.h / 2 / g.zoom; return { pan: g.camPan, along: (cx - g.px) * Math.cos(a) + (cy - g.py) * Math.sin(a) }; });
if (!(pan.pan < -0.9 && pan.along > 400)) fail('Kameraschieber bewegt die Kamera nicht zum Bug: ' + JSON.stringify(pan));
await page.mouse.click(track.x, (track.y0 + track.y1) / 2);
await page.mouse.click(track.x, (track.y0 + track.y1) / 2);
await page.waitForTimeout(200);
if ((await page.evaluate(() => window.__mg.game.camPan)) !== 0) fail('Doppeltippen setzt die Kamera nicht zurück');
void cam0;
// Treffer am Rumpf: mit Schild blaue Welle (Ring), ohne Schild rote Funken
const fxHit = await page.evaluate(() => {
  const g = window.__mg.game, a = g.aimA;
  const x = g.px + Math.cos(a) * 300 + Math.cos(a + Math.PI / 2) * 40, y = g.py + Math.sin(a) * 300 + Math.sin(a + Math.PI / 2) * 40;
  const list = () => (g.fx.list ?? g.fx.items ?? g.fx.parts ?? []);
  const n0 = list().length, s0 = g.shield;
  g.damagePlayer(5, 1, [x, y]);
  const blue = list().slice(n0).some((p) => p.kind === 'ring' && /7fd8ff/i.test(p.color));
  g.shield = 0;
  const n1 = list().length;
  g.damagePlayer(5, 1, [x, y]);
  const red = list().slice(n1).some((p) => /ff5a3a/i.test(p.color));
  g.shield = s0;
  return { blue, red, n: list().length };
});
if (!fxHit.blue || !fxHit.red) fail('Treffereffekte fehlen: ' + JSON.stringify(fxHit));
// Großschiff: mehr Gegner, mehr Angreifer zugleich
const foes = await page.evaluate(() => { const g = window.__mg.game; return { big: g.big, foeCount: g.foeCount, attackCap: g.attackCap, cap: g.fieldCap, speed: g.ship.speed, turn: g.ship.turn }; });
if (!(foes.big > 1 && foes.foeCount > 3.6 && foes.attackCap > 6 && foes.cap > 56)) fail('Großschiff: nicht mehr Gegner: ' + JSON.stringify(foes));
await page.evaluate(() => { const g = window.__mg.game; g.zoomGoal = 0.36; g.zoom = 0.36; });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/raptor-7-gefecht.png` });
await browser.close();
console.log(JSON.stringify({ info, shots, hit, pan, fxHit, foes, errors }, null, 1));
if (errors.length) process.exit(1);
