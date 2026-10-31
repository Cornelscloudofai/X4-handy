// Minispiele im Spiel: Überfall durch eine Gegnerrotte (Hinweisleiste, „Selbst übernehmen“ startet das Minispiel) und Aufgaben an Stationen.
// node scripts/incident-shot.mjs <outdir>
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2];
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.click('text=Loslegen mit Handel');
await page.waitForTimeout(1500);
// Frachter beladen; eine Piratenrotte direkt daneben hat ihn als Ziel – erreicht sie ihn, beginnt der Überfall
await page.evaluate(() => {
  const g = window.__game; g.state.help = { coachOff: true };
  const sh = g.state.ships[0];
  sh.cargo = { ware: 'energycells', amount: 800 };
  sh.path = [{ sector: sh.sector, x: sh.x + 60, z: sh.z }];
  for (const st of g.state.stations) for (const m of st.modules) m.util = 0;
  g.state.story.index = Math.max(g.state.story.index, 4);
  g.state.hostiles = { list: [{ id: 999, foe: 'pirates', sector: sh.sector, x: sh.x + 2, z: sh.z, heading: 0, path: [], n: 3, power: 270, target: sh.id, phase: 'hunt', until: g.state.time + 2400, replan: 99 }], next: 1e12, n: 1 };
  g.step(1);
  g.refresh();
});
await page.waitForTimeout(600);
if (!(await page.locator('.incident-bar').count())) errors.push('Keine Hinweisleiste für den Vorfall');
const kind = await page.evaluate(() => window.__game.state.incidents.open[0]?.kind);
if (kind !== 'raid') errors.push('Erwartet Überfall, war: ' + kind);
await page.screenshot({ path: `${out}/incident-1-leiste.png` });
await page.click('.incident-bar [data-act="incident-play"]');
await page.waitForTimeout(2500);
if (!(await page.locator('#minigame').count())) errors.push('Minispiel startet nicht');
await page.screenshot({ path: `${out}/incident-2-kampf.png` });
await page.evaluate(() => document.getElementById('minigame')?.remove());
// Aufgaben im Sektor
await page.evaluate(() => { const g = window.__game; g.ui.selection = null; g.refresh(); });
await page.click('[data-act="sector-info"]');
await page.waitForTimeout(300);
await page.click('.gx-card [data-act="sector-tab"][data-tab="general"]');
await page.waitForTimeout(300);
const n = await page.locator('.gx-card .task').count();
if (n !== 2) errors.push('Aufgaben im Sektor: ' + n);
await page.locator('.gx-card .section.tasks').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/incident-3-aufgaben.png` });
await page.click('.gx-card [data-act="task-play"] >> nth=0');
await page.waitForTimeout(2500);
if (!(await page.locator('#minigame').count())) errors.push('Aufgabe startet kein Minispiel');
await page.screenshot({ path: `${out}/incident-4-aufgabe.png` });
await browser.close();
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
