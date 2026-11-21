// Zuverlässiges Speichern: zweite Instanz übernimmt, die alte überschreibt den neueren Stand nicht; Speichern kurz
// nach einer Handlung und während eines Minispiels
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? 'shots';
const errors = [];
const fail = (m) => { errors.push(m); console.log('FEHLER', m); };
const browser = await chromium.launch(launchOpts());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const url = await distUrl();
const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-save-v1') ?? 'null'));

const a = await ctx.newPage();
a.on('pageerror', (e) => fail('Seite A: ' + e.message));
await a.goto(url);
await a.click('text=Loslegen mit Bergbau');
await a.waitForTimeout(800);
await a.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; document.getElementById('reveal')?.remove(); g.ui.modal = null; g.refresh(); });
// Handlung: kurz danach gespeichert (nicht erst nach dem Zeitabstand)
await a.evaluate(() => { window.__game.state.credits = 1234567; });
await a.evaluate(() => document.querySelector('[data-act]')?.click());
await a.waitForTimeout(2200);
if ((await saved(a))?.credits !== 1234567) fail('Nach einer Handlung nicht gespeichert');

// zweite Instanz öffnen (z. B. App neu gestartet, während die alte im Hintergrund liegt) und dort weiterspielen
const b = await ctx.newPage();
b.on('pageerror', (e) => fail('Seite B: ' + e.message));
await b.goto(url);
await b.waitForTimeout(1200);
await b.evaluate(() => { const g = window.__game; document.getElementById('reveal')?.remove(); g.ui.modal = null; g.state.credits = 7654321; g.refresh(); });
await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await b.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
if ((await saved(b))?.credits !== 7654321) fail('Neue Instanz speichert nicht');
// die alte Seite zeigt den Hinweis und speichert beim Schließen nicht mehr
await a.waitForTimeout(400);
if (!(await a.locator('#modal [data-act="reload-page"]').count())) fail('Alte Seite zeigt keinen Hinweis');
await a.screenshot({ path: `${out}/save-1-alt.png` });
await a.evaluate(() => { window.__game.state.credits = 1; });
await a.close({ runBeforeUnload: true });
await b.waitForTimeout(300);
if ((await saved(b))?.credits !== 7654321) fail('Alte Seite hat den neueren Stand überschrieben: ' + (await saved(b))?.credits);

// Speichern während eines Minispiels
await b.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); const g = window.__game; g.ui.modal = { type: 'mgGame', kind: 'pipes', level: 1 }; g.refresh(); });
await b.click('#modal [data-act="mg-play"]');
await b.waitForTimeout(300);
await b.evaluate(() => { window.__game.state.credits = 2222222; });
await b.waitForTimeout(11000);
if ((await saved(b))?.credits !== 2222222) fail('Während eines Minispiels nicht gespeichert');
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
process.exit(errors.length ? 1 : 0);
