// Abschleppen auf der Karte: Großfrachter bleibt nach einem Überfall liegen (roter Ring, Hinweis, Kaufknopf im Infoblatt),
// der Bergungsschlepper Manticore holt ihn ab (Zugseil). node scripts/tow-shot.mjs <outdir>
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
await page.click('.start-card[data-kind="trading"]');
await page.waitForTimeout(1500);
const bubble = () => page.evaluate(() => { const h = document.getElementById('coach'); return h && !h.hidden ? h.querySelector('.coach-bubble p')?.textContent ?? '' : ''; });
// Großfrachter mitten im Bild, Hinweise nach den Grundlagen (nur Tipps), Spiel angehalten
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  s.help = { coachOff: true, seen: ['finish', 'tip-two-ships', 'tip-ledger', 'tip-news', 'tip-economy', 'tip-lasso'] };
  s.credits = 1e8; g.ui.paused = true;
  const base = s.ships.find((x) => x.cls !== 'manticore');
  const [x, z] = g.cam.toWorld(g.cam.w / 2, g.cam.h * 0.45);
  s.ships.push({ ...base, id: 'big1', name: 'Buffalo ZHN-901', cls: 'buffalo', home: s.stations[0].id, sector: g.ui.sector, x, z, path: [], phase: 'idle', job: null, cargo: { ware: 'energycells', amount: 5000 }, orders: [] });
  g.refresh();
});
// Überfall, den niemand abwehrt (Ablauf in tests/tow.test.ts): kampfunfähig wie nach dem Fristende
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  const big = s.ships.find((x) => x.id === 'big1');
  big.disabled = true; big.hp = 0.05; big.status = 'Kampfunfähig – kein Bergungsschlepper vorhanden';
  g.refresh();
});
await page.waitForTimeout(500);
const tip = await bubble();
if (!/liegen geblieben/.test(tip)) fail('Kein Hinweis zum liegengebliebenen Schiff: ' + tip.slice(0, 50));
await page.screenshot({ path: `${out}/tow-1-liegt.png` });
await page.evaluate(() => (document.querySelector('#coach:not([hidden]) [data-act="coach-next"]'))?.click());
// Infoblatt: Kaufknopf für den Schlepper
await page.evaluate(() => { const g = window.__game; g.openPanel('ship', 'big1'); });
await page.waitForTimeout(500);
if (!(await page.locator('#panel [data-act="buyship-modal"][data-cls="manticore"]').count())) fail('Kein Knopf „Bergungsschlepper kaufen“');
await page.screenshot({ path: `${out}/tow-2-infoblatt.png` });
await page.click('#panel [data-act="buyship-modal"][data-cls="manticore"]');
await page.waitForTimeout(600);
if (!(await page.locator('#modal [data-act="buyship"][data-cls="manticore"]').count())) fail('Schauraum zeigt nicht den Manticore');
await page.screenshot({ path: `${out}/tow-3-kaufen.png` });
await page.click('#modal [data-act="buyship"][data-cls="manticore"]');
await page.waitForTimeout(400);
// Schlepper neben den Frachter setzen, Spielzeit vorlaufen lassen bis zum Schleppen
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  g.ui.modal = null; g.ui.panel = null;
  const tug = s.ships.find((x) => x.cls === 'manticore');
  const big = s.ships.find((x) => x.id === 'big1');
  tug.sector = big.sector; tug.x = big.x + 1; tug.z = big.z + 1; tug.path = [];
  g.step(200);
  g.refresh();
});
await page.waitForTimeout(500);
const st = await page.evaluate(() => { const s = window.__game.state; const tug = s.ships.find((x) => x.cls === 'manticore'); return { stage: tug.tow?.stage, big: s.ships.find((x) => x.id === 'big1').status }; });
if (st.stage !== 'tow') fail('Schlepper schleppt nicht: ' + JSON.stringify(st));
await page.evaluate(() => { const g = window.__game; g.ui.selection = { kind: 'ship', id: 'big1' }; g.refresh(); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/tow-4-schleppen.png` });
await browser.close();
console.log(JSON.stringify({ st, errors }, null, 1));
if (errors.length) process.exit(1);
