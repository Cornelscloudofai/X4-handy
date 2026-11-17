// Artifact-Fassung mit Klangpaketen: bauen (Pakete Byte für Byte geprüft), höchstens 511 Dateien, im Browser öffnen –
// Klänge der Hörprobe kommen aus den Paketen (keine Einzeldatei angefragt) und sind hörbar.
// node scripts/artifact-pack-shot.mjs [ausgabe]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';

const out = process.argv[2] ?? '/tmp/x4-artifact-pack';
const errors = [];
console.log(execFileSync('node', ['scripts/artifact-pack.mjs', 'dist', out, '--check']).toString().trim());
const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
if (count(out) > 511) errors.push(`Artifact-Fassung hat ${count(out)} Dateien (höchstens 511)`);

const lo = launchOpts();
const browser = await chromium.launch({ ...lo, args: [...(lo.args ?? []), '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
let single = 0;
const packs = new Map();
page.on('requestfinished', async (r) => {
  const u = r.url();
  if (/\/(es|kd|sn)-[^/]+\.(ogg|wav)$/.test(u)) single++;
  if (/\/klaenge-[^/]+\.wasm$/.test(u)) packs.set(u.split('/').pop(), (await r.response())?.status());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl(path.resolve(out) + '/'));
await page.waitForTimeout(800);
if (!(await page.evaluate(() => !!window.__SOUND_PACKS))) errors.push('Seite ohne Klangverzeichnis');
await page.click('text=Loslegen');
await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.openPanel('more', undefined, 'settings'); g.refresh(); });
await page.waitForTimeout(400);
// Hörprobe erscheint mit den Einstellungen (Ton ist an); nur wenn sie fehlt, Ton einschalten
if (!(await page.locator('.sound-demo').waitFor({ timeout: 3000 }).then(() => true, () => false))) { await page.click('[data-act="sound-toggle"]'); await page.waitForTimeout(400); }
const res = {};
for (const label of ['Splitter 1', 'Explosion groß 1', 'Schuss K5', 'Boss 3']) {
  if (!(await page.locator('.sound-demo').evaluate((d) => d.open))) await page.click('.sound-demo summary');
  await page.locator('[data-act="sound-demo"]').filter({ hasText: new RegExp(`^\\s*\\d+\\s*${label}$`) }).first().click({ force: true });
  let peak = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && peak < 0.25) { await page.waitForTimeout(100); peak = Math.max(peak, await page.evaluate(() => window.__audio.meterPeak())); }
  res[label] = { peak: +peak.toFixed(2), ms: Date.now() - t0 };
  if (peak < 0.25) errors.push(`${label}: aus dem Paket kein Klang innerhalb von 5 s (Spitze ${peak.toFixed(2)})`);
  await page.waitForTimeout(1200);
}
await browser.close();
if (single) errors.push(`${single} Klänge als Einzeldatei angefragt statt aus dem Paket`);
if (!packs.size) errors.push('kein Klangpaket geladen');
// Bedienklänge liegen gleich nach dem Start bereit
if (![...packs.keys()].some((p) => p.includes('kd-bedienung'))) errors.push('Paket der Bedienklänge nicht vorgeladen');
for (const [p, st] of packs) if (st !== 200) errors.push(`${p}: Status ${st}`);
console.log(JSON.stringify({ res, pakete: [...packs.keys()], errors }, null, 1));
if (errors.length) process.exit(1);
