// Militärschiffe einer Rasse aus dem Spieldaten-Auszug crissian/x4 auslesen (Hülle, Triebwerke, Schilde, Waffenplätze,
// Türme, Raketen, Tempo mit Kampftriebwerk Mk1, Trägheit) – Grundlage für docs/design/split-militaerschiffe.md
// Aufruf: git clone --depth 1 https://github.com/crissian/x4 /tmp/cx && node scripts/extract-military.mjs spl
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = (process.env.X4DATA ?? '/tmp/cx') + '/src/app/shared/services/data';
const stub = `const P = new Proxy({}, { get: (t, k) => String(k) });
const Size = P, Races = P, ShipPurpose = P, ShipType = P, TurretType = P, CargoTypes = P, Factions = P, EquipmentType = P, EquipmentClass = P, TransportType = P, WareGroups = P, Effects = P;`;
async function load(file, name) {
  let src = fs.readFileSync(path.join(dir, file), 'utf8');
  src = src.replace(/^import .*$/gm, '').replace(/export const (\w+)\s*(:[^=]+)?=/g, 'export const $1 =');
  const tmp = `/tmp/x4m-${name}.mjs`; fs.writeFileSync(tmp, stub + src); return import(pathToFileURL(tmp).href);
}
const S = await load('ships-data.ts', 's'); const E = await load('equipment-data.ts', 'e');
const ships = Object.values(S).flatMap((v) => (Array.isArray(v) ? v : Object.values(v ?? {})));
const eqs = Object.values(E).flatMap((v) => (Array.isArray(v) ? v : Object.values(v ?? {})));
const filt = process.argv[2] ?? 'spl';
const sz = { small: 's', medium: 'm', large: 'l', extralarge: 'xl' };
const eng = (size, kind) => eqs.find((e) => e?.id === `engine_spl_${size}_${kind}_01_mk1`);
const rows = [];
for (const s of ships) {
  if (!s?.id?.includes(`_${filt}_`) || !['fight'].includes(s.purpose)) continue;
  const w = s.weapons ?? [], t = s.turrets ?? [];
  const wstd = w.filter((x) => (x.types ?? []).includes('standard')).length;
  const wmis = w.filter((x) => (x.types ?? []).length === 1 && x.types[0] === 'missile').length;
  const tz = {}; for (const x of t) { const k = sz[x.size] + (x.types?.join('/') ?? ''); tz[k] = (tz[k] ?? 0) + 1; }
  const es = sz[s.engines?.[0]?.size];
  const e = eng(es, 'combat') ?? eng(es, 'allround');
  const thrust = e?.thrust?.forward ?? e?.thrust ?? null;
  const v = thrust ? Math.round((thrust * (s.engines?.length ?? 1)) / s.drag.forward) : null;
  rows.push({ id: s.id, name: s.name, type: s.type, hull: s.hull, eng: `${s.engines?.length}×${es}`, shields: `${s.shields?.length}×${sz[s.shields?.[0]?.size] ?? '-'}`, weapons: `${w.length} (${wstd} Waffe${wmis ? `, ${wmis} nur Rakete` : ''})`, wsize: [...new Set(w.map((x) => sz[x.size]))].join('/'), turrets: Object.entries(tz).map(([k, n]) => `${n}×${k}`).join(' ') || '-', missiles: s.storage?.missile, mass: s.mass, drag: s.drag?.forward, yaw: s.inertia?.yaw, dyaw: s.drag?.yaw, v, docks: (s.docks ?? []).map((d) => `${d.capacity}×${sz[d.size] ?? d.size}`).join(' '), owners: (s.owners ?? []).join(','), crew: s.people });
}
rows.sort((a, b) => a.id.localeCompare(b.id));
for (const r of rows) console.log(JSON.stringify(r));
