// Kampf-Schauplätze: je Gegner (Piraten, Xenon, Kha'ak) ein Kampf aus dem Menü – Hintergrund mit Tiefenebenen statt
// leerem Sternhimmel, bei normalem und weitem Zoom, während des Flugs (Ebenen gleiten verschieden schnell).
// node scripts/battle-bg-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2] ?? '/tmp';
const errors = [];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(600);
await page.click('text=Loslegen');
await page.evaluate(() => { window.__game.state.help = { coachOff: true }; });
/** Helligkeitsstreuung eines Bildausschnitts (leerer Verlauf ≈ 0, Schauplatz mit Ebenen deutlich mehr) */
const spread = () => page.evaluate(() => {
  const c = document.querySelector('#minigame canvas'), g = document.createElement('canvas');
  g.width = 120; g.height = 260; const x = g.getContext('2d'); x.drawImage(c, 0, 0, 120, 260);
  const d = x.getImageData(0, 0, 120, 260).data; let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; s += v; s2 += v * v; n++; }
  const m = s / n; return Math.sqrt(s2 / n - m * m);
});
const res = {};
for (const kind of ['pirates', 'xenon', 'khaak']) {
  await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'minigames', level: 1, gear: 1 }; g.refresh(); });
  await page.waitForTimeout(300);
  await page.click(`#modal [data-act="mg-play"][data-kind="${kind}"]`);
  await page.waitForTimeout(400);
  await page.click('#minigame [data-mg="start"]');
  await page.waitForTimeout(2500);
  // Gegner aus dem Weg, damit der Hintergrund zu sehen ist
  await page.evaluate(() => { const g = window.__mg.game; g.enemies = g.enemies.filter((e) => e.kind === 'cargo'); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/schauplatz-${kind}-1.png` });
  const a = await spread();
  await page.evaluate(() => { const g = window.__mg.game; g.zoom = g.zoomGoal = 0.12; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/schauplatz-${kind}-weit.png` });
  res[kind] = { nah: +a.toFixed(1), weit: +(await spread()).toFixed(1) };
  if (a < 6) errors.push(`${kind}: Hintergrund fast leer (Streuung ${a.toFixed(1)})`);
  for (const sel of ['[data-mg="pause"]', '[data-mg="abort"]', '[data-mg="quit"]']) { if (await page.locator(`#minigame ${sel}`).count()) { await page.click(`#minigame ${sel}`).catch(() => {}); await page.waitForTimeout(200); } }
  await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.refresh(); });
  await page.waitForTimeout(300);
}
await browser.close();
console.log(JSON.stringify({ res, errors }, null, 1));
if (errors.length) process.exit(1);
