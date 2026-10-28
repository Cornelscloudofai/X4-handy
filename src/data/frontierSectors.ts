// Spielbare Sektoren des unbekannten Raums. Sie stehen erst in SECTORS/SECTOR_MAP, wenn sie entdeckt sind
// (engine/frontierSync.ts) – vorher gibt es dort keine Märkte, keine NPC-Schiffe und keine Tore.
// Lage (q, r) wie auf der Sektorenkarte; Torverbindungen kommen aus frontier.ts (nur zu schon spielbaren Sektoren).
import type { SectorDef } from '../engine/types';
import { FRONTIER_MAP } from './frontier';

type FrontierSector = Omit<SectorDef, 'q' | 'r' | 'links' | 'name' | 'description'>;

/** Gebiet 1: Die Glutsee */
const DEFS: Record<string, FrontierSector> = {
  'f-ausblick': {
    id: 'f-ausblick', faction: 'zya', sunlight: 70,
    fields: [
      { id: 'ausblick-ore', ware: 'ore', x: -90, z: -60, r: 28, richness: 0.8 },
      { id: 'ausblick-hydrogen', ware: 'hydrogen', x: 95, z: 70, r: 36, richness: 1 },
    ],
    tradeStation: { name: 'Horchposten Ausblick', x: 20, z: -10 },
    npcStations: [],
    licenseCost: 2_000_000, repRequired: 3,
    surplus: [], demand: ['foodrations', 'medicalsupplies', 'energycells', 'hullparts'],
  },
  'f-glut1': {
    id: 'f-glut1', faction: 'rhk', sunlight: 190,
    fields: [
      { id: 'glut1-hydrogen', ware: 'hydrogen', x: -100, z: 40, r: 44, richness: 1.6 },
      { id: 'glut1-helium', ware: 'helium', x: 80, z: -90, r: 38, richness: 1.4 },
      { id: 'glut1-ore', ware: 'ore', x: 70, z: 100, r: 26, richness: 0.9 },
    ],
    tradeStation: { name: 'Rhak-Sonnenwacht', x: -10, z: -30 },
    npcStations: [],
    licenseCost: 3_000_000, repRequired: 2,
    surplus: ['energycells', 'hydrogen', 'helium'], demand: ['hullparts', 'engineparts', 'foodrations'],
  },
  'f-asche': {
    id: 'f-asche', faction: 'rhk', sunlight: 40,
    fields: [
      { id: 'asche-ore', ware: 'ore', x: -60, z: -70, r: 46, richness: 2.2 },
      { id: 'asche-nividium', ware: 'nividium', x: 100, z: 60, r: 20, richness: 0.9 },
      { id: 'asche-silicon', ware: 'silicon', x: -80, z: 100, r: 30, richness: 1.2 },
    ],
    tradeStation: { name: 'Schürfposten 0041', x: 30, z: -10 },
    npcStations: [],
    licenseCost: 6_000_000, repRequired: 4,
    surplus: ['ore', 'silicon'], demand: ['energycells', 'foodrations', 'medicalsupplies', 'refinedmetals'],
  },
  'f-rhak': {
    id: 'f-rhak', faction: 'rhk', sunlight: 85,
    fields: [
      { id: 'rhak-ice', ware: 'ice', x: -110, z: -30, r: 34, richness: 1.1 },
      { id: 'rhak-methane', ware: 'methane', x: 90, z: 90, r: 36, richness: 1.2 },
    ],
    tradeStation: { name: 'Rhak-Halle', x: 0, z: 0 },
    npcStations: [
      { id: 'rhak-werft', name: 'Rhak-Werft', kind: 'wharf', x: -60, z: 80, buys: ['hullparts', 'engineparts', 'claytronics', 'scanningarrays', 'shieldcomponents', 'energycells'] },
      { id: 'rhak-siedlung', name: 'Rhak-Siedlung', kind: 'habitat', x: 90, z: -60, buys: ['medicalsupplies', 'foodrations', 'spacefuel', 'water', 'energycells'] },
    ],
    licenseCost: 9_000_000, repRequired: 8,
    surplus: ['methane', 'ice'], demand: ['medicalsupplies', 'engineparts', 'claytronics', 'advancedelectronics'],
  },
  'f-schmiede': {
    id: 'f-schmiede', faction: 'rhk', sunlight: 180, // schwankt mit dem Pulsar zwischen 60 und 300 % (engine/phenomena.ts)
    fields: [
      { id: 'schmiede-helium', ware: 'helium', x: 90, z: 40, r: 30, richness: 1.1 },
    ],
    tradeStation: { name: 'Kollektorring', x: -30, z: 20 },
    npcStations: [],
    licenseCost: 7_000_000, repRequired: 6,
    surplus: ['energycells'], demand: ['hullparts', 'refinedmetals', 'microchips'],
  },
};

/** Vollständige Sektordaten (Torverbindungen setzt frontierSync je nach Spielstand) */
export const FRONTIER_SECTORS: Record<string, SectorDef> = Object.fromEntries(Object.values(DEFS).map((d) => {
  const f = FRONTIER_MAP[d.id];
  return [d.id, { ...d, name: f.name, description: f.description, q: f.q, r: f.r, links: [] }];
}));

/** Ist dieser neue Sektor schon spielbar ausgebaut (sonst nur Karte und Forschungsakte)? */
export const playable = (id: string): boolean => !!FRONTIER_SECTORS[id];
