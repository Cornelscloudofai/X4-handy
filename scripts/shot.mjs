// Screenshots für die Entwicklung: node scripts/shot.mjs <outdir> <szenario>
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const out = process.argv[2] ?? '.';
const scenario = process.argv[3] ?? 'start';
const file = pathToFileURL(path.resolve('dist/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
await page.goto(file);
await page.waitForTimeout(900);
const shot = (n) => page.screenshot({ path: `${out}/${scenario}-${n}.png` });
const tapWorld = async (x, z) => {
  const [sx, sy] = await page.evaluate(([x, z]) => window.__game.cam.toScreen(x, z), [x, z]);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(400);
};
const run = (code) => page.evaluate(code);
if (scenario === 'start') {
  await shot('1-welcome');
  await page.click('text=Loslegen');
  await page.waitForTimeout(600);
  await shot('2-map');
  const st = await run(() => window.__game.state.stations[0]);
  await tapWorld(st.x, st.z);
  await shot('3-station-card');
  await page.click('text=Bauplan');
  await page.waitForTimeout(400);
  await shot('4-station-modules');
  await page.click('text=Modul bauen');
  await page.waitForTimeout(400);
  await shot('5-module-picker');
}
if (scenario === 'mid') {
  await page.click('text=Loslegen');
  await run(async () => {
    const g = window.__game;
    const { state } = g;
    state.credits = 30_000_000;
    g.refresh();
  });
  await page.waitForTimeout(300);
  // Raffinerie bauen und Zeit vorspulen
  await run(() => {
    const g = window.__game;
    const st = g.state.stations[0];
    st.queue.push({ def: 'prod_refinedmetals', paid: 0 }, { def: 'storage_liquid', paid: 0 }, { def: 'prod_graphene', paid: 0 });
  });
  await page.click('[data-act="speed"]');
  await page.click('[data-act="speed"]');
  await page.waitForTimeout(4000);
  await shot('1-running');
  await page.click('[data-act="zoom-in"]');
  await page.click('[data-act="zoom-in"]');
  await page.waitForTimeout(800);
  await shot('2-zoom');
}
console.log('errors', errors);
await browser.close();
