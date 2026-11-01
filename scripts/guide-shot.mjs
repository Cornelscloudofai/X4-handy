// Hinweise zu den versteckten Systemen: Sektorenkarte, Späher, Peilung, Tore, Kampfschiffe (Lasso, Kugel, Gegner).
// Spielt nach den Grundlagen („finish“ gesehen, Kapitelführung aus) – dann müssen die Tipps trotzdem kommen.
// node scripts/guide-shot.mjs <outdir>
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
const next = async () => { await page.evaluate(() => (document.querySelector('#coach:not([hidden]) [data-act="coach-next"]'))?.click()); await page.waitForTimeout(300); };
let n = 0;
async function expect(name, part) {
  await page.waitForTimeout(400);
  const t = await bubble();
  await page.screenshot({ path: `${out}/guide-${++n}-${name}.png` });
  if (!t.includes(part)) fail(`${name}: erwartet „${part}“, war „${t.slice(0, 60)}“`);
  await next();
}
// nach den Grundlagen: Kapitelführung aus, alle bisherigen Tipps gesehen, Kapitel „Kanal 9“
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  s.help = { coachOff: true, seen: ['finish', 'dl-src', 'dl-done', 'mine-intro', 'speed', 'tip-two-ships', 'tip-ledger', 'tip-news', 'tip-economy'] };
  s.credits = 1e8; g.ui.paused = true; g.ui.panel = null;
  s.frontier = { signatures: [], discovered: [], scouts: [] };
  g.refresh();
});
// Kapitel „Kanal 9“ suchen (über die Kampagne des Spiels)
const idx = await page.evaluate(() => {
  const g = window.__game, s = g.state;
  for (let i = 0; i < 80; i++) { s.story.index = i; g.refresh(); if (document.querySelector('#objective')?.textContent?.includes('Späher')) return i; }
  return -1;
});
if (idx < 0) fail('Kapitel „Kanal 9“ nicht gefunden');
await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.ui.selection = null; g.refresh(); });
await expect('sektorname', 'Sektorenkarte');
// Sektorenkarte öffnen
await page.click('#hud .hb-sector');
await expect('karte', 'Linien sind Sprungtore');
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = 'rhy'; g.refresh(); });
await page.waitForTimeout(300);
// Reiter „Allgemein“ offen → Hinweis auf „Erkundung“
await page.evaluate(() => document.querySelector('#card .sec-tabs [data-tab="general"]')?.click());
await expect('reiter', 'Unter „Erkundung“');
await page.click('#card .sec-tabs [data-tab="explore"]');
await expect('spaeher', 'Späher sind kleine Schiffe');
await page.click('#card [data-act="scout-buy"]');
await expect('peilen', 'links wischen dreht die Antenne');
// gefundene Signatur → Baustelle → Lieferung → offenes Tor
await page.evaluate(() => { const g = window.__game; g.state.frontier.signatures.push('rhy>f-ausblick'); g.refresh(); });
await expect('tor', 'erloschenes Tor gefunden');
await page.click('#card [data-act="gate-repair"]');
await expect('baustelle', 'direkt aus deinen Stationslagern');
await page.evaluate(() => { const g = window.__game; g.state.frontier.repairs = []; (g.state.frontier.open ??= []).push('rhy>f-ausblick'); g.refresh(); });
await expect('offen', 'Das Tor läuft');
// zurück zum Sektor: Kampfschiff → Lasso-Hinweis, Auswahl → Kugel, Gegner → Rotten-Hinweis
await page.evaluate(() => { const g = window.__game; g.ui.galaxySel = null; g.refresh(); });
await page.click('#hud .hb-sector');
await page.waitForTimeout(400);
await page.evaluate(() => { const g = window.__game, s = g.state; g.actions.buyShip(s, 'mamba', s.stations[0].id); const f = s.ships[s.ships.length - 1]; f.sector = g.ui.sector; g.ui.selection = null; g.refresh(); });
await expect('lasso', 'drücken und halten');
await page.evaluate(() => { const g = window.__game, s = g.state; const f = s.ships[s.ships.length - 1]; const [x, z] = g.cam.toWorld(g.cam.w / 2, g.cam.h * 0.42); f.x = x; f.z = z; f.path = []; g.ui.group = [f.id]; g.refresh(); });
await expect('kugel', 'Die Kugel gehört zu deiner Auswahl');
await page.evaluate(() => { const g = window.__game; g.ui.group = []; g.refresh(); });
// Testangriff aus der Sektorinfo (Reiter „Allgemein“)
await page.evaluate(() => { const g = window.__game; g.ui.selection = { kind: 'sector', id: g.ui.sector }; g.refresh(); });
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('#card .sec-tabs [data-tab="general"]')?.click());
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('#card [data-act="test-attack"]')?.click());
const hostiles = await page.evaluate(() => (window.__game.state.hostiles?.list ?? []).length);
if (hostiles) await expect('gegner', 'Gegner im Sektor');
else fail('Testangriff hat keine Rotte erzeugt');
// Ausgeblendet: keine Tipps mehr
await page.evaluate(() => { const g = window.__game, s = g.state; s.help = { ...s.help, seen: (s.help.seen ?? []).filter((x) => x !== 'tip-lasso'), userOff: true }; g.refresh(); });
await page.waitForTimeout(300);
if (await bubble()) fail('Hinweise trotz „Hilfe ausblenden“');
await browser.close();
console.log(JSON.stringify({ chapter: idx, errors }, null, 1));
if (errors.length) process.exit(1);
