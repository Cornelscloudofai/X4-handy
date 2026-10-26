// Feedback prüfen: aus Mehr öffnen, Art wählen, Text schreiben, mit Bildschirmfoto und Spielstand senden (die
// Anfrage an Netlify Forms wird abgefangen und geprüft); im Pausenmenü eines Minispiels gibt es den Knopf ebenfalls.
// node scripts/feedback-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(String(e)));
const posts = [];
let reject = 404;
await page.route('**/*', async (route) => {
  const r = route.request();
  // erster Versuch: Formular noch nicht eingerichtet (404) – klare Meldung, Text bleibt; danach angenommen
  if (r.method() === 'POST' && reject) { const st = reject; reject = 0; await route.fulfill({ status: st, body: 'not found' }); return; }
  if (r.method() === 'POST') { posts.push(r.postDataBuffer()?.toString('latin1') ?? ''); await route.fulfill({ status: 200, body: 'ok' }); return; }
  await route.continue();
});
await page.goto(await distUrl());
await page.waitForTimeout(700);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.panel = { type: 'more' }; g.refresh(); });
await page.waitForTimeout(400);
await page.click('[data-act="feedback"]');
await page.waitForTimeout(300);
if (!(await page.locator('#feedback').count())) fail('Feedback öffnet sich nicht');
await page.click('#feedback [data-fb-kind="Fehler"]');
await page.fill('#fbText', 'Testmeldung: Der Frachter fliegt durch die Station.');
await page.fill('#fbName', 'Tester');
await page.check('#fbSave');
await page.screenshot({ path: `${out}/feedback-1-formular.png` });
await page.click('#feedback [data-fb="send"]');
await page.waitForTimeout(1200);
if (!(await page.locator('#fbStatus', { hasText: 'noch nicht eingerichtet' }).count())) fail('Fehler 404 ohne klare Meldung');
if (!(await page.inputValue('#fbText')).includes('Testmeldung')) fail('Text nach Fehlschlag verloren');
await page.click('#feedback [data-fb="send"]');
await page.waitForTimeout(1200);
const body = posts.join('\n');
for (const [k, v] of [['form-name', 'feedback'], ['art', 'Fehler'], ['text', 'Testmeldung'], ['name', 'Tester'], ['version', ''], ['geraet', '']]) {
  if (!new RegExp(`name="${k}"\\r?\\n\\r?\\n${v}`).test(body)) fail(`Feld ${k} fehlt oder falsch`);
}
if (!/name="bild"; filename="[^"]+\.jpg"/.test(body)) fail('Bildschirmfoto fehlt');
if (!/name="sicherung"; filename="[^"]+\.json"/.test(body) || !body.includes('x4-sektorbau-sicherung')) fail('Spielstand fehlt');
if (!(await page.locator('#fbStatus', { hasText: 'Danke' }).count())) fail('Keine Bestätigung nach dem Senden');
await page.screenshot({ path: `${out}/feedback-2-danke.png` });
await page.click('#feedback [data-fb="close"]');
// Pausenmenü eines Minispiels
await page.evaluate(() => { const g = window.__game; g.ui.panel = null; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(300);
await page.click('#modal [data-act="mg-play"][data-kind="xenon"]');
await page.waitForTimeout(1500);
await page.click('#minigame [data-mg="start"]');
await page.waitForTimeout(1500);
await page.click('#minigame [data-mg="pause"]');
await page.waitForTimeout(300);
if (!(await page.locator('#minigame [data-mg="feedback"]').count())) fail('Pausenmenü ohne Feedback-Knopf');
else {
  await page.click('#minigame [data-mg="feedback"]');
  await page.waitForTimeout(300);
  if (!(await page.locator('#feedback .fb-meta', { hasText: 'Minispiel' }).count())) fail('Feedback aus dem Minispiel ohne Ortsangabe');
  await page.screenshot({ path: `${out}/feedback-3-minispiel.png` });
}
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
