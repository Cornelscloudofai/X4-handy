// Vorab-Rendering der Bild-Grafiken (3D-Modelle aus scripts/render/*.js) nach src/assets/sprites/.
// node scripts/render-sprites.mjs [vorschau-ordner]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { launchOpts } from './browser.mjs';

const root = new URL('..', import.meta.url).pathname;
const preview = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ ...launchOpts(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('Fehler:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
const jobs = [{ page: 'fighter', file: 'jaeger-s' }];
await mkdir(join(root, 'src/assets/sprites'), { recursive: true });
for (const job of jobs) {
  await page.goto(`http://localhost:${port}/scripts/render/${job.page}.html`);
  await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
  const r = await page.evaluate(() => window.__result);
  const sprite = Buffer.from(r.sprite.split(',')[1], 'base64');
  await writeFile(join(root, `src/assets/sprites/${job.file}.webp`), sprite);
  if (preview) await writeFile(join(preview, `${job.file}-preview.png`), Buffer.from(r.preview.split(',')[1], 'base64'));
  console.log(`${job.file}.webp`, Math.round(sprite.length / 1024), 'KB');
}
await browser.close();
server.close();
