// Gemeinsamer Aufbau für den Trailer: Browser im Hochformat 1080×1920 (432×768 CSS-Pixel, Faktor 2,5), Uhr unter
// eigener Kontrolle (Bild für Bild), Spielschriften lokal statt von Google Fonts.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launchOpts } from '../browser.mjs';
import { distUrl } from '../serve.mjs';

export const W = 432, H = 768, DPR = 2.5, FPS = 60;

/** @fontsource-Pakete (Barlow, Chakra Petch) – Ordner per TRAILER_FONTS oder node_modules */
function fontCss() {
  const dirs = [process.env.TRAILER_FONTS, new URL('../../node_modules', import.meta.url).pathname].filter(Boolean);
  const face = (fam, pkg, w) => {
    for (const d of dirs) {
      const f = `${d}/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`;
      if (existsSync(f)) return `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${readFileSync(f).toString('base64')}) format('woff2');}`;
    }
    return '';
  };
  return [400, 500, 600, 700].map((w) => face('Barlow', 'barlow', w)).join('') + [500, 600, 700].map((w) => face('Chakra Petch', 'chakra-petch', w)).join('');
}

export async function open() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('Seitenfehler:', String(e)));
  const css = fontCss();
  await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await page.route(/fonts\.gstatic\.com/, (r) => r.fulfill({ status: 204 }));
  await page.clock.install();
  await page.goto(await distUrl());
  await page.clock.runFor(1200);
  // Uhr anhalten: ab jetzt rückt die Spielzeit nur noch mit runFor vor (sonst läuft sie in Echtzeit weiter)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.evaluate(() => document.fonts.ready);
  return { browser, page };
}

/** Recorder: Bild für Bild, jedes Bild 1/60 s Spielzeit */
export function recorder(page, dir) {
  let n = 0;
  return {
    get n() { return n; },
    async frame() {
      await page.clock.runFor(1000 / FPS);
      await page.screenshot({ path: `${dir}/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 });
    },
    /** Bild mit fester Nummer (Szenen lassen sich so einzeln neu aufnehmen) */
    async frameAt(i) {
      await page.clock.runFor(1000 / FPS);
      await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 });
    },
    async frames(k, each) { for (let i = 0; i < k; i++) { if (each) await each(i, k); await this.frame(); } },
    async skip(ms) { await page.clock.runFor(ms); },
  };
}
