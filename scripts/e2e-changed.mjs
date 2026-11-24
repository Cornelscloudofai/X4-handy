// e2e nur für das, was sich geändert hat: Dateien seit dem letzten erfolgreichen e2e-Lauf (bzw. seit dem angegebenen
// Stand) bestimmen, daraus die betroffenen Browserprüfungen ableiten und nur diese ausführen. Die volle Reihe
// (`npm run e2e`) bleibt für Releases ([live]).
//   node scripts/e2e-changed.mjs            – seit dem letzten erfolgreichen Lauf (sonst seit dem letzten Commit)
//   node scripts/e2e-changed.mjs <commit>   – seit diesem Stand
//   node scripts/e2e-changed.mjs --list     – nur anzeigen, was liefe
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const MARK = `${root}node_modules/.cache/e2e-ok`;
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const baseArg = args.find((a) => !a.startsWith('--'));
const sh = (c) => execSync(c, { cwd: root, encoding: 'utf8' }).trim();

// Ausgangsstand: Argument, sonst letzter erfolgreicher Lauf, sonst der Commit vor dem aktuellen
let base = baseArg ?? (existsSync(MARK) ? readFileSync(MARK, 'utf8').trim() : 'HEAD~1');
try { sh(`git cat-file -e ${base}^{commit}`); } catch { base = 'HEAD~1'; }
const changed = [...new Set([
  ...sh(`git diff --name-only ${base}`).split('\n'),
  ...sh('git ls-files --others --exclude-standard').split('\n'),
].filter(Boolean))];

