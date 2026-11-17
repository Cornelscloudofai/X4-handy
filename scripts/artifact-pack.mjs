// Fassung für das Claude-Artifact (höchstens 511 Dateien je Version): aus dist/ eine Kopie, in der die über 200
// Klangdateien in wenige Pakete gepackt sind. Inhalt unverändert (Bytes 1:1), das Spiel schneidet jeden Klang beim
// Laden wieder heraus (src/audio/engine.ts, window.__SOUND_PACKS). Weggelassen wird nur, was eingebettet nie lädt:
// Service Worker, App-Manifest, großes App-Symbol, Intro-Ordner, Formularseite. Netlify und App bleiben unverändert.
// Pakete heißen .wasm: das Artifact liefert nur bekannte Dateiarten aus, die Bytes liest das Spiel roh (kein WebAssembly).
//
//   node scripts/artifact-pack.mjs [dist] [ausgabe]      → Ausgabe neu aufbauen, Übersicht ausgeben
//   node scripts/artifact-pack.mjs [dist] [ausgabe] --check  → zusätzlich jedes Paket gegen die Einzeldateien prüfen
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const check = process.argv.includes('--check');
const dist = args[0] ?? 'dist';
const out = args[1] ?? 'dist-artifact';

/** Zielgröße eines Pakets: groß genug für wenige Dateien, klein genug, dass ein Klang schnell da ist */
const PACK_MAX = 4 * 1024 * 1024;
/** Bedienklänge (Tippen, Fenster, Meldungen): eigenes kleines Paket, damit der erste Tipp nicht warten muss */
const UI = new Set(['tippen', 'oeffnen', 'schliessen', 'ablehnen', 'angenommen', 'credits', 'nachricht', 'warnung', 'erledigt', 'aufsammeln']);
/** Nicht ins Artifact: lädt eingebettet nie (Service Worker und Installation sind dort abgeschaltet) */
const SKIP_ROOT = new Set(['sw.js', 'manifest.webmanifest', 'icon-512.png', 'intro', '__forms.html', 'trailer-1.mp4', 'artifact.html']);

const SOUND = /^((es|kd|sn)-.+)-[A-Za-z0-9_-]{8}\.(ogg|wav)$/;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const f of fs.readdirSync(dist)) {
  if (SKIP_ROOT.has(f) || f === 'assets') continue;
  fs.cpSync(path.join(dist, f), path.join(out, f), { recursive: true });
}

// Klänge sammeln, nach Gruppe (Vorsatz und Art: kd-schuss, sn-expl …) ordnen
const sounds = [];
for (const f of fs.readdirSync(path.join(dist, 'assets')).sort()) {
  const m = f.match(SOUND);
  if (!m) { fs.copyFileSync(path.join(dist, 'assets', f), path.join(out, 'assets', f)); continue; }
  const [prefix, kind] = m[1].split('-');
  const group = prefix === 'kd' && UI.has(kind) ? 'kd-bedienung' : prefix;
  sounds.push({ file: f, group, kind, size: fs.statSync(path.join(dist, 'assets', f)).size });
}

// Pakete füllen: je Gruppe, Arten zusammenhalten, bis zur Zielgröße
const packs = [];
const groups = [...new Set(sounds.map((s) => s.group))];
for (const g of groups) {
  const list = sounds.filter((s) => s.group === g).sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
  let cur = null;
  for (const s of list) {
    if (!cur || (cur.size + s.size > PACK_MAX && cur.items.length)) { cur = { group: g, items: [], size: 0 }; packs.push(cur); }
    cur.items.push(s);
    cur.size += s.size;
  }
}

/** Verzeichnis für das Spiel: Dateiname → [Paket, Anfang, Länge] */
const index = {};
for (const [i, p] of packs.entries()) {
  const bufs = p.items.map((s) => fs.readFileSync(path.join(dist, 'assets', s.file)));
  const data = Buffer.concat(bufs);
  const hash = crypto.createHash('sha256').update(data).digest('base64url').slice(0, 8);
  p.name = `assets/klaenge-${p.group}-${i + 1}-${hash}.wasm`;
  fs.writeFileSync(path.join(out, p.name), data);
  let at = 0;
  for (const [k, s] of p.items.entries()) { index[s.file] = [`./${p.name}`, at, bufs[k].length]; at += bufs[k].length; }
}

// Seite: Verzeichnis vor dem Spielcode, Manifest-Verweis raus (Datei fehlt im Artifact)
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/(\s*<script type="module")/, `\n<script>window.__SOUND_PACKS=${JSON.stringify(index)};</script>$1`);
fs.writeFileSync(path.join(out, 'index.html'), html);

if (check) {
  for (const s of sounds) {
    const [name, at, len] = index[s.file];
    const a = fs.readFileSync(path.join(out, name.slice(2))).subarray(at, at + len);
    if (!a.equals(fs.readFileSync(path.join(dist, 'assets', s.file)))) { console.error(`Paket fehlerhaft: ${s.file}`); process.exit(1); }
  }
}

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
const mb = (b) => (b / 1024 / 1024).toFixed(1).replace('.', ',');
console.log(`${out}: ${count(out)} Dateien (dist: ${count(dist)}) · ${sounds.length} Klänge in ${packs.length} Paketen`);
for (const p of packs) console.log(`  ${p.name}  ${p.items.length} Klänge, ${mb(p.size)} MB`);
if (check) console.log('Pakete geprüft: jeder Klang Byte für Byte gleich');
