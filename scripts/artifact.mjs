// Wandelt dist/index.html in eine Seite für claude.ai-Artifacts um (ohne eigenes html/head/body).
import fs from 'node:fs';

const [src = 'dist/index.html', out = 'dist/artifact.html'] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = head.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const styles = head.match(/<style[\s\S]*?<\/style>/g) ?? [];
const scripts = head.match(/<script[\s\S]*?<\/script>/g) ?? [];
const page = [title, fonts, ...styles, body.trim(), ...scripts].join('\n');
fs.writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} kB`);
