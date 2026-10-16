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
if ((await page.locator('#modal [data-act="mg-play"]').count()) !== 9) fail('Minispiel-Liste unvollständig');
// Reiter: Täglich und Kampf
await page.click('#modal [data-act="mg-tab"][data-tab="daily"]');
await page.waitForTimeout(200);
if ((await page.locator('#modal [data-act="mg-daily"]').count()) !== 9) fail('Reiter „Täglich“: Tagesaufgaben fehlen');
await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
await page.waitForTimeout(200);
// Ausrüstung: Schiff und Waffe wählen, Auswahl erscheint im Menü; danach zurück zur Grundausstattung
await page.click('#modal [data-act="loadout-open"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="loadout-set"][data-value="cobra"]');
await page.click('#modal [data-act="lo-tab"][data-tab="gear"]');
await page.click('#modal [data-act="loadout-set"][data-key="weapon"][data-value="tau"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/mg-0-loadout.png` });
if (!(await page.locator('#modal [data-key="turret"]').count())) fail('Cobra: keine Türme wählbar');
// Zerstörer: schwere L-Türme mit eigenem Rohr wählbar
await page.click('#modal [data-act="lo-tab"][data-tab="ship"]');
await page.click('#modal [data-act="loadout-set"][data-value="klapperschlange"]');
await page.click('#modal [data-act="lo-tab"][data-tab="gear"]');
await page.waitForTimeout(200);
if ((await page.locator('#modal [data-key="lturret"]').count()) !== 4) fail('Klapperschlange: L-Türme nicht wählbar');
await page.click('#modal [data-act="loadout-set"][data-key="lturret"][data-value="boson"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/mg-0-loadout-l.png` });
if ((await page.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-ausruestung') ?? '{}').lturret)) !== 'boson') fail('L-Turm-Wahl nicht gespeichert');
// Mods: Werkstatt öffnen, einen Schadensverstärker bauen – Wert liegt in der Spanne, Modteile werden abgezogen
await page.click('#modal [data-act="lo-tab"][data-tab="mods"]');
await page.waitForTimeout(200);
const parts0 = await page.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-mods') ?? 'null')?.parts ?? 10);
await page.click('#modal [data-act="mod-craft"][data-id="verstaerker"][data-q="1"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/mg-0-mods.png` });
// Spanne grundlegend: regulär 6–12 %, in der Testphase der Mods 12–25 %
const modSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-mods') ?? 'null'));
if (!modSaved?.slots?.weapon || modSaved.parts !== parts0 - 3 || modSaved.slots.weapon.value < 0.06 || modSaved.slots.weapon.value > 0.25) fail(`Mod-Bau fehlerhaft: ${JSON.stringify(modSaved)}`);
if (!(await page.locator('#modal .lo-chip-weapon.set').count())) fail('Eingebauter Mod erscheint nicht im Hangar');
await page.click('#modal [data-act="mod-remove"][data-slot="weapon"]');
await page.click('#modal [data-act="lo-tab"][data-tab="ship"]');
await page.click('#modal [data-act="loadout-set"][data-value="mamba"]');
await page.click('#modal [data-act="lo-tab"][data-tab="gear"]');
await page.click('#modal [data-act="loadout-set"][data-key="weapon"][data-value="puls"]');
await page.click('#modal [data-act="mg-back"]');
await page.waitForTimeout(200);
if (!(await page.locator('#modal [data-act="loadout-open"]').innerText()).includes('Mamba')) fail('Schiffswahl erscheint nicht im Menü (Zurück → Reiter Kampf)');
await page.click('#modal [data-act="mg-tab"][data-tab="games"]');
await page.waitForTimeout(200);

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
// Lasermodus umschalten (Taste B/F) und im Gestein bohren: Spannung steigt
const mb = await mg(() => window.__mg.game.modeBtn);
await page.mouse.click(mb[0], mb[1]);
await page.waitForTimeout(100);
if ((await mg(() => window.__mg.game.mode)) !== 'fine') fail('Lasermodus schaltet nicht um');
const rock = await mg(() => { const g = window.__mg.game; const [x, y] = g.debugTouchAt(-0.95, 0); return [x, y]; });
await page.mouse.move(rock[0], rock[1]);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.screenshot({ path: `${out}/mg-6b-ore-fine.png` });
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/mg-7-ore-result.png` });
await page.click('#minigame [data-mg="quit"]');

// --- Gas ---
await page.click('#modal [data-act="mg-play"][data-kind="gas"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(200);
// linker Stick: Sammler fliegt nach rechts
const gx0 = await mg(() => window.__mg.game.x);
await page.mouse.move(90, 640);
await page.mouse.down();
await page.mouse.move(150, 640, { steps: 4 });
await page.waitForTimeout(600);
await page.mouse.up();
const gx1 = await mg(() => window.__mg.game.x);
if (!(gx1 > gx0 + 20)) fail(`Linker Stick bewegt den Sammler nicht (${gx0} → ${gx1})`);
// rechter Stick: Trichter vergrößern
const fu0 = await mg(() => window.__mg.game.funnel);
await page.mouse.move(width - 90, 640);
await page.mouse.down();
await page.mouse.move(width - 90, 580, { steps: 4 });
await page.waitForTimeout(500);
await page.mouse.up();
const fu1 = await mg(() => window.__mg.game.funnel);
if (!(fu1 > fu0 + 0.1)) fail(`Rechter Stick ändert den Trichter nicht (${fu0} → ${fu1})`);
for (let k = 0; k < 40; k++) {
  await mg(() => window.__mg.game.autopilot());
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${out}/mg-8-gas.png` });
const got = await mg(() => window.__mg.game.tank + window.__mg.game.secured);
if (!(got > 0.3)) fail(`Sammler sammelt nichts (${got})`);
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.click('#minigame [data-mg="quit"]');

// --- Frachtraum ---
await page.click('#modal [data-act="mg-play"][data-kind="cargo"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(900);
const cb = await mg(() => { const g = window.__mg.game; const b = g.current; return b ? g.toPx(b.x, b.y) : null; });
if (!cb) fail('Frachtraum: kein Container an der Luke');
await page.mouse.move(cb[0], cb[1]);
await page.mouse.down();
await page.mouse.move(cb[0] - 30, cb[1] + 80, { steps: 5 });
await page.screenshot({ path: `${out}/mg-8b-cargo-aim.png` });
await page.mouse.up();
await page.waitForTimeout(700);
const pushed = await mg(() => window.__mg.game.boxes.some((b) => b.shots > 0));
if (!pushed) fail('Frachtraum: Stoß wirkt nicht');
for (let k = 0; k < 40; k++) { await mg(() => window.__mg.game.autopilot()); await page.waitForTimeout(60); }
await page.screenshot({ path: `${out}/mg-8c-cargo.png` });
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.click('#minigame [data-mg="quit"]');

// --- Superhighway ---
await page.click('#modal [data-act="mg-play"][data-kind="highway"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(300);
const hx0 = await mg(() => window.__mg.game.me.x);
await page.mouse.move(width - 40, 700);
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(500);
const hv = await mg(() => window.__mg.game.me);
if (!(hv.x > hx0 + 0.1 && hv.vx > 0.2)) fail(`Highway: Seitenschub wirkt nicht (${hx0} → ${hv.x}, v ${hv.vx})`);
for (let k = 0; k < 40; k++) { await mg(() => window.__mg.game.autopilot()); await page.waitForTimeout(60); }
await page.screenshot({ path: `${out}/mg-8d-highway.png` });
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.click('#minigame [data-mg="quit"]');

// --- Orbit-Andocken ---
await page.click('#modal [data-act="mg-play"][data-kind="orbit"]');
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(300);
const oa0 = await mg(() => { const s = window.__mg.game.ship; const r = Math.hypot(s.x, s.y), v2 = s.vx ** 2 + s.vy ** 2; return { e: v2 / 2 - 0.8 / r, f: window.__mg.game.fuel }; });
await page.mouse.move(width - 40, 780);
await page.mouse.down();
await page.waitForTimeout(500);
await page.mouse.up();
await page.waitForTimeout(300);
const oa1 = await mg(() => { const s = window.__mg.game.ship; const r = Math.hypot(s.x, s.y), v2 = s.vx ** 2 + s.vy ** 2; return { e: v2 / 2 - 0.8 / r, f: window.__mg.game.fuel }; });
if (!(oa1.e > oa0.e + 0.005 && oa1.f < oa0.f)) fail(`Orbit: Schub hebt die Bahn nicht (${JSON.stringify(oa0)} → ${JSON.stringify(oa1)})`);
for (let k = 0; k < 40; k++) { await mg(() => window.__mg.game.autopilot()); await page.waitForTimeout(60); }
await page.screenshot({ path: `${out}/mg-8e-orbit.png` });
await page.click('#minigame [data-mg="pause"]');
await page.click('#minigame [data-mg="abort"]');
await page.click('#minigame [data-mg="quit"]');

// --- Kampf ---
for (const kind of ['pirates', 'xenon', 'khaak']) {
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
await page.click('#modal [data-act="mg-tab"][data-tab="daily"]');
await page.waitForTimeout(200);
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
await page.click('#modal [data-act="mg-tab"][data-tab="games"]');
await page.waitForTimeout(200);
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
