// Baukosten der Split-Kampfschiffe (S und M) aus dem Spieldaten-Auszug crissian/x4: Rumpfpreis und -material,
// Hülle, Plätze und Standardausrüstung (Kampftriebwerke, Schilde, Steuerdüsen, Pulslaser, Puls-Lasertürme, Täuschkörper) mit
// Preis und Material – im selben Aufbau wie shipdata.json der Frachter und Miner.
// Die Datendateien werden nur als Text gelesen (keine fremde Ausführung).
// Aufruf: git clone --depth 1 https://github.com/crissian/x4 /tmp/cx && node scripts/extract-military-build.mjs /tmp/cx
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '/tmp/cx';
const dir = path.join(root, 'src/app/shared/services/data');
const shipsTxt = fs.readFileSync(path.join(dir, 'ships-data.ts'), 'utf8');
const eqTxt = fs.readFileSync(path.join(dir, 'equipment-data.ts'), 'utf8');

/** Datensatz mit dieser Kennung als Text (vom „id:“ bis zum nächsten „id:“ auf gleicher Ebene) */
function record(txt, id) {
  const i = txt.indexOf(`id: '${id}'`);
  if (i < 0) throw new Error('Fehlt: ' + id);
  const j = txt.indexOf("\n  {", i);
  const k = txt.indexOf('\n\t{', i);
  const end = [j, k].filter((x) => x > 0).reduce((a, b) => Math.min(a, b), txt.length);
  return txt.slice(i, end);
}
const num = (rec, re) => Number(rec.match(re)?.[1] ?? 0);
/** Material der ersten Fertigung */
function materials(rec) {
  const p = rec.indexOf('production');
  if (p < 0) return [];
  const w = rec.slice(p).match(/wares:\s*\[([\s\S]*?)\]/);
  return w ? [...w[1].matchAll(/ware:\s*'(\w+)',\s*amount:\s*(\d+)/g)].map((m) => ({ ware: m[1] === 'weaponcomponents' ? 'weaponscomponents' : m[1], amount: Number(m[2]) })) : [];
}
const count = (rec, key, filter = () => true) => {
  const m = rec.match(new RegExp(`\\n\\s*${key}:\\s*\\[([\\s\\S]*?)\\n\\s*\\],`));
  return m ? m[1].split('\n').filter((l) => l.includes('size:') && filter(l)).length : 0;
};
function equip(id, name, n) {
  const r = record(eqTxt, id);
  return { id, name, count: n, price: num(r, /avg:\s*([\d.]+)/), materials: materials(r) };
}

const PICK = {
  jaguar: 'ship_spl_s_scout_01_a',
  mamba: 'ship_spl_s_fighter_01_a',
  asp: 'ship_spl_s_fighter_02_a',
  chimera: 'ship_spl_s_heavyfighter_01_a',
  balaur: 'ship_spl_s_heavyfighter_02_a',
  dragon: 'ship_spl_m_corvette_01_a',
  cobra: 'ship_spl_m_frigate_01_a',
};
const out = {};
for (const [key, id] of Object.entries(PICK)) {
  const r = record(shipsTxt, id);
  const size = r.match(/size:\s*Size\.(\w+)/)[1];
  const z = size === 'small' ? 's' : 'm';
  const engines = count(r, 'engines');
  const shields = count(r, 'shields');
  const guns = count(r, 'weapons', (l) => !l.includes('missile'));
  const launchers = count(r, 'weapons', (l) => l.includes('missile'));
  const turrets = count(r, 'turrets');
  const equipment = [
    equip(`engine_spl_${z}_combat_01_mk1`, 'Kampftriebwerk Mk1', engines),
    equip(`shield_spl_${z}_standard_01_mk1`, 'Schildgenerator Mk1', shields),
    equip(`thruster_gen_${z}_allround_01_mk1`, `Steuerdüsen ${z.toUpperCase()} Mk1`, 1),
    ...(guns ? [equip(`weapon_gen_${z}_laser_01_mk1`, `Pulslaser ${z.toUpperCase()} Mk1`, guns)] : []),
    ...(turrets ? [equip('turret_spl_m_laser_01_mk1', 'Puls-Laserturm M Mk1', turrets)] : []),
    equip('countermeasure_flares_01', 'Täuschkörper', 5),
  ].filter((e) => e.count > 0);
  out[key] = {
    x4Id: id,
    name: r.match(/name:\s*'([^']+)'/)[1],
    size: z.toUpperCase(),
    hull: num(r, /\n\s*hull:\s*(\d+)/),
    /** Reisetempo laut Datensatz (anderer Maßstab als travelSpeed der Frachter; im Spiel umgerechnet) */
    travel: Math.round(num(r, /travel:\s*\{\s*speed:\s*([\d.]+)/)),
    crew: num(r, /people:\s*(\d+)/),
    missiles: num(r, /missile:\s*(\d+)/),
    hullPrice: num(r, /avg:\s*([\d.]+)/),
    hullMaterials: materials(r),
    slots: { engines, shields, weapons: guns, launchers, turrets },
    equipment,
  };
}
const file = new URL('../src/data/militarydata.json', import.meta.url);
fs.writeFileSync(file, JSON.stringify({ source: 'github.com/crissian/x4 (Spieldaten-Auszug), ausgelesen mit scripts/extract-military-build.mjs', ships: out }, null, 1));
for (const [k, v] of Object.entries(out)) {
  const total = v.hullPrice + v.equipment.reduce((a, e) => a + e.count * e.price, 0);
  console.log(k.padEnd(8), v.name.padEnd(8), v.size, 'Hülle', v.hull, 'Preis', Math.round(total), 'Rumpf', JSON.stringify(v.hullMaterials), JSON.stringify(v.slots));
}