// Prüfungen (wie in package.json „e2e“) und die Quellen, die sie abdecken
const S = {
  yard390: 'yard-shot.mjs /tmp 390', yard360: 'yard-shot.mjs /tmp 360', oldsave: 'oldsave-shot.mjs /tmp 360',
  backup: 'backup-shot.mjs /tmp', save: 'save-shot.mjs /tmp', hull: 'hull-shot.mjs /tmp', app: 'app-shot.mjs /tmp',
  feedback: 'feedback-shot.mjs /tmp', intro: 'intro-shot.mjs /tmp', shipyard: 'shipyard-shot.mjs /tmp',
  galaxy: 'galaxy-shot.mjs /tmp', peil: 'peil-shot.mjs /tmp', discovery: 'discovery-shot.mjs /tmp',
  coach390: 'coach-shot.mjs /tmp 390', coach360: 'coach-shot.mjs /tmp 360', coachTrade: 'coach-shot.mjs /tmp 390 trading',
  buyorder: 'buyorder-shot.mjs /tmp', news: 'news-shot.mjs /tmp', tips: 'tips-shot.mjs /tmp', map: 'map-shot.mjs /tmp',
  flow: 'flow-shot.mjs /tmp', hud: 'hud-shot.mjs /tmp', sectorinfo: 'sectorinfo-shot.mjs /tmp',
  sectortabs: 'sectortabs-shot.mjs /tmp', incident: 'incident-shot.mjs /tmp', command: 'command-shot.mjs /tmp',
  guide: 'guide-shot.mjs /tmp', tow: 'tow-shot.mjs /tmp', clip: 'clip-audit.mjs', raptor: 'raptor-shot.mjs /tmp',
  hangar: 'hangar-size-shot.mjs /tmp', battleBg: 'battle-bg-shot.mjs /tmp', quer: 'quer-shot.mjs /tmp',
  sound: 'sound-demo-shot.mjs /tmp', pack: 'artifact-pack-shot.mjs /tmp/x4-artifact-pack',
  mg390: 'minigame-shot.mjs /tmp 390', mg360: 'minigame-shot.mjs /tmp 360',
};
const RULES = [
  // Kampf und Simulator
  // Kampflogik und -werte: die Kampfprüfung genügt (Kulissen, Querformat, Raptor nur bei eigenen Dateien)
  [/^src\/minigames\/(shooter|shooterData|cover|flightSchool|hullMask|specialIcons|missions|records|tunePanel)\.ts$|^src\/render\/engineFx\.ts$/, ['mg390']],
  [/^src\/minigames\/battleBg\.ts$|^src\/render\/(sceneBg|bgImages)\.ts$/, ['battleBg']],
  [/^src\/minigames\/(host|common|menuInfo)\.ts$|^src\/ui\/simView\.ts$/, ['mg390', 'mg360', 'quer']],
  [/^src\/ui\/hudScale\.ts$/, ['quer']],
  [/^src\/minigames\/(gas|gasDance|ore|cargo|pipes|pipesLogic|orbit|highway)\.ts$/, ['mg390', 'mg360']],
  // Ausrüstung, Hangar, Mods, Loadouts
  [/^src\/minigames\/(loadout|mods)\.ts$|^src\/ui\/loadoutView\.ts$/, ['hangar', 'mg390']],
  [/^src\/render\/shipArt\.ts$/, ['hangar', 'raptor']],
  // Speichern und Laden
  [/^src\/engine\/state\.ts$|^src\/ui\/(backup|saveGuard|undo)\.ts$/, ['oldsave', 'backup', 'save']],
  // Werft und Schiffe
  [/^src\/engine\/yard\.ts$|^src\/ui\/shipyardView\.ts$/, ['yard390', 'yard360', 'shipyard', 'hull']],
  // Karte, Sektor, Spielwelt
  [/^src\/render\/(galaxyView|sectorView|effects|fields|camera|sectorTheme|stationLayout|sprites|glyphs|noise|screenFx)\.ts$/, ['galaxy', 'map', 'sectorinfo', 'sectortabs', 'flow']],
  [/^src\/engine\//, ['flow', 'incident', 'command', 'tow', 'discovery', 'buyorder']],
  [/^src\/ui\/(coach|help|intro)\.ts$/, ['coach390', 'coachTrade', 'intro', 'guide', 'tips']],
  [/^src\/ui\/(newsView|peilung|zentrale|feedback|buyView|sellView|tradeView|deliveryView|plannerView)\.ts$/, ['news', 'peil', 'command', 'feedback', 'buyorder', 'flow']],
  [/^src\/ui\/(hudScale|hudStyle|menuArt)\.ts$/, ['hud', 'app', 'clip']],
  [/^src\/audio\//, ['sound']],
  // allgemeine Oberfläche: Rauchtest über die Hauptbereiche
  [/^src\/(main\.ts|styles\.css)$|^src\/ui\/(app|views|dom|icons|format|uistate|reveal|search|dragList|tween|charts|wareIcons|errorLog|install|sound)\.ts$|^index\.html$/, ['app', 'hud', 'clip', 'flow', 'mg390', 'hangar']],
  [/^scripts\/artifact-pack/, ['pack']],
];
const want = new Set();
const unknown = [];
for (const f of changed) {
  // geänderte Prüfskripte selbst laufen immer
  const own = Object.entries(S).filter(([, cmd]) => cmd.startsWith(f.replace(/^scripts\//, '') + ' ') || cmd === f.replace(/^scripts\//, ''));
  own.forEach(([k]) => want.add(k));
  const hit = RULES.filter(([re]) => re.test(f));
  hit.forEach(([, ks]) => ks.forEach((k) => want.add(k)));
  if (!hit.length && !own.length && /^src\//.test(f) && !/^src\/assets\//.test(f)) unknown.push(f);
}
// unbekannte Quelle: Rauchtest
if (unknown.length) ['app', 'flow', 'mg390'].forEach((k) => want.add(k));
// Reihenfolge wie in der vollen Reihe
const steps = Object.keys(S).filter((k) => want.has(k));

console.log(`Stand: ${base} · geändert: ${changed.length} Dateien${unknown.length ? ` (ohne Zuordnung, Rauchtest: ${unknown.join(', ')})` : ''}`);
console.log(steps.length ? `Prüfungen (${steps.length} von ${Object.keys(S).length}): ${steps.join(', ')}` : 'Keine Oberflächen-Prüfung nötig.');
if (listOnly || !steps.length) process.exit(0);

const run = (cmd) => { const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true }); return r.status ?? 1; };
const t0 = Date.now();
if (run('npx vite build --logLevel warn')) { console.error('Bau fehlgeschlagen'); process.exit(1); }
for (const k of steps) {
  console.log(`\n▶ ${S[k]}`);
  const t1 = Date.now();
  if (run(`node scripts/${S[k]}`)) { console.error(`\n✗ fehlgeschlagen: ${S[k]}`); process.exit(1); }
  console.log(`  (${Math.round((Date.now() - t1) / 1000)} s)`);
}
mkdirSync(`${root}node_modules/.cache`, { recursive: true });
writeFileSync(MARK, sh('git rev-parse HEAD'));
console.log(`\n✓ ${steps.length} Prüfungen in ${Math.round((Date.now() - t0) / 1000)} s`);
