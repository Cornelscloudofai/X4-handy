// Split-Schiffe mit echten Daten aus dem Spieldaten-Auszug crissian/x4 (siehe shipdata.json):
// Frachtraum, Rumpfpreis, Ausrüstungsplätze, Schub und Luftwiderstand.
// Preis = Rumpf + Grundausstattung (Allround-Triebwerke Mk1, Schilde Mk1, bei Mineral-Minern Abbautürme Mk1).
// Reisegeschwindigkeit = Schub der Triebwerke / Luftwiderstand × Reiseschub-Faktor.
// Die Abbaurate ist ein Spielwert: sie hängt in X4 von Türmen, Drohnen und Feld ab.
import data from './shipdata.json';
import military from './militarydata.json';
import type { ShipClassDef } from '../engine/types';

interface RawShip {
  name: string; cargo: number; hullPrice: number; travelSpeed: number; speed: number; crew: number; hull: number;
  hullMaterials: { ware: string; amount: number }[];
  equipment: { id: string; name: string; count: number; price: number; materials: { ware: string; amount: number }[] }[];
}

const RAW = (data as unknown as { ships: Record<string, RawShip> }).ships;

const BASE: Omit<ShipClassDef, 'name' | 'capacity' | 'speed' | 'price' | 'parts' | 'materials' | 'maxSpeed' | 'hullPrice' | 'crew'>[] = [
  { id: 'alligator_min', role: 'miner', size: 'M', storage: 'Solid', miningRate: 14, description: 'M-Miner für Erz, Silizium, Eis und Nividium. Braucht ein Dock.' },
  { id: 'tuatara_min', role: 'miner', size: 'S', storage: 'Solid', miningRate: 4, description: 'S-Miner für Erz, Silizium, Eis und Nividium. Klein und schnell, aber wenig Laderaum. Braucht ein Dock.' },
  { id: 'alligator_gas', role: 'miner', size: 'M', storage: 'Liquid', miningRate: 15, description: 'M-Gassammler für Wasserstoff, Helium und Methan. Braucht ein Dock.' },
  { id: 'wyvern_min', role: 'miner', size: 'L', storage: 'Solid', miningRate: 40, description: 'L-Miner mit großem Frachtraum. Braucht einen Pier.' },
  { id: 'wyvern_gas', role: 'miner', size: 'L', storage: 'Liquid', miningRate: 42, description: 'L-Gassammler mit hohem Durchsatz. Braucht einen Pier.' },
  { id: 'tuatara', role: 'trader', size: 'S', storage: 'Container', miningRate: 0, description: 'Kleiner Frachter für wertvolle Ladungen. Braucht ein Dock.' },
  { id: 'boa', role: 'trader', size: 'M', storage: 'Container', miningRate: 0, description: 'Transporter für Versorgungslinien und Handel. Braucht ein Dock.' },
  { id: 'buffalo', role: 'trader', size: 'L', storage: 'Container', miningRate: 0, description: 'Großfrachter für Massengüter, schnell im Reiseantrieb. Braucht einen Pier.' },
];

function build(): ShipClassDef[] {
  return BASE.map((b) => {
    const r = RAW[b.id];
    const parts = r.equipment.map((e) => ({ name: e.name, count: e.count, price: e.price }));
    const price = Math.round(r.hullPrice + r.equipment.reduce((sum, e) => sum + e.count * e.price, 0));
    // Baumaterial für den Eigenbau: Rumpf + Ausrüstung
    const materials: Record<string, number> = {};
    for (const m of r.hullMaterials) materials[m.ware] = (materials[m.ware] ?? 0) + m.amount;
    for (const e of r.equipment) for (const m of e.materials) {
      // X4 schreibt Waffenkomponenten „weaponcomponents“, die Warenliste des Spiels „weaponscomponents“ (nicht mit
      // Geschützkomponenten verwechseln – das ist eine eigene Ware)
      const ware = m.ware === 'weaponcomponents' ? 'weaponscomponents' : m.ware;
      materials[ware] = (materials[ware] ?? 0) + m.amount * e.count;
    }
    return { ...b, name: r.name, capacity: r.cargo, speed: r.travelSpeed / 1000, maxSpeed: r.speed, price, hullPrice: r.hullPrice, parts, materials, crew: r.crew };
  });
}

// ---- Kampfschiffe (Split, S und M) ----
// Rumpf, Preis und Material aus militarydata.json (scripts/extract-military-build.mjs), Tempo ohne Reiseantrieb und
// Typ aus den X4-9.0-Daten (docs/design/split-militaerschiffe.md). Das Reisetempo des Datensatzes hat einen anderen
// Maßstab als das der Frachter – umgerechnet mit dem Verhältnis der Tuatara (2 513 zu 6 369).

