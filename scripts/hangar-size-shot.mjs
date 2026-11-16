// Hangar: Hallen im echten Maßstab, Kamera zoomt je Schiff (Jaguar < Mamba < Cobra < Klapperschlange < Raptor), Maßstab
// mit Länge und Mamba zum Vergleich. node scripts/hangar-size-shot.mjs <outdir> [schiffe]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '/tmp';
const ships = (process.argv[3] ?? 'jaguar,mamba,cobra,klapperschlange,raptor').split(',');
const errors = [];
const h = {};
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(600);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
await page.waitForTimeout(300);
await page.click('#modal [data-act="mg-tab"][data-tab="combat"]');
await page.waitForTimeout(300);
await page.click('#modal [data-act="loadout-open"]');
await page.waitForTimeout(400);
for (const id of ships) {
  for (let i = 0; i < 12; i++) {
    const cur = await page.evaluate(() => JSON.parse(localStorage.getItem('x4-sektorbau-ausruestung') ?? '{}').ship ?? 'mamba');
    if (cur === id) break;
    await page.click('#modal .hgr-arrow.next');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${id}.png` });
  h[id] = await page.evaluate(() => ({ box: document.querySelector('#modal .hgr-ship:not(.old)').getBoundingClientRect().height, len: document.querySelector('#modal .hgr-scale b')?.textContent, ref: !!document.querySelector('#modal .hgr-ref img'), dz: Number(getComputedStyle(document.querySelector('#modal .hgr')).getPropertyValue('--dz')) || 1, hf: Number(getComputedStyle(document.querySelector('#modal .hgr')).getPropertyValue('--hf')) || 0.95 }));
}
await browser.close();
// Hallen im echten Maßstab: Meter je Bildpunkt auf dem Schirm wachsen mit der Schiffsgröße (die Kamera zoomt heraus),
// innerhalb einer Halle passt der Zoom des Hallenbilds genau dazu (Meter je Bildpunkt des Hallenbilds gleich)
const LEN = { jaguar: 25.8, mamba: 32, cobra: 147.7, klapperschlange: 906.4, raptor: 3191 };
const order = ships.filter((id) => h[id]);
const mpp = (id) => LEN[id] / (h[id].box * h[id].hf);
for (let i = 1; i < order.length; i++) if (!(mpp(order[i]) > mpp(order[i - 1]))) errors.push(`Kamera: ${order[i]} nicht weiter herausgezoomt als ${order[i - 1]}`);
for (const [a, b] of [['jaguar', 'mamba'], ['klapperschlange', 'raptor']]) {
  if (!h[a] || !h[b]) continue;
  const r = (mpp(a) * h[a].dz) / (mpp(b) * h[b].dz);
  if (Math.abs(r - 1) > 0.02) errors.push(`Halle nicht maßstabsgetreu: ${a} zu ${b} (${r.toFixed(3)})`);
}
// jedes Schiff etwa bildfüllend: S-Jäger nicht winzig
for (const id of order) if (h[id].box * h[id].hf < 150) errors.push(`${id} zu klein (${Math.round(h[id].box * h[id].hf)} px Rumpf)`);
if (h.raptor && h.raptor.len !== '3.191 m') errors.push(`Raptor-Länge falsch: ${h.raptor.len}`);
if (h.cobra && !h.cobra.ref) errors.push('Cobra ohne Mamba zum Vergleich');
if (h.mamba?.ref) errors.push('Mamba vergleicht sich mit sich selbst');
if (errors.length) { console.error('Fehler:\n' + errors.join('\n')); process.exit(1); }
console.log('Hangar: Schiffsgrößen und Maßstab in Ordnung', JSON.stringify(h));
