// Alte Spielstände in der echten Oberfläche laden (Dialog „Spielstand laden“) und alle Ansichten öffnen.
// node scripts/oldsave-shot.mjs <outdir> [breite]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { distUrl } from './serve.mjs';

const out = process.argv[2] ?? '.';
const width = Number(process.argv[3] ?? 390);
const dir = path.resolve('tests/fixtures/saves');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const browser = await chromium.launch(launchOpts());
const report = {};
let failed = false;
for (const f of files) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
  await page.goto(await distUrl());
  await page.waitForTimeout(600);
  await page.click('text=Loslegen');
  // Über den echten Ladedialog importieren
  await page.evaluate(() => { const g = window.__game; g.ui.modal = { type: 'import' }; g.refresh(); });
  await page.waitForTimeout(200);
  await page.fill('#importText', readFileSync(path.join(dir, f), 'utf8'));
  await page.click('[data-act="import-do"]');
  await page.waitForTimeout(400);
  const loaded = await page.evaluate(() => window.__game.state.stations.length);
  // Alle Ansichten öffnen und eine halbe Stunde weiterspielen
  const views = await page.evaluate(async () => {
    const g = window.__game, s = g.state, seen = [];
    const wait = () => new Promise((r) => setTimeout(r, 60));
    for (const st of s.stations) for (const tab of ['overview', 'modules', 'storage', 'ships', 'yard']) { g.openPanel('station', st.id, tab); g.refresh(); await wait(); seen.push(`${st.name}/${tab}:${document.querySelector('#panel')?.textContent?.length ?? 0}`); }
    for (const sh of s.ships.slice(0, 4)) { g.openPanel('ship', sh.id); g.refresh(); await wait(); }
    for (const p of ['stations', 'fleet', 'missions', 'market', 'planner', 'blueprints', 'more']) { g.openPanel(p); g.refresh(); await wait(); seen.push(p); }
    g.step(1800); g.openPanel('station', s.stations[0].id, 'modules'); g.refresh(); await wait();
    return seen.length;
  });
  await page.screenshot({ path: `${out}/oldsave-${width}-${f.replace('.json', '')}.png` });
  report[f] = { loaded, views, errors };
  if (!loaded || errors.length) failed = true;
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
if (failed) { console.error('Fehlgeschlagen'); process.exit(1); }