interface RawMil {
  name: string; size: 'S' | 'M'; hull: number; crew: number; missiles: number; travel: number; hullPrice: number;
  hullMaterials: { ware: string; amount: number }[];
  slots: { engines: number; shields: number; weapons: number; launchers: number; turrets: number };
  equipment: { id: string; name: string; count: number; price: number; materials: { ware: string; amount: number }[] }[];
}
const MIL = (military as unknown as { ships: Record<string, RawMil> }).ships;
const TRAVEL_SCALE = 2513 / 6369;
/** Schildkapazität je Generator (Split Mk1) */
const SHIELD_CAP = { S: 740, M: 3848 };
/** Schaden je Sekunde mit Salvenpausen: Pulslaser S/M, Puls-Laserturm M (18 × 8er-Salve, 3,8/s, 2,4 s Pause) */
const GUN_DPS = { S: 105, M: 154 }, TURRET_DPS = 32;
const MIL_INFO: Record<string, { type: string; v: number; description: string }> = {
  jaguar: { type: 'Aufklärer', v: 390, description: 'Schneller Aufklärer mit einer Bordkanone. Für Patrouillen über weite Strecken, nicht für schwere Gefechte.' },
  mamba: { type: 'Jäger', v: 330, description: 'Vielseitiger Jäger mit zwei Kanonen und zwei Schilden – das Arbeitstier der Split-Staffeln.' },
  asp: { type: 'Jäger', v: 347, description: 'Wendiger Jäger mit drei Kanonen, bei Söldnern beliebt. Mehr Hülle als die Mamba, ein Schild weniger.' },
  balaur: { type: 'Schwerer Jäger', v: 363, description: 'Schwerer Jäger der Freien Familien: vier Kanonen, schnell – „hart zuschlagen, dann weg“.' },
  chimera: { type: 'Schwerer Jäger', v: 394, description: 'Schwerer Jäger mit fünf Kanonen und großem Profil. Viel Feuerkraft für ein S-Schiff.' },
  dragon: { type: 'Korvette', v: 478, description: 'Korvette mit sechs Kanonen und zwei Türmen. Hält im Zweikampf gegen fast jedes Schiff stand.' },
  cobra: { type: 'Fregatte', v: 518, description: 'Fregatte mit vier Türmen und starker Hülle. Geleitschiff für Konvois und Stationswache.' },
};

function buildMilitary(): ShipClassDef[] {
  return Object.entries(MIL_INFO).map(([id, info]) => {
    const r = MIL[id];
    const parts = r.equipment.map((e) => ({ name: e.name, count: e.count, price: e.price }));
    const price = Math.round(r.hullPrice + r.equipment.reduce((sum, e) => sum + e.count * e.price, 0));
    const materials: Record<string, number> = {};
    for (const m of r.hullMaterials) materials[m.ware] = (materials[m.ware] ?? 0) + m.amount;
    for (const e of r.equipment) for (const m of e.materials) materials[m.ware] = (materials[m.ware] ?? 0) + m.amount * e.count;
    const shield = r.slots.shields * SHIELD_CAP[r.size];
    const dps = r.slots.weapons * GUN_DPS[r.size] + r.slots.turrets * TURRET_DPS;
    const power = Math.round(r.hull / 100 + shield / 50 + dps / 10);
    return {
      id, name: r.name, role: 'fighter' as const, size: r.size, storage: 'Container' as const, capacity: 0, miningRate: 0,
      speed: (r.travel * TRAVEL_SCALE) / 1000, maxSpeed: info.v, price, hullPrice: Math.round(r.hullPrice), parts, materials,
      crew: r.crew, description: info.description,
      combat: { type: info.type, hull: r.hull, shield, dps, power, guns: r.slots.weapons, turrets: r.slots.turrets, missiles: r.missiles },
    };
  });
}

export const SHIP_CLASSES: ShipClassDef[] = [...build(), ...buildMilitary()];

export const SHIP_MAP: Record<string, ShipClassDef> = Object.fromEntries(SHIP_CLASSES.map((s) => [s.id, s]));

export function shipClass(id: string): ShipClassDef {
  const s = SHIP_MAP[id];
  if (!s) throw new Error('Unbekannte Schiffsklasse: ' + id);
  return s;
}

/** Andockdauer in Sekunden je Schiffsgröße */
export const DOCK_TIME: Record<'S' | 'M' | 'L', number> = { S: 25, M: 40, L: 60 };

const PREFIX = ['ZHN', 'FRF', 'KRT', 'TKR', 'NYA'];
export function shipName(clsName: string, n: number): string {
  const base = clsName.split(' ')[0];
  return `${base} ${PREFIX[n % PREFIX.length]}-${String(100 + ((n * 37) % 900))}`;
}
