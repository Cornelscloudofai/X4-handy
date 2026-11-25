// Vorschau des Kampfes für Screenshots an den Nutzer – immer mit der Zwei-Stick-Steuerung (die er meist nutzt).
//   node scripts/kampf-vorschau.mjs <ausgabe.png> [--quer] [--ship dragon] [--weapon plasma] [--side pirates] [--secs 2] [--ohne-sticks]
// Baut nicht selbst: vorher `npx vite build`.
import { chromium } from 'playwright';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
import { playSim } from './simNav.mjs';

const out = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const quer = process.argv.includes('--quer');
const ship = arg('ship', 'dragon'), weapon = arg('weapon', 'plasma'), side = arg('side', 'pirates'), secs = Number(arg('secs', 2));
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: quer ? { width: 844, height: 390 } : { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.addInitScript(([s, w]) => {
  localStorage.setItem('x4-sektorbau-ausruestung', JSON.stringify({ ship: s, weapon: w, turret: 'puls', shield: 'leicht', missile: 'lenk' }));
  localStorage.setItem('x4-sektorbau-steuerung', 'zwei');
}, [ship, weapon]);
await page.goto(await distUrl());
await page.waitForTimeout(700);
await page.click('text=Loslegen');
await page.evaluate(() => { const g = window.__game; g.state.help = { coachOff: true }; g.ui.modal = { type: 'minigames' }; g.refresh(); });
await page.waitForTimeout(300);
await playSim(page, side, { mission: 'ueberleben' });
await page.waitForTimeout(300);
await page.click('#minigame [data-mg="start"]');
await page.evaluate((n) => { const g = window.__mg.game; for (let i = 0; i < 60 * n; i++) { g.autopilot(); g.update(1 / 60); } }, secs);
// beide Sticks sichtbar halten: links ein Finger schiebt nach vorn-rechts, rechts einer zielt (sonst sieht man sie nicht)
if (!process.argv.includes('--ohne-sticks')) await page.evaluate((q) => {
  const g = window.__mg.game, w = g.w, h = g.h;
  const lx = w * (q ? 0.16 : 0.24), ly = h * (q ? 0.68 : 0.78), rx = w * (q ? 0.66 : 0.66), ry = h * (q ? 0.55 : 0.62);
  g.joy = null; g.aim = null; // Autopilot-Kurs (id 99) freigeben, sonst übernimmt der Finger nicht
  g.pointerDown(1, lx, ly); g.pointerDown(2, rx, ry);
  for (let i = 0; i < 20; i++) { g.pointerMove(1, lx + 22, ly - 40); g.pointerMove(2, rx - 30, ry - 34); g.update(1 / 60); }
}, quer);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
