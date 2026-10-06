// Minispiele prüfen: Vorschau-Menü, Einführung, Spielen mit Touch/Maus, Pause per Zurück-Taste, Auswertung.
// node scripts/minigame-shot.mjs <outdir> [breite]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const width = Number(process.argv[3] ?? 390);
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (msg) => errors.push(msg);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(700);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/mg-0-menu.png` });
if ((await page.locator('#modal [data-act="mg-play"]').count()) !== 5) fail('Minispiel-Liste unvollständig');
// Ausrüstung: Schiff und Waffe wählen, Auswahl erscheint im Menü; danach zurück zur Grundausstattung
await page.click('#modal [data-act="loadout-open"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="loadout-set"][data-value="cobra"]');
await page.click('#modal [data-act="loadout-set"][data-key="weapon"][data-value="plasma"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/mg-0-loadout.png` });
if (!(await page.locator('#modal [data-key="turret"]').count())) fail('Cobra: keine Türme wählbar');
await page.click('#modal [data-act="loadout-set"][data-value="mamba"]');
// Mamba mit einem Raketenwerfer (für den Test der Raketentaste)
await page.click('#modal [data-act="loadout-set"][data-key="launchers"][data-value="1"]');
await page.click('#modal [data-act="loadout-set"][data-key="weapon"][data-value="impuls"]');
await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(200);
if (!(await page.locator('#modal [data-act="loadout-open"]').innerText()).includes('Mamba')) fail('Schiffswahl erscheint nicht im Menü');

const phase = () => page.evaluate(() => window.__mg?.phase ?? null);
const mg = (fn, arg) => page.evaluate(fn, arg);

// --- Rohr-Puzzle ---
await page.click('#modal [data-act="mg-play"][data-kind="pipes"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/mg-1-pipes-intro.png` });
if ((await phase()) !== 'intro') fail('Einführung fehlt');
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/mg-2-pipes.png` });
// ein falsches Feld antippen: Züge zählen hoch
const [cx, cy] = await mg(() => { const g = window.__mg.game; return g.cellCenter(g.debugWrongCell()); });
await page.mouse.click(cx, cy);
await page.waitForTimeout(250);
const moves = await mg(() => window.__mg.game.moves);
if (moves !== 1) fail(`Antippen dreht nicht (Züge ${moves})`);
// Zurück-Taste pausiert
await page.evaluate(() => history.back());
await page.waitForTimeout(300);
if ((await phase()) !== 'pause') fail('Zurück-Taste pausiert nicht');
await page.screenshot({ path: `${out}/mg-3-pause.png` });
await page.click('#minigame [data-mg="resume"]');
// fast lösen, den Rest antippen
await mg(() => window.__mg.game.debugSolve(1));
for (let k = 0; k < 8 && (await phase()) === 'play'; k++) {
  const i = await mg(() => window.__mg.game.debugWrongCell());
  if (i < 0) break;
  const [x, y] = await mg((i) => window.__mg.game.cellCenter(i), i);
  await page.mouse.click(x, y);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/mg-4-pipes-solved.png` });
await page.waitForTimeout(1500);
if ((await phase()) !== 'end') fail('Rätsel gelöst, aber keine Auswertung');
await page.screenshot({ path: `${out}/mg-5-pipes-result.png` });
await page.click('#minigame [data-mg="quit"]');
await page.waitForTimeout(300);
if (await page.locator('#minigame').count()) fail('Minispiel schließt nicht');
if (!(await page.locator('#modal .mg-best').count())) fail('Bestwert wird nicht angezeigt');

// --- Erz ---
await page.evaluate(() => { const g = window.__game; g.ui.modal.level = 2; g.refresh(); });
await page.click('#modal [data-act="mg-play"][data-kind="ore"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(200);
const vt = await mg(() => window.__mg.game.debugVeinTouch());
await page.mouse.move(vt[0], vt[1]);
await page.mouse.down();
for (let k = 0; k < 20; k++) {
  const p = await mg(() => window.__mg.game.debugVeinTouch());
  if (p) await page.mouse.move(p[0], p[1], { steps: 2 });
  await page.waitForTimeout(60);
}
await page.screenshot({ path: `${out}/mg-6-ore.png` });
await page.mouse.up();
const mined = await mg(() => window.__mg.game.mined);
if (!(mined > 0.5)) fail(`Laser baut nichts ab (${mined})`);
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/mg-7-ore-result.png` });
await page.click('#minigame [data-mg="quit"]');

// --- Gas ---
await page.click('#modal [data-act="mg-play"][data-kind="gas"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.mouse.move(width / 2, 600);
await page.mouse.down();
for (let k = 0; k < 25; k++) {
  const b = await mg(() => window.__mg.game.debugBestBlob());
  if (b) await page.mouse.move(b[0], b[1], { steps: 3 });
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${out}/mg-8-gas.png` });
await page.mouse.up();
const got = await mg(() => window.__mg.game.tank + window.__mg.game.secured);
if (!(got > 0.3)) fail(`Sammler sammelt nichts (${got})`);
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.click('#minigame [data-mg="quit"]');

