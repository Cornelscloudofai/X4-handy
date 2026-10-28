// Szenen der neuen Sektoren ansehen: node scripts/scene-shot.mjs <outdir> [sektor…] (mit „storm“ als Zusatz: im Sturm)
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const [out, ...args] = process.argv.slice(2);
const storm = args.includes('storm');
const ids = args.filter((a) => a !== 'storm');
const browser = await chromium.launch(launchOpts());
const errors = [];
for (const [vw, vh, tag] of [[390, 844, 'hoch'], [844, 390, 'quer']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(await distUrl());
  await page.click('text=Loslegen mit Bergbau');
  await page.waitForTimeout(1500);
  for (const id of ids.length ? ids : ['f-ausblick', 'f-glut1', 'f-asche', 'f-rhak', 'f-schmiede']) {
    await page.evaluate(([id, storm]) => {
      const g = window.__game; g.state.help = { coachOff: true };
      g.state.frontier ??= { signatures: [], discovered: [] }; if (!(g.state.frontier.discovered ?? []).includes(id)) g.discover(id);
      if (storm) { const t = g.state.time; g.step((3 * 3600 - ((t + 70 * 60) % (3 * 3600))) + 60); }
      g.gotoSector(id); g.refresh();
    }, [id, storm]);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('reveal')?.remove());
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/${id}-${tag}${storm ? '-sturm' : ''}.png` });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ errors }));
