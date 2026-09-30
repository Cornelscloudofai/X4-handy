// Werft, Schiffsbestellungen, Kampagnen-Erklärung, Zurück-Taste und abgeschnittene Texte prüfen.
// node scripts/yard-shot.mjs <outdir> [breite]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const out = process.argv[2] ?? '.';
const width = Number(process.argv[3] ?? 390);
const file = pathToFileURL(path.resolve('dist/index.html')).href;
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
await page.goto(file);
await page.waitForTimeout(700);
await page.click('text=Loslegen');
await page.evaluate(() => {
  const g = window.__game, A = g.actions, s = g.state;
  s.credits = 60_000_000;
  s.rep.frf = 12;
  const a = s.stations[0];
  a.modules.push({ uid: s.nextId++, def: 'yard_m', t: 0, running: false, stall: '', util: 0 });
  A.buyShip(s, 'boa', a.id);
  a.inventory.hullparts = 400; a.inventory.engineparts = 30; a.inventory.shieldcomponents = 10; a.inventory.fieldcoils = 2;
  g.yard.queueShipBuild(s, a.id, 'boa');
  g.yard.queueShipBuild(s, a.id, 'alligator_min');
  s.shipOrderTimer = 0;
  g.step(30);
  while (s.story.index < 11) s.story.index++;
  g.refresh();
});
await page.waitForTimeout(500);
const shot = async (n) => page.screenshot({ path: `${out}/yard-${width}-${n}.png` });
const act = async (sel) => { await page.click(sel); await page.waitForTimeout(350); };

/** Elemente, deren Text abgeschnitten ist (Ellipse oder Überlauf) */
const clipped = () => page.evaluate(() => {
  const res = [];
  for (const el of document.querySelectorAll('#hud *, #panel *, #modal *, #bottom *')) {
    if (!(el instanceof HTMLElement) || !el.offsetParent || el.children.length > 2) continue;
    const cs = getComputedStyle(el);
    if (!el.textContent?.trim()) continue;
    if ((cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 1) res.push(el.className + ': ' + el.textContent.trim().slice(0, 50));
  }
  for (const t of document.querySelectorAll('.tabs')) if (t.scrollWidth > t.clientWidth + 1) res.push('Reiter passen nicht: ' + t.textContent.trim());
  for (const c of document.querySelectorAll('.card, .modal')) { const r = c.getBoundingClientRect(); for (const btn of c.querySelectorAll('.btn')) { const q = btn.getBoundingClientRect(); if (q.width && q.right > r.right + 1) res.push('Knopf ragt heraus: ' + btn.textContent.trim()); } }
  for (const h of document.querySelectorAll('.card-head h2')) if (h.scrollHeight > h.clientHeight + 1) res.push('Kartentitel abgeschnitten: ' + h.textContent);
  const b = document.querySelector('.chip.sector b');
  if (b && b.scrollHeight > b.clientHeight + 1) res.push('Sektorname abgeschnitten');
  if (document.documentElement.scrollWidth > innerWidth) res.push('Seite breiter als Bildschirm');
  return res;
});
const report = {};
const check = async (n) => { await shot(n); report[n] = await clipped(); };

await check('01-map');
await page.evaluate(() => { const g = window.__game; g.openPanel('station', g.state.stations[0].id, 'overview'); g.refresh(); });
await page.waitForTimeout(300);
await check('02-station');
await act('[data-act="station-tab"][data-tab="modules"]');
await check('03-modules');
await act('[data-act="station-tab"][data-tab="yard"]');
await check('04-yard');
await act('[data-act="station-tab"][data-tab="modules"]');
await act('.card-actions [data-act="modal-modules"]');
await act('[data-act="modules-cat"][data-cat="shipyard"]');
await check('05-modules-yard');
// Zurück-Taste schließt den Dialog
await page.goBack(); await page.waitForTimeout(300);
report.backClosesModal = await page.evaluate(() => !window.__game.ui.modal);
await page.goBack(); await page.waitForTimeout(300);
report.backClosesPanel = await page.evaluate(() => !window.__game.ui.panel);
await act('[data-act="nav"][data-tab="missions"]');
await check('06-missions');
await page.evaluate(() => document.querySelector('.sheet-body')?.scrollBy(0, 700));
await page.waitForTimeout(200);
await check('07-orders');
await act('[data-act="nav"][data-tab="fleet"]');
await check('08-fleet');
// Baupläne: Übersicht über Stationen erreichbar
await act('[data-act="nav"][data-tab="stations"]');
await act('.row[data-act="open-blueprints"]');
await check('10-blueprints');
await act('[data-act="station-tab"][data-tab="locked"]');
await check('11-blueprints-locked');
await page.goBack(); await page.waitForTimeout(300);
// Lieferauftrag: Station → Kurier oder eigener Transporter
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  s.contracts.push({ id: 99901, sector: 'zhin', ware: 'energycells', amount: 4000, delivered: 0, reward: 200000, rep: 1, deadline: s.time + 7200, duration: 7200, status: 'active', title: 'Energie für Zhin' });
  s.stations[0].inventory.energycells = 6000;
  g.ui.modal = { type: 'courier', contract: 99901 };
  g.refresh();
});
await page.waitForTimeout(300);
await check('12-deliver');