// --- Kampf ---
for (const kind of ['pirates', 'xenon']) {
  await page.click(`#modal [data-act="mg-play"][data-kind="${kind}"]`);
  await page.waitForTimeout(300);
  await page.click('#minigame [data-mg="start"]');
  // Joystick: Finger links unten halten und ziehen
  await page.mouse.move(100, 700);
  await page.mouse.down();
  await page.mouse.move(60, 640, { steps: 5 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/mg-9-${kind}.png` });
  await page.mouse.up();
  // Feuertaste halten: Bordkanonen feuern geradeaus
  await page.mouse.move(width - 66, 844 - 80);
  await page.mouse.down();
  await page.waitForTimeout(400);
  const shots = await mg(() => window.__mg.game.bullets.filter((b) => b.from === 'p').length);
  await page.mouse.up();
  if (!(shots > 0)) fail(`${kind}: Feuertaste feuert nicht`);
  // Raketentaste
  await page.mouse.click(width - 160, 844 - 54);
  await page.waitForTimeout(500);
  if (!(await mg(() => window.__mg.game.missilesUsed))) fail(`${kind}: Raketentaste reagiert nicht`);
  await page.screenshot({ path: `${out}/mg-9-${kind}-missiles.png` });
  const st = await mg(() => window.__mg.game.state);
  if (st.wave < 0) fail(`${kind}: keine Gegner`);
  // Welle besiegt: Verbesserungskarten erscheinen, Antippen wählt eine
  await mg(() => { const g = window.__mg.game; g.enemies = []; g.reinforce = []; });
  await page.waitForTimeout(400);
  if (!(await mg(() => window.__mg.game.state.choosing))) fail(`${kind}: keine Verbesserungskarten`);
  await page.screenshot({ path: `${out}/mg-10-${kind}-cards.png` });
  const rect = await mg(() => window.__mg.game.cardRects()[1]);
  await page.mouse.click(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
  await page.waitForTimeout(300);
  if (await mg(() => window.__mg.game.state.choosing)) fail(`${kind}: Karte lässt sich nicht wählen`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/mg-11-${kind}-wave2.png` });
  await page.click('#minigame [data-mg="pause"]');
  await page.click('#minigame [data-mg="abort"]');
  await page.click('#minigame [data-mg="quit"]');
}
// Tagesaufgabe und Endlos-Modus: Einführung mit Besonderheit und Nebenzielen
await page.click('#modal [data-act="mg-daily"][data-kind="ore"]');
await page.waitForTimeout(300);
if (!(await page.locator('#minigame .mg-mut-box').count())) fail('Tagesaufgabe ohne Besonderheit');
if ((await page.locator('#minigame .mg-goals div').count()) !== 3) fail('Nebenziele fehlen');
await page.screenshot({ path: `${out}/mg-12-daily-intro.png` });
await page.click('#minigame [data-mg="quit"]');
await page.click('#modal [data-act="mg-mode"][data-kind="pirates"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/mg-13-endless.png` });
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/mg-14-endless-result.png` });
await page.click('#minigame [data-mg="quit"]');
await page.click('#modal [data-act="mg-level"][data-level="5"]');
await page.waitForTimeout(200);
if (!(await page.locator('#modal .mg-lock').count())) fail('Stufe 5 nicht gesperrt');
await page.screenshot({ path: `${out}/mg-15-menu-locked.png`, fullPage: false });
await page.click('#modal [data-act="mg-level"][data-level="1"]');
// Hauptspiel läuft danach weiter
const t0 = await page.evaluate(() => window.__game.state.time);
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.refresh(); });
await page.waitForTimeout(600);
const t1 = await page.evaluate(() => window.__game.state.time);
if (!(t1 > t0)) fail('Hauptspiel läuft nach dem Minispiel nicht weiter');

console.log(JSON.stringify({ errors }, null, 1));
await browser.close();
if (errors.length) process.exit(1);
