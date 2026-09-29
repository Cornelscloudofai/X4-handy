// Split-Schiffe mit echten Daten aus dem Spieldaten-Auszug crissian/x4 (siehe shipdata.json):
// Frachtraum, Rumpfpreis, Ausrüstungsplätze, Schub und Luftwiderstand.
// Preis = Rumpf + Grundausstattung (Allround-Triebwerke Mk1, Schilde Mk1, bei Mineral-Minern Abbautürme Mk1).
// Reisegeschwindigkeit = Schub der Triebwerke / Luftwiderstand × Reiseschub-Faktor.
// Die Abbaurate ist ein Spielwert: sie hängt in X4 von Türmen, Drohnen und Feld ab.
import data from './shipdata.json';
import type { ShipClassDef } from '../engine/types';

interface RawShip {
  name: string; cargo: number; hullPrice: number; travelSpeed: number; speed: number; crew: number; hull: number;
  hullMaterials: { ware: string; amount: number }[];
  equipment: { id: string; name: string; count: number; price: number; materials: { ware: string; amount: number }[] }[];
}

const RAW = (data as unknown as { ships: Record<string, RawShip> }).ships;

const BASE: Omit<ShipClassDef, 'name' | 'capacity' | 'speed' | 'price' | 'parts' | 'materials' | 'maxSpeed' | 'hullPrice' | 'crew'>[] = [
  { id: 'alligator_min', role: 'miner', size: 'M', storage: 'Solid', miningRate: 14, description: 'M-Miner für Erz, Silizium, Eis und Nividium. Braucht ein Dock.' },
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
    for (const e of r.equipment) for (const m of e.materials) materials[m.ware] = (materials[m.ware] ?? 0) + m.amount * e.count;
    return { ...b, name: r.name, capacity: r.cargo, speed: r.travelSpeed / 1000, maxSpeed: r.speed, price, hullPrice: r.hullPrice, parts, materials, crew: r.crew };
  });
}

export const SHIP_CLASSES: ShipClassDef[] = build();

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