await act('[data-act="buyship-modal"]').catch(() => {});
await check('09-buy');
// Vertreter am Handelsposten: nur dort gibt es Baupläne
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.ui.panel = null; g.ui.selection = { kind: 'trade', id: 'zhin' }; g.refresh(); });
await page.waitForTimeout(300);
await check('13-trade-card');
await act('[data-act="open-vendor"]');
await check('14-vendor');
await page.fill('#modal input[data-change="search"]', 'hülle');
await page.waitForTimeout(300);
await check('15-vendor-search');
report.vendorSearch = await page.evaluate(() => document.querySelectorAll('#modal [data-key^="vd-"]').length === 1);
// Werftvertreter an der NPC-Werft
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.ui.selection = { kind: 'npcst', id: 'zhin-werft' }; g.refresh(); });
await page.waitForTimeout(300);
await act('[data-act="open-vendor"]');
await check('16-wharf-vendor');
// Moduldialog: alphabetisch, Suche über alle Kategorien
await page.evaluate(() => { const g = window.__game; g.ui.search.vendor = ''; g.ui.modal = { type: 'modules', station: g.state.stations[0].id, cat: 'production' }; g.refresh(); });
await page.waitForTimeout(300);
report.modulesAlphabetical = await page.evaluate(() => { const t = [...document.querySelectorAll('#modal .module-card .title')].map((x) => x.textContent.trim()); return t.length > 5 && t.every((x, i) => !i || t[i - 1].localeCompare(x, 'de') <= 0); });
await page.fill('#modal input[data-change="search"]', 'lager');
await page.waitForTimeout(300);
await check('17-modules-search');
report.modulesSearch = await page.evaluate(() => document.querySelectorAll('#modal .module-card').length === 9);
// Freier Planer: Baupläne fehlen → testbar, aber keine Übernahme
await page.evaluate(() => {
  const g = window.__game; g.ui.modal = null; g.ui.search.modules = '';
  g.ui.plan = { targets: [{ ware: 'claytronics', modules: 1 }], sunlight: 100, workforce: false, buy: [], extra: {}, auto: true, layout: {} };
  g.ui.planSource = 'draft'; g.openPanel('planner'); g.refresh();
});
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.plan-missing')?.scrollIntoView());
await check('18-planner-missing');
await act('[data-act="plan-build-modal"]');
await check('19-build-blocked');
report.buildBlocked = await page.evaluate(() => !!document.querySelector('#modal .plan-missing') && !document.querySelector('#modal [data-act="plan-build"]'));
console.log(JSON.stringify(report, null, 1));
console.log('errors', errors);
await browser.close();
const problems = Object.entries(report).filter(([, v]) => v === false || (Array.isArray(v) && v.length));
if (errors.length || problems.length) { console.error('Fehlgeschlagen:', problems, errors); process.exit(1); }
