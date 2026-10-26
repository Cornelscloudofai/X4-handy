// Sicherungen im Browser prüfen: automatische Sicherung beim Speichern, Liste unter Mehr → Spielstand,
// verlorener Spielstand wird beim nächsten Start angeboten und lässt sich wiederherstellen (samt Minispiel-Fortschritt),
// „Spielstand sichern“ liefert eine vollständige Sicherung, die sich wieder laden lässt.
// node scripts/backup-shot.mjs <outdir>
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
await page.waitForTimeout(700);
await page.click('text=Loslegen');
// Spielstand mit erkennbaren Werten, dazu Minispiel-Fortschritt (Modteile)
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.state.credits = 1234567; g.refresh(); localStorage.setItem('x4-sektorbau-mods', JSON.stringify({ parts: 42, owned: [] })); });
// Speichern auslösen (passiert sonst alle 15 s): über „Spielstand sichern“
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.ui.panel = { type: 'more', tab: 'save' }; g.refresh(); });
await page.waitForTimeout(300);
await page.click('[data-act="export"]');
await page.waitForTimeout(600);
const exported = await page.$eval('#exportText', (t) => t.value);
let env = null;
try { env = JSON.parse(exported); } catch { /* leer */ }
if (env?.format !== 'x4-sektorbau-sicherung') fail('„Spielstand sichern“ liefert keine vollständige Sicherung');
if (!env?.keys?.['x4-sektorbau-save-v1'] || !env?.keys?.['x4-sektorbau-mods']) fail('Sicherung ohne Spielstand oder Modteile');
await page.click('[data-act="modal-close"]');
// automatische Sicherung liegt in der Liste
await page.click('[data-act="backups"]');
await page.waitForTimeout(800);
const rows = await page.locator('#modal [data-act="backup-pick"]').count();
if (rows < 1) fail(`Keine automatische Sicherung in der Liste (${rows})`);
await page.screenshot({ path: `${out}/backup-1-liste.png` });
await page.click('[data-act="backup-now"]');
await page.waitForTimeout(800);
if ((await page.locator('#modal [data-act="backup-pick"]').count()) < 2) fail('„Jetzt sichern“ legt keine weitere Sicherung an');
// Spielstand geht verloren: beim nächsten Start wird die Sicherung angeboten
// (vor dem Start des Spiels löschen – beim Verlassen der Seite speichert es sonst noch einmal)
await page.addInitScript(() => { if (!sessionStorage.getItem('geloescht')) { sessionStorage.setItem('geloescht', '1'); for (const k of Object.keys(localStorage)) if (k.startsWith('x4-sektorbau')) localStorage.removeItem(k); } });
await page.reload();
await page.waitForTimeout(1200);
const offer = page.locator('#modal [data-act="backup-restore"]');
if (!(await offer.count())) fail('Willkommensdialog bietet die Sicherung nicht an');
await page.screenshot({ path: `${out}/backup-2-angebot.png` });
if (await offer.count()) {
  await offer.first().click();
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => ({ cr: window.__game?.state.credits, mods: JSON.parse(localStorage.getItem('x4-sektorbau-mods') ?? '{}').parts }));
  if (Math.round(back.cr) !== 1234567) fail(`Wiederhergestellt: falsche Credits (${back.cr})`);
  if (back.mods !== 42) fail(`Wiederhergestellt: Modteile fehlen (${back.mods})`);
}
// vollständige Sicherung über „Spielstand laden“ einspielen
await page.evaluate(() => { const g = window.__game; g.state.credits = 5; g.ui.modal = { type: 'import' }; g.refresh(); });
await page.waitForTimeout(300);
await page.fill('#importText', exported);
await page.click('[data-act="import-do"]');
await page.waitForTimeout(1500);
const cr = await page.evaluate(() => window.__game?.state.credits);
if (Math.round(cr) !== 1234567) fail(`Laden einer vollständigen Sicherung: falsche Credits (${cr})`);
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
