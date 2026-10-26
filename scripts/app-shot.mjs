// App-Installation prüfen: Manifest und Symbole erreichbar, Service Worker übernimmt, Spiel startet danach auch ohne
// Verbindung (Seite, Programmteile, nachgeladene Minispiele aus dem Zwischenspeicher).
// node scripts/app-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
const url = await distUrl();
await page.goto(url);
await page.waitForTimeout(700);
const man = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; const r = await fetch(l.href); return r.ok ? r.json() : null; });
if (!man?.icons?.length || man.display !== 'standalone') fail('Manifest fehlt oder unvollständig');
for (const ic of man?.icons ?? []) if (!(await page.evaluate(async (s) => (await fetch(s)).ok, ic.src))) fail(`Symbol fehlt: ${ic.src}`);
// Mehr → Spielstand zeigt den Abschnitt „App“ (Knopf oder Anleitung für den Browser)
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.panel = { type: 'more', tab: 'save' }; g.refresh(); });
await page.waitForTimeout(400);
if (!(await page.locator('#panel', { hasText: 'Als App install' }).count())) fail('Mehr → Spielstand: Abschnitt „App“ fehlt');
await page.screenshot({ path: `${out}/app-abschnitt.png` });
await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.refresh(); });
// Service Worker übernimmt (nach einem Neuladen steuert er die Seite)
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(4500);
await page.reload();
await page.waitForTimeout(1500);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) fail('Service Worker steuert die Seite nicht');
// Minispiele laden (landen im Zwischenspeicher), dann ohne Netz neu starten
await page.waitForTimeout(4500);
await context.setOffline(true);
await page.reload();
await page.waitForTimeout(2000);
if (!(await page.evaluate(() => !!window.__game?.state))) fail('Ohne Verbindung startet das Spiel nicht');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(300);
await page.click('#modal [data-act="mg-play"][data-kind="ore"]');
await page.waitForTimeout(800);
if (!(await page.locator('#minigame').count())) fail('Ohne Verbindung startet ein Minispiel nicht');
await page.screenshot({ path: `${out}/app-offline.png` });
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
