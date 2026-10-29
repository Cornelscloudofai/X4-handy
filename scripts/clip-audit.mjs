// Abgeschnittene Texte finden: öffnet viele Ansichten (beide Starts, 390 und 360 px) und listet jedes Element,
// dessen Text mit „…“ oder durch Zeilenbegrenzung gekürzt ist. node scripts/clip-audit.mjs [outdir]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const found = new Map();
const scan = (page, where) => page.evaluate((where) => {
  const res = [];
  for (const el of document.querySelectorAll('#app *, #modal *, #panel *')) {
    if (!(el instanceof HTMLElement) || !el.offsetParent) continue;
    const txt = el.textContent?.trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    const ell = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    const clamp = (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' || cs.overflow === 'hidden') && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && cs.display !== 'grid';
    if (ell || clamp) {
      // ausgenommen: Meldungen (lange drücken zeigt alles) und das Schiffsbild (Bild ragt absichtlich heraus)
      if (el.closest('.unclamp, .toast, .ship-hero')) continue;
      const cls = (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : '') || el.tagName.toLowerCase();
      const parent = el.parentElement?.className?.toString().split(' ')[0] ?? '';
      res.push(`${where} | ${parent} > ${cls} | ${ell ? 'ellipsis' : 'clamp'} | ${txt.slice(0, 70)}`);
    }
  }
  return res;
}, where);
for (const [w, kind] of [[390, 'mining'], [360, 'trading']]) {
  const page = await browser.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto(await distUrl());
  await page.click(kind === 'mining' ? 'text=Loslegen mit Bergbau' : 'text=Loslegen mit Handel');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 5e6; g.step(3 * 3600); g.state.frontier ??= { signatures: [], discovered: [] }; g.discover('f-ausblick'); g.discover('f-glut1'); document.getElementById('reveal')?.remove(); g.step(9 * 3600); document.getElementById('reveal')?.remove(); g.refresh(); });
  const views = [
    ['karte', () => {}],
    ['sektorinfo', (g) => { g.ui.selection = { kind: 'sector', id: g.ui.sector }; }],
    ['handelsposten', (g) => { g.ui.selection = { kind: 'trade', id: g.ui.sector }; }],
    ['npc', (g) => { g.ui.selection = { kind: 'npcst', id: 'zhin-werft' }; }],
    ['station', (g) => { g.ui.selection = null; g.openPanel('station', g.state.stations[0].id, 'overview'); }],
    ['station-module', (g) => { g.openPanel('station', g.state.stations[0].id, 'modules'); }],
    ['station-lager', (g) => { g.openPanel('station', g.state.stations[0].id, 'storage'); }],
    ['station-schiffe', (g) => { g.openPanel('station', g.state.stations[0].id, 'ships'); }],
    ['stationen', (g) => { g.openPanel('stations'); }],
    ['flotte', (g) => { g.openPanel('fleet'); }],
    ['schiff', (g) => { g.openPanel('ship', g.state.ships[0].id); }],
    ['schiffkarte', (g) => { g.ui.panel = null; g.ui.selection = { kind: 'ship', id: g.state.ships[0].id }; }],
    ['auftraege', (g) => { g.ui.selection = null; g.openPanel('missions'); }],
    ['handel', (g) => { g.openPanel('market'); }],
    ['ware', (g) => { g.openPanel('ware', 'energycells'); }],
    ['sektor-detail', (g) => { g.openPanel('sector', 'tkr'); }],
    ['mehr', (g) => { g.openPanel('more'); }],
    ['planer', (g) => { g.openPanel('planner'); }],
    ['nachrichten', (g) => { g.ui.panel = null; g.ui.modal = null; document.querySelector('[data-act="open-news"]')?.click(); }],
    ['kontobuch', (g) => { g.ui.panel = null; document.querySelector('[data-act="open-ledger"]')?.click(); }],
    ['dlg-schiffkauf', (g) => { g.ui.panel = null; g.openPanel('fleet'); setTimeout(() => document.querySelector('#panel [data-act="buyship-modal"]')?.click(), 50); }],
    ['dlg-module', (g) => { g.ui.modal = null; g.openPanel('station', g.state.stations[0].id, 'modules'); setTimeout(() => document.querySelector('#panel [data-act="modal-modules"]')?.click(), 50); }],
    ['dlg-vertreter', (g) => { g.ui.modal = null; g.ui.panel = null; g.ui.selection = { kind: 'trade', id: 'zhin' }; setTimeout(() => document.querySelector('[data-act="open-vendor"]')?.click(), 50); }],
    ['dlg-minispiele', (g) => { g.ui.modal = null; g.ui.panel = null; g.ui.selection = null; g.openPanel('more'); setTimeout(() => document.querySelector('[data-act="minigames"]')?.click(), 50); }],
    ['dlg-hilfe', (g) => { g.ui.modal = { type: 'help' }; g.ui.panel = null; }],
    ['dlg-auftrag', (g) => { g.ui.modal = null; g.openPanel('missions'); setTimeout(() => document.querySelector('#panel .tabs button:nth-child(2)')?.click(), 50); }],
    ['sektorenkarte', (g) => { g.ui.panel = null; g.ui.modal = null; g.ui.view = 'galaxy'; g.ui.galaxySel = 'tkr'; }],
  ];
  for (const [name, fn] of views) {
    await page.evaluate(`(${fn.toString()})(window.__game); window.__game.refresh()`);
    await page.waitForTimeout(500);
    for (const r of await scan(page, `${kind}-${w} ${name}`)) found.set(r, true);
    if (out) await page.screenshot({ path: `${out}/clip-${kind}-${name}.png` });
  }
  await page.close();
}
await browser.close();
console.log([...found.keys()].join('\n') || 'nichts gekürzt');
console.log(`\n${found.size} gekürzte Texte`);
if (found.size) process.exit(1);
