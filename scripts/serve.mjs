// Kleiner Webserver für dist/ (die Tests öffnen das Spiel darüber: Code und Bilder liegen als getrennte Dateien,
// die der Browser aus einer lokalen Datei nicht laden darf).
// import { distUrl } from './serve.mjs'; await page.goto(await distUrl());
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
let url = null;

export async function distUrl(dir = new URL('../dist/', import.meta.url).pathname) {
  if (url) return url;
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    // Browser fragen von selbst nach einem Seitensymbol – das Spiel hat keins
    if (path.endsWith('favicon.ico')) { res.writeHead(204); res.end(); return; }
    const file = join(dir, path.endsWith('/') ? path + 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      console.error('nicht gefunden:', req.url);
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  // hält das Skript nicht am Leben
  server.unref();
  url = `http://127.0.0.1:${server.address().port}/index.html`;
  return url;
}
