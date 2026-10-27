// Peil-Minispiel und Entwicklerregler prüfen: Peilen öffnet das Radar, Antenne auf dem Signal füllt die Peilung,
// danach fliegt der Späher mit Vorsprung los. Der Regler „Alles“ zeigt alle Sektoren (nur Ansicht).
// node scripts/peil-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Bergbau');
await page.waitForTimeout(2200);
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 5e6; g.refresh(); });
await page.click('#nav [data-act="nav"][data-tab="map"]');
await page.waitForTimeout(900);
// Entwicklerregler
await page.click('[data-act="dev-reveal"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/peil-0-alles.png` });
const revealed = await page.evaluate(() => !(window.__game.state.frontier?.discovered?.length));
if (!revealed) fail('Regler verändert den Spielstand');
await page.click('[data-act="dev-reveal"]');
await page.waitForTimeout(400);
// Späher kaufen, in Rhy's Defiance peilen
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = 'rhy'; g.refresh(); });
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="scout-buy"]');
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="scout-peil"]');
await page.waitForTimeout(800);
if (!(await page.locator('#peilung .peil-brief').count())) fail('Peilung ohne Einweisung');
await page.screenshot({ path: `${out}/peil-0-einweisung.png` });
await page.click('#peilung [data-peil="start"]');
await page.waitForTimeout(1200);
if (!(await page.locator('#peilung').count())) fail('Peilung öffnet sich nicht');
await page.screenshot({ path: `${out}/peil-1-suche.png` });
// Nur Richtung, Frequenz verstimmt: keine Peilung
for (let i = 0; i < 15; i++) {
  await page.evaluate(() => { const p = window.__peil; p.set(p.target); p.setFreq(p.tf > 0.5 ? p.tf - 0.35 : p.tf + 0.35); });
  await page.waitForTimeout(100);
}
const off = await page.evaluate(() => parseInt(document.querySelector('#peilung .peil-lock span').textContent.match(/(\d+) %/)[1], 10));
if (off > 0) fail('Peilung trotz verstimmter Frequenz: ' + off + ' %');
// Antenne aufs Signal halten, Frequenz abgestimmt
for (let i = 0; i < 90; i++) {
  if (await page.locator('#peilung .peil-end:not([hidden])').count()) break;
  await page.evaluate(() => { const p = window.__peil; p?.set(p.target); p?.setFreq(p.tf); });
  if (i === 25) await page.screenshot({ path: `${out}/peil-2-gehalten.png` });
  await page.waitForTimeout(100);
}
await page.locator('#peilung .peil-end:not([hidden])').waitFor({ timeout: 8000 }).catch(() => fail('Peilung endet nicht'));
await page.screenshot({ path: `${out}/peil-3-ergebnis.png` });
await page.click('#peilung [data-peil="go"]');
await page.waitForTimeout(400);
const task = await page.evaluate(() => window.__game.state.frontier.scouts[0].task);
if (!task || (task.bonus ?? 0) < 0.9) fail('Späher ohne Peil-Vorsprung unterwegs: ' + JSON.stringify(task));
// Gebietsstörungen: Echos im Schweigenden Band, Brechung in der Kristallgrenze, Puls im Abgrund
await page.evaluate(() => { const g = window.__game; g.state.frontier.discovered = ['f-ausblick', 'f-glut1', 'f-asche', 'f-rhak', 'f-bandtor', 'f-polar', 'f-veshara', 'f-echo', 'f-glas', 'f-summen', 'f-ende', 'f-horizont']; g.state.frontier.scouts[0].task = undefined; g.state.credits = 5e6; });
const shots = { 'f-glut1': 'glut', 'f-polar': 'band', 'f-glas': 'kristall', 'f-horizont': 'abgrund' };
for (const [sec, mode] of Object.entries(shots)) {
  await page.evaluate((id) => { const g = window.__game; g.ui.galaxySel = id; g.refresh(); }, sec);
  await page.waitForTimeout(300);
  await page.click('.gx-card [data-act="scout-peil"]');
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => window.__peil?.mode);
  if (m !== mode) fail(`${sec}: Störung ${m} statt ${mode}`);
  await page.click('#peilung [data-peil="start"]');
  await page.waitForTimeout(mode === 'glut' ? 8600 : 1800);
  await page.evaluate(() => { const p = window.__peil; p.set(p.target + 0.3); p.setFreq(p.tf + 0.06); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/peil-4-${mode}.png` });
  if (mode === 'band' && (await page.evaluate(() => window.__peil.ghosts.length)) < 2) fail('Band ohne Echos');
  await page.click('#peilung .peil-x');
  await page.waitForTimeout(300);
}
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
