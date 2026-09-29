// Waren und Produktionsrezepte aus dem Community-Datensatz (X4: Foundations),
// ergänzt um deutsche Namen, Farben und die Solar-Energiezellen.
import raw from './wares.json';
import type { StorageType, WareDef, WareGroup } from '../engine/types';

interface RawWare {
  id: string; label: string; category: string; tier: number; storageType: string; volume: number;
  price: { min: number; avg: number; max: number }; cycleTime: number; batchSize: number;
  inputs: { wareID: string; amount: number }[]; isMined: boolean;
}

const DE: Record<string, string> = {
  helium: 'Helium', hydrogen: 'Wasserstoff', ice: 'Eis', methane: 'Methan', ore: 'Erz', rawscrap: 'Rohschrott',
  silicon: 'Silizium', nividium: 'Nividium', antimattercells: 'Antimateriezellen', computronicsubstrate: 'Computronisches Substrat',
  graphene: 'Graphen', metallicmicrolattice: 'Metall. Mikrogitter', proteinpaste: 'Proteinpaste',
  refinedmetals: 'Veredelte Metalle', scrapmetal: 'Schrottmetall', siliconwafers: 'Siliziumscheiben', stimulants: 'Stimulanzien',
  superfluidcoolant: 'Supraflüssiges Kühlmittel', teladianium: 'Teladianium', water: 'Wasser',
  advancedcomposites: 'Hochleistungsverbundstoffe', bogas: 'BoGas', cheltmeat: 'Chelt-Fleisch', engineparts: 'Antriebsteile',
  hullparts: 'Hüllenteile', majasnails: 'Maja-Schnecken', meat: 'Fleisch', microchips: 'Mikrochips', plankton: 'Plankton',
  plasmaconductors: 'Plasmaleiter', quantumtubes: 'Quantenröhren', scanningarrays: 'Scannerarrays', scruffinfruit: 'Scruffin-Früchte',
  siliconcarbide: 'Siliziumkarbid', smartchips: 'Smartchips', sojabeans: 'Sojabohnen', spices: 'Gewürze',
  sunriseflowers: 'Sonnenaufgangsblumen', swampplant: 'Sumpfpflanzen', terranmre: 'Terranische Feldrationen', wheat: 'Weizen',
  advancedelectronics: 'Hochleistungselektronik', antimatterconverters: 'Antimateriekonverter', bofu: 'BoFu', claytronics: 'Claytronik',
  dronecomponents: 'Drohnenkomponenten', fieldcoils: 'Feldspulen', foodrations: 'Nahrungsrationen', majadust: 'Majastaub',
  medicalsupplies: 'Medizinische Güter', missilecomponents: 'Raketenkomponenten', nostropoil: 'Nostropöl',
  shieldcomponents: 'Schildkomponenten', sojahusk: 'Sojahülsen', spacefuel: 'Raumsprit', spaceweed: 'Raumkraut',
  turretcomponents: 'Geschützkomponenten', weaponscomponents: 'Waffenkomponenten', energycells: 'Energiezellen',
};

const GROUP_BY_CATEGORY: Record<string, WareGroup> = {
  Minerals: 'mineral', Gases: 'gas', Ice: 'mineral', Energy: 'energy', Refined: 'refined', Water: 'refined',
  Hightech: 'hightech', Shiptech: 'shiptech', Food: 'food', Agricultural: 'agri', Pharmaceutical: 'pharma',
};

export const GROUP_LABEL: Record<WareGroup, string> = {
  mineral: 'Mineralien', gas: 'Gase', energy: 'Energie', refined: 'Veredelt', hightech: 'Hightech',
  shiptech: 'Schiffstechnik', food: 'Nahrung', agri: 'Agrar', pharma: 'Pharma',
};

export const GROUP_COLOR: Record<WareGroup, string> = {
  mineral: '#d9924a', gas: '#5fb4ff', energy: '#ffd44d', refined: '#ff9b62', hightech: '#3fe0c5',
  shiptech: '#b690ff', food: '#a6dc6e', agri: '#7fcf82', pharma: '#ff84c1',
};

const SPECIAL_COLOR: Record<string, string> = {
  ore: '#e0913d', silicon: '#b8c2cf', ice: '#a8e2ff', nividium: '#f0c75a', hydrogen: '#5a9dff', helium: '#9fd0ff',
  methane: '#46d8a6', energycells: '#ffd84d', rawscrap: '#a88f78',
};

function build(): Record<string, WareDef> {
  const out: Record<string, WareDef> = {};
  for (const w of Object.values(raw as Record<string, RawWare>)) {
    const group = GROUP_BY_CATEGORY[w.category] ?? 'refined';
    out[w.id] = {
      id: w.id,
      name: DE[w.id] ?? w.label,
      nameEn: w.label,
      group: w.id === 'rawscrap' ? 'mineral' : group,
      tier: w.tier,
      storage: w.storageType as StorageType,
      volume: w.volume,
      price: { ...w.price },
      cycle: w.cycleTime,
      batch: w.batchSize,
      inputs: w.inputs.map((i) => ({ ware: i.wareID, amount: i.amount })),
      mined: w.isMined,
      color: SPECIAL_COLOR[w.id] ?? GROUP_COLOR[group],
    };
  }
  // Solarkraftwerk: 175 Energiezellen je 60 s bei 100 % Sonnenlicht (keine Eingangswaren).
  out.energycells.cycle = 60;
  out.energycells.batch = 175;
  // Nividium fehlt im Datensatz – Preis als Schätzwert für das Spiel.
  out.nividium = {
    id: 'nividium', name: 'Nividium', nameEn: 'Nividium', group: 'mineral', tier: 0, storage: 'Solid', volume: 10,
    price: { min: 480, avg: 560, max: 650 }, cycle: 0, batch: 0, inputs: [], mined: true, color: SPECIAL_COLOR.nividium,
    estimated: true,
  };
  return out;
}

export const WARES = build();
export const WARE_IDS = Object.keys(WARES);

export function ware(id: string): WareDef {
  const w = WARES[id];
  if (!w) throw new Error('Unbekannte Ware: ' + id);
  return w;
}

/** Produktion pro Stunde eines Moduls (Energiezellen abhängig vom Sonnenlicht in %) */
export function outputPerHour(id: string, sunlight = 100): number {
  const w = WARES[id];
  if (!w || !w.cycle) return 0;
  const base = (w.batch * 3600) / w.cycle;
  return id === 'energycells' ? (base * sunlight) / 100 : base;
}

export function inputsPerHour(id: string): { ware: string; amount: number }[] {
  const w = WARES[id];
  if (!w || !w.cycle) return [];
  return w.inputs.map((i) => ({ ware: i.ware, amount: (i.amount * 3600) / w.cycle }));
}

export const STORAGE_LABEL: Record<StorageType, string> = { Container: 'Container', Solid: 'Feststoff', Liquid: 'Flüssig/Gas' };
