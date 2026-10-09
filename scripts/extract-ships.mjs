// Liest Split-Schiffe und Standardausrüstung aus dem Datensatz crissian/x4 (Spieldaten-Auszug)
// Aufruf: node scripts/extract-ships.mjs <pfad-zu-crissian-x4>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? '/tmp/cx';
const dir = path.join(root, 'src/app/shared/services/data');
const stub = `const P = new Proxy({}, { get: (t, k) => String(k) });
const Size = P, Races = P, ShipPurpose = P, ShipType = P, TurretType = P, CargoTypes = P, Factions = P, EquipmentType = P, EquipmentClass = P, TransportType = P, WareGroups = P, Effects = P;`;
async function load(file, name) {
  let src = fs.readFileSync(path.join(dir, file), 'utf8');
  src = src.replace(/^import .*$/gm, '').replace(/export const (\w+)\s*(:[^=]+)?=/g, 'export const $1 =');
  const tmp = path.join(process.env.TMPDIR ?? '/tmp', `x4-${name}.mjs`);
  fs.writeFileSync(tmp, stub + src);
  return import(pathToFileURL(tmp).href);
}
const shipsMod = await load('ships-data.ts', 'ships');
const eqMod = await load('equipment-data.ts', 'eq');
const allShips = Object.values(shipsMod).flatMap((v) => (Array.isArray(v) ? v : Object.values(v ?? {})));
const allEq = Object.values(eqMod).flatMap((v) => (Array.isArray(v) ? v : Object.values(v ?? {})));
const ship = (id) => allShips.find((s) => s?.id === id);
const eq = (id) => allEq.find((e) => e?.id === id);
const sz = { small: 's', medium: 'm', large: 'l' };

const PICK = {
  tuatara: 'ship_spl_s_trans_container_01_a',
  boa: 'ship_spl_m_trans_container_01_a',
  buffalo: 'ship_spl_l_trans_container_01_a',
  tuatara_min: 'ship_spl_s_miner_solid_01_a',
  alligator_min: 'ship_spl_m_miner_solid_01_a',
  alligator_gas: 'ship_spl_m_miner_liquid_01_a',
  wyvern_min: 'ship_spl_l_miner_solid_01_a',
  wyvern_gas: 'ship_spl_l_miner_liquid_01_a',
};
const out = {};
for (const [key, id] of Object.entries(PICK)) {
  const s = ship(id);
  if (!s) throw new Error('Schiff fehlt: ' + id);
  const miner = s.type === 'miner' || s.purpose === 'mine';
  const parts = [];
  const add = (eqId, n, label) => {
    const e = eq(eqId);
    if (!e || !n) return null;
    parts.push({ id: eqId, name: label, count: n, price: e.price.avg, materials: e.production?.[0]?.wares ?? [] });
    return e;
  };
  const engSize = sz[s.engines[0]?.size] ?? sz[s.size];
  const engine = add(`engine_spl_${engSize}_allround_01_mk1`, s.engines.length, 'Allround-Triebwerk Mk1');
  add(`shield_spl_${sz[s.shields[0]?.size] ?? engSize}_standard_01_mk1`, s.shields.length, 'Schildgenerator Mk1');
  // Steuerdüsen (für jedes Schiff, Größe laut Rumpf)
  const thr = sz[s.thruster] ?? engSize;
  add(`thruster_gen_${thr}_allround_01_mk1`, 1, `Steuerdüsen ${thr.toUpperCase()} Mk1`);
  // Geschütztürme: Miner bestücken Abbau-Plätze mit Abbautürmen, alle übrigen Plätze bekommen Puls-Lasertürme
  const turrets = s.turrets ?? [];
  const mining = {}, laser = {};
  for (const t of turrets) {
    const z = sz[t.size];
    if (miner && (t.types ?? []).includes('mining')) mining[z] = (mining[z] ?? 0) + 1;
    else laser[z] = (laser[z] ?? 0) + 1;
  }
  if (miner) for (const t of (s.weapons ?? []).filter((w) => (w.types ?? []).includes('mining'))) mining[sz[t.size]] = (mining[sz[t.size]] ?? 0) + 1;
  for (const [z, n] of Object.entries(mining)) {
    // S-Miner tragen Abbaulaser als Waffe (keine Türme)
    if (!add(`turret_spl_${z}_mining_01_mk1`, n, `Abbauturm ${z.toUpperCase()} Mk1`)) add(`weapon_gen_${z}_mining_01_mk1`, n, `Abbaulaser ${z.toUpperCase()} Mk1`);
  }
  for (const [z, n] of Object.entries(laser)) add(`turret_spl_${z}_laser_01_mk1`, n, `Puls-Laserturm ${z.toUpperCase()} Mk1`);
  // Drohnen (nur Schiffe mit Drohnenplätzen): Miner Abbaudrohnen, Frachter Frachtdrohnen – halbe Kapazität
  const units = s.storage?.unit ?? 0;
  if (units) {
    const kind = miner ? (s.cargo?.[0]?.types?.[0] === 'liquid' ? 'ship_gen_s_miningdrone_liquid_01_a' : 'ship_gen_s_miningdrone_solid_01_a') : 'ship_gen_xs_cargodrone_empty_01_a';
    add(kind, Math.ceil(units / 2), miner ? 'Abbaudrohne' : 'Frachtdrohne');
  }
  // Täuschkörper (Flares) als Grundschutz
  add('countermeasure_flares_01', s.size === 'large' ? 10 : 5, 'Täuschkörper');
  const speed = engine ? (s.engines.length * engine.thrust.forward) / s.drag.forward : 0;
  out[key] = {
    x4Id: id,
    name: s.name,
    size: s.size,
    hull: s.hull,
    crew: s.people,
    cargo: s.cargo?.[0]?.max ?? 0,
    cargoType: s.cargo?.[0]?.types?.[0] ?? '',
    hullPrice: s.price.avg,
    hullMaterials: s.production?.[0]?.wares ?? [],
    equipment: parts,
    /** Höchstgeschwindigkeit m/s = Schub aller Triebwerke / Luftwiderstand vorwärts */
    speed: Math.round(speed),
    /** Reisemodus m/s = Höchstgeschwindigkeit × Reiseschub-Faktor des Triebwerks */
    travelSpeed: Math.round(speed * (engine?.travel?.thrust ?? 1)),
    slots: { engines: s.engines.length, shields: s.shields.length, weapons: s.weapons?.length ?? 0, turrets: s.turrets?.length ?? 0 },
  };
}
const target = path.resolve('src/data/shipdata.json');
fs.writeFileSync(target, JSON.stringify({ source: 'crissian/x4 (dev), Spieldaten-Auszug', ships: out }, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(14), v.name.padEnd(20), 'Rumpf', v.hullPrice, 'Ausrüstung', v.equipment.map((e) => `${e.count}×${e.name}`).join(', '), '| Fracht', v.cargo, v.cargoType, '| v', v.speed, 'm/s, Reise', v.travelSpeed, 'm/s');
