// Geführte erste Schritte im echten Browser durchspielen: immer genau dorthin tippen, wohin der Hinweis zeigt.
// node scripts/coach-shot.mjs <outdir> [breite]
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import path from 'node:path';
import { distUrl } from './serve.mjs';

const out = process.argv[2] ?? '.';
const width = Number(process.argv[3] ?? 390);
const kind = process.argv[4] ?? 'mining';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
await page.goto(await distUrl());
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/coach-${width}-00-welcome.png` });
await page.click(`.start-card[data-kind="${kind}"]`);
await page.waitForTimeout(500);

const seen = [];
const problems = [];
let idle = 0;
for (let i = 0; i < 60; i++) {
  const info = await page.evaluate(() => {
    const host = document.getElementById('coach');
    if (!host || host.hidden) return null;
    const b = host.querySelector('.coach-bubble')?.getBoundingClientRect();
    const r = host.querySelector('.coach-ring')?.getBoundingClientRect();
    return {
      text: host.querySelector('.coach-bubble p')?.textContent ?? '',
      next: !!host.querySelector('[data-act="coach-next"]'),
      bubble: b && { l: b.left, r: b.right, t: b.top, b: b.bottom },
      ring: r && { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      vw: innerWidth, vh: innerHeight,
    };
  });
  if (!info) {
    // Kein Hinweis: Spielzeit vorspulen (Bau, Produktion, Kapitel)
    const done = await page.evaluate(() => { const g = window.__game; g.state.credits = Math.max(g.state.credits, 20e6); g.step(900); g.refresh(); return g.state.story.index; });
    await page.waitForTimeout(150);
    if (done >= (kind === 'mining' ? 8 : 7) || ++idle > 25) break;
    continue;
  }
  idle = 0;
  if (seen.at(-1) !== info.text) {
    seen.push(info.text);
    await page.screenshot({ path: `${out}/coach-${width}-${String(seen.length).padStart(2, '0')}.png` });
    const bb = info.bubble;
    if (!bb || bb.l < 0 || bb.r > info.vw + 1 || bb.t < 0 || bb.b > info.vh + 1) problems.push('Blase außerhalb: ' + info.text.slice(0, 40));
  }
  if (info.next) await page.click('[data-act="coach-next"]');
  else if (info.ring) await page.mouse.click(info.ring.x, info.ring.y);
  else problems.push('Hinweis ohne Ziel und ohne Weiter: ' + info.text.slice(0, 40));
  await page.waitForTimeout(400);
}
const state = await page.evaluate(() => { const s = window.__game.state; return { chapter: s.story.index, miners: s.ships.filter((x) => x.cls.startsWith('alligator')).length, traders: s.ships.filter((x) => !x.cls.startsWith('alligator')).length, refinery: s.stations[0].modules.some((m) => m.def === 'prod_refinedmetals'), help: s.help }; });

// Hilfe: „?“-Knopf öffnet das passende Thema, Menü zeigt alle Themen
await page.evaluate(() => { const g = window.__game; g.ui.modal = null; g.openPanel('station', g.state.stations[0].id, 'modules'); g.refresh(); });
await page.waitForTimeout(300);
await page.click('#panel .buildstore .help-q');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/coach-${width}-help-topic.png` });
const helpTitle = await page.evaluate(() => document.querySelector('#modal h1')?.textContent ?? '');
await page.click('#modal [data-act="help"][data-topic=""]');
await page.waitForTimeout(300);
const topics = await page.evaluate(() => document.querySelectorAll('#modal [data-act="help"][data-topic]').length);
await page.screenshot({ path: `${out}/coach-${width}-help-list.png` });

const report = { steps: seen, state, helpTitle, topics, problems, errors };
console.log(JSON.stringify(report, null, 1));
await browser.close();
// Bergbau: 3 Einstiegskapitel + Raffinerie, Metalle, Miner, Transporter; Handel: bis zu den Minern
const ok = !errors.length && !problems.length && state.refinery && (kind === 'mining' ? state.miners >= 3 && state.traders >= 1 && state.chapter >= 7 : state.chapter >= 6) && helpTitle.includes('Baulager') && topics >= 8;
if (!ok) { console.error('Fehlgeschlagen'); process.exit(1); }
