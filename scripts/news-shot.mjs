// Handy-Test: Kontobuch (Tipp auf die Credits) und Nachrichtenblatt mit Sprung zur Meldung
// node scripts/news-shot.mjs <outdir>
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
await page.evaluate(() => {
  const g = window.__game, s = g.state;
  if (s.help) s.help.coachOff = true;
  g.step(2 * 3600);
  g.ui.paused = true;
  g.refresh();
});
await page.waitForTimeout(400);
// Kontobuch
await page.click('#hud [data-act="open-ledger"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/news-1-ledger.png` });
const ledger = await page.evaluate(() => ({ rows: document.querySelectorAll('#panel .sheet-body .row').length, sum: (window.__game.state.ledger ?? []).length }));
// Nachrichten (Panel schließen, dann der Knopf in der Werkzeugleiste)
await page.click('#panel [data-act="close-panel"]');
await page.waitForTimeout(300);
await page.click('#hud [data-act="open-news"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/news-2-list.png` });
const news = await page.evaluate(() => ({ rows: document.querySelectorAll('#panel .news-row').length, links: document.querySelectorAll('#panel [data-act="news-go"]').length }));
// Erste Meldung mit Verweis anspringen
await page.click('#panel [data-act="news-go"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/news-3-jump.png` });
const jumped = await page.evaluate(() => { const g = window.__game; return !!(g.ui.panel || g.ui.modal || g.ui.selection); });
const report = { ledger, news, jumped, errors };
console.log(JSON.stringify(report, null, 1));
await browser.close();
if (!ledger.rows || !news.rows || !news.links || !jumped || errors.length) { console.error('Fehlgeschlagen'); process.exit(1); }
