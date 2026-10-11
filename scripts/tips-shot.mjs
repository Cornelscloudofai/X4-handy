// Handy-Test der einmaligen Tipps (Orders, Konto, Nachrichten, zwei Tuatara, Schürfrechte): node scripts/tips-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(600);
await page.click('.start-card[data-kind="trading"]');
const bubble = () => page.evaluate(() => { const h = document.getElementById('coach'); return h && !h.hidden ? h.querySelector('.coach-bubble p')?.textContent ?? '' : ''; });
const next = async () => { await page.evaluate(() => (document.querySelector('#coach:not([hidden]) [data-act="coach-next"]'))?.click()); await page.waitForTimeout(250); };
const seen = {};
// Lieferauftrags-Einführung als erledigt markieren, Kapitel 1 abgeschlossen
await page.evaluate(() => { const g = window.__game, s = g.state; s.help = { seen: ['dl-src', 'dl-done', 'mine-intro', 'speed'] }; s.story.index = 1; g.ui.paused = true; g.ui.panel = null; g.refresh(); });
await page.waitForTimeout(400);
seen.twoShips = await bubble();
await page.screenshot({ path: `${out}/tip-1-two-ships.png` });
await next();
// Kauforder
await page.evaluate(() => { const g = window.__game; g.openPanel('station', g.state.stations[0].id, 'storage'); });
await page.waitForTimeout(300);
await page.click('#panel [data-act="buy-open"][data-ware=""]');
await page.waitForTimeout(400);
seen.buyOrder = await bubble();
await page.screenshot({ path: `${out}/tip-2-buy-order.png` });
await next();
await page.click('#modal [data-act="modal-close"]').catch(() => {});
await page.waitForTimeout(200);
// Schürfrechte im fremden Sektor
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.openPanel('sector', 'tkr'); });
await page.waitForTimeout(400);
seen.rights = await bubble();
await page.screenshot({ path: `${out}/tip-3-rights.png` });
await next();
// Konto (nach ein paar Buchungen) und Nachrichten
await page.evaluate(() => { const g = window.__game, s = g.state; g.ui.panel = null; g.ui.paused = false; g.step(2 * 3600); g.ui.paused = true; s.newsSeen = -1; s.story.index = 12; g.refresh(); });
await page.waitForTimeout(400);
seen.ledger = await bubble();
await page.screenshot({ path: `${out}/tip-4-ledger.png` });
await next();
seen.news = await bubble();
await page.screenshot({ path: `${out}/tip-5-news.png` });
const report = { seen, errors };
console.log(JSON.stringify(report, null, 1));
await browser.close();
const ok = seen.twoShips.includes('Zwei Tuatara') && seen.buyOrder.includes('Kauforder') && seen.rights.includes('Schürfrecht') && seen.ledger.includes('Kontobuch') && seen.news.includes('Nachrichtenblatt') && !errors.length;
if (!ok) { console.error('Fehlgeschlagen'); process.exit(1); }
