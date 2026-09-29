// Split-Schiffe. Frachtraum aus der Egosoft-Wiki; Preis, Tempo und Abbaurate sind Spielwerte.
import type { ShipClassDef } from '../engine/types';

export const SHIP_CLASSES: ShipClassDef[] = [
  { id: 'alligator_min', name: 'Alligator (Mineral)', role: 'miner', size: 'M', storage: 'Solid', capacity: 7000, speed: 2.2, miningRate: 14, price: 880_000, description: 'M-Miner für Erz, Silizium, Eis und Nividium. Braucht ein Dock.' },
  { id: 'alligator_gas', name: 'Alligator (Gas)', role: 'miner', size: 'M', storage: 'Liquid', capacity: 7600, speed: 2.2, miningRate: 15, price: 880_000, description: 'M-Gassammler für Wasserstoff, Helium und Methan. Braucht ein Dock.' },
  { id: 'wyvern_min', name: 'Wyvern (Mineral)', role: 'miner', size: 'L', storage: 'Solid', capacity: 20000, speed: 1.4, miningRate: 40, price: 3_150_000, description: 'L-Miner mit Sammlerdrohnen. Braucht einen Pier.' },
  { id: 'wyvern_gas', name: 'Wyvern (Gas)', role: 'miner', size: 'L', storage: 'Liquid', capacity: 22000, speed: 1.4, miningRate: 42, price: 3_150_000, description: 'L-Gassammler mit hohem Durchsatz. Braucht einen Pier.' },
  { id: 'tuatara', name: 'Tuatara', role: 'trader', size: 'S', storage: 'Container', capacity: 1350, speed: 3.6, miningRate: 0, price: 240_000, description: 'Schneller Kurier für kleine, wertvolle Ladungen. Braucht ein Dock.' },
  { id: 'boa', name: 'Boa', role: 'trader', size: 'M', storage: 'Container', capacity: 7500, speed: 2.4, miningRate: 0, price: 1_050_000, description: 'Transporter für Versorgungslinien und Handel. Braucht ein Dock.' },
  { id: 'buffalo', name: 'Buffalo', role: 'trader', size: 'L', storage: 'Container', capacity: 16000, speed: 1.5, miningRate: 0, price: 2_900_000, description: 'Großfrachter für Massengüter. Braucht einen Pier.' },
];

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
