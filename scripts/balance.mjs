// Waffen-Ausgleich messen: feste Testlagen, mehrere Zufallsstarts auf alle Prozessorkerne verteilt, Mittel und Spanne.
//   node scripts/balance.mjs [--lagen brut,zerstoerer,spaeher,jaeger,piraten,xenon,fregatte,xenonk] [--seeds 12] [--secs 60]
//                            [--ship cobra] [--turret flak] [--groups flak,neutron] [--weapon stoerblitz]
//                            [--gear 1] [--level 1] [--guns] [--keine-tuerme]
// --nur-l: nur die schweren L-Türme (Zerstörer: --lturret plasma|tau|boson|neutron; Träger: --groups je Gruppe)
// --flanke: Gegner entlang des Rumpfs (Bug oben), Großkampfschiff querab – für lange Schiffe wie den Raptor
// --guns: alle Bordwaffen feuern wie ein Spieler (Bug mit Vorhalt aufs nächste Ziel); --keine-tuerme: Türme abgebaut
// Lagen – Wellen (Abschüsse/min, erlittener Schaden/min): brut (Brutschiff ab Welle 1), spaeher (16 Kha'ak-Späher),
// jaeger (8 Piraten-Jäger), piraten (6 Jäger, 2 Kanonenboote, 1 Raketenboot), xenon (10 N, 3 M), je von allen Seiten.
// Großkampfschiffe samt Türmen (Sekunden bis zur Zerstörung): zerstoerer (Kha'ak), fregatte (Piraten), xenonk (Xenon K).
// Überlebensmodus (kein Frachter), ohne Mods; Blitzwaffen feuern im Takt auf den nächsten Gegner, andere Bordwaffen schweigen (gemessen werden die Türme).
// Für Vorher/Nachher zweimal laufen lassen – dieselben Zufallsstarts, also gepaarter Vergleich.
import { spawn } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const o = {
  lagen: arg('lagen', 'brut,zerstoerer').split(','), seeds: Number(arg('seeds', 12)), secs: Number(arg('secs', 60)),
  ship: arg('ship', 'cobra'), turret: arg('turret', 'neutron'), groups: arg('groups', '') ? arg('groups').split(',') : undefined,
  weapon: arg('weapon', 'stoerblitz'), gear: Number(arg('gear', 1)), level: Number(arg('level', 1)),
  guns: process.argv.includes('--guns'), noTurrets: process.argv.includes('--keine-tuerme'),
  onlyL: process.argv.includes('--nur-l'), lturret: arg('lturret', ''), flank: process.argv.includes('--flanke'),
};
const all = Array.from({ length: o.seeds }, (_, i) => 101 + i);
const n = Math.min(cpus().length, all.length);
const chunks = Array.from({ length: n }, (_, k) => all.filter((_, i) => i % n === k));
const t0 = Date.now();
const runs = chunks.map((seeds, k) => new Promise((ok, fail) => {
  const out = join(tmpdir(), `balance-${process.pid}-${k}.json`);
  const p = spawn('npx', ['vitest', 'run', 'tests/balance.worker.test.ts', '--reporter=dot'], {
    cwd: root, env: { ...process.env, BALANCE: JSON.stringify({ ...o, seeds, out }) }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  p.on('exit', (c) => { if (c) return fail(new Error(`Messlauf ${k} fehlgeschlagen`)); const r = JSON.parse(readFileSync(out, 'utf8')); rmSync(out); ok(r); });
}));
const parts = await Promise.all(runs);
const fmt = (xs, d = 0) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${m.toFixed(d)} (${Math.min(...xs).toFixed(d)}–${Math.max(...xs).toFixed(d)})`;
};
const UNIT = { sekunden: 's', abschuesse: '/min', erlitten: '/min' };
const NAME = { brut: 'Brutschiff-Strom', zerstoerer: 'Kha’ak-Zerstörer', spaeher: '16 Späher', jaeger: '8 Piraten-Jäger', piraten: 'Piratenwelle', xenon: 'Xenon-Welle', fregatte: 'Piratenfregatte', xenonk: 'Xenon K' };
console.log(`${o.ship} · ${o.noTurrets ? 'ohne Türme' : o.onlyL ? `nur L-Türme ${o.lturret || o.groups?.filter((x) => x.length).join('/') || ''}` : `Türme ${o.groups?.join('/') ?? o.turret}`} · ${o.weapon}${o.guns ? ' (Bordwaffen feuern)' : ''} · Ausrüstung ${o.gear} · Stufe ${o.level}${o.flank ? ' · Flanke' : ''} · ${o.seeds} Läufe · ${Math.round((Date.now() - t0) / 1000)} s`);
for (const lage of o.lagen) {
  const rows = parts.flatMap((p) => p[lage]);
  const keys = Object.keys(rows[0]);
  console.log(`  ${NAME[lage] ?? lage}: ${keys.map((k) => `${k} ${fmt(rows.map((r) => r[k]))} ${UNIT[k] ?? ''}`).join(' · ')}`);
}
