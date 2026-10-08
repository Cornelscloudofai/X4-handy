// Split-Sektoren rund um Familie Zhin. Rohstoffarten von Familie Zhin laut Egosoft-Wiki,
// Lage der Felder, Nachbarschaft und alle weiteren Sektoren sind schematisch für das Spiel.
import type { FactionId, Gate, NpcStationDef, SectorDef } from '../engine/types';

export const SECTOR_RADIUS = 200; // km, Eckpunkt-Abstand des Sektor-Sechsecks

export const FACTIONS: Record<FactionId, { name: string; short: string; color: string }> = {
  frf: { name: 'Freie Familien', short: 'FRF', color: '#ffb547' },
  zya: { name: 'Zyarth-Patriarchat', short: 'ZYA', color: '#ff6a5c' },
};

export const SECTORS: SectorDef[] = [
  {
    id: 'zhin', name: 'Familie Zhin', faction: 'frf', q: 0, r: 0, sunlight: 100,
    fields: [
      { id: 'zhin-ore', ware: 'ore', x: -115, z: -10, r: 34, richness: 1 },
      { id: 'zhin-silicon', ware: 'silicon', x: -40, z: -112, r: 30, richness: 1 },
      { id: 'zhin-ice', ware: 'ice', x: 55, z: -118, r: 26, richness: 1 },
      { id: 'zhin-hydrogen', ware: 'hydrogen', x: 122, z: 0, r: 32, richness: 1 },
      { id: 'zhin-helium', ware: 'helium', x: -95, z: 95, r: 30, richness: 1 },
      { id: 'zhin-methane', ware: 'methane', x: 62, z: 105, r: 30, richness: 1 },
      { id: 'zhin-nividium', ware: 'nividium', x: -22, z: 72, r: 18, richness: 0.8 },
    ],
    tradeStation: { name: 'Zhin-Handelsposten', x: 25, z: -40 },
    npcStations: [
      { id: 'zhin-werft', name: 'Zhin-Werft', kind: 'wharf', x: 95, z: 50, buys: ['hullparts', 'claytronics', 'engineparts', 'advancedcomposites', 'scanningarrays', 'smartchips', 'dronecomponents', 'antimatterconverters', 'energycells'] },
      { id: 'zhin-wacht', name: 'Grenzposten Zhin', kind: 'defence', x: -80, z: 40, buys: ['weaponscomponents', 'turretcomponents', 'missilecomponents', 'shieldcomponents', 'medicalsupplies', 'cheltmeat', 'energycells'] },
      { id: 'zhin-huette', name: 'Zhin-Metallhütte', kind: 'factory', x: 80, z: -60, buys: ['ore', 'silicon', 'refinedmetals', 'graphene', 'energycells'], makes: ['refinedmetals', 'hullparts', 'siliconwafers'] },
    ],
    links: ['tkr', 'rhy', 'hoa', 'cascade'], licenseCost: 0, repRequired: 0,
    description: 'Heimat der Familie Zhin. Nach dem Xenon-Angriff wird jede Fabrik gebraucht.',
    surplus: ['ore', 'silicon', 'energycells'], demand: ['refinedmetals', 'hullparts', 'engineparts'],
  },
  {
    id: 'tkr', name: 'Familie Tkr', faction: 'frf', q: 1, r: -1, sunlight: 80,
    fields: [
      { id: 'tkr-ore', ware: 'ore', x: -60, z: -80, r: 44, richness: 1.4 },
      { id: 'tkr-silicon', ware: 'silicon', x: 90, z: -60, r: 36, richness: 1.25 },
      { id: 'tkr-ice', ware: 'ice', x: -70, z: 95, r: 26, richness: 1 },
      { id: 'tkr-nividium', ware: 'nividium', x: 70, z: 90, r: 26, richness: 1.1 },
    ],
    tradeStation: { name: 'Tkr-Werft', x: 10, z: 20 },
    npcStations: [
      { id: 'tkr-schmiede', name: 'Tkr-Schmiede', kind: 'factory', x: -20, z: -10, buys: ['ore', 'refinedmetals', 'graphene', 'siliconwafers', 'energycells'], makes: ['hullparts', 'refinedmetals', 'scanningarrays'] },
      { id: 'tkr-wacht', name: 'Tkr-Wachstation', kind: 'defence', x: 100, z: 20, buys: ['weaponscomponents', 'turretcomponents', 'missilecomponents', 'cheltmeat', 'scruffinfruit', 'energycells'] },
    ],
    links: ['zhin', 'cascade', 'ravine'], licenseCost: 4_000_000, repRequired: 4,
    description: 'Erzreiche Felder und eine hungrige Werft. Wenig Sonne.',
    surplus: ['ore', 'teladianium'], demand: ['hullparts', 'claytronics', 'siliconwafers', 'microchips', 'scanningarrays'],
  },
  {
    id: 'cascade', name: "Tharka's Cascade XV", faction: 'frf', q: 1, r: 0, sunlight: 140,
    fields: [
      { id: 'cascade-hydrogen', ware: 'hydrogen', x: -60, z: -100, r: 44, richness: 1.3 },
      { id: 'cascade-helium', ware: 'helium', x: 100, z: -40, r: 40, richness: 1.3 },
      { id: 'cascade-methane', ware: 'methane', x: -20, z: 100, r: 42, richness: 1.2 },
      { id: 'cascade-ice', ware: 'ice', x: 110, z: 80, r: 26, richness: 1 },
    ],
    tradeStation: { name: 'Kaskaden-Raffinerie', x: 20, z: -10 },
    npcStations: [
      { id: 'cascade-werft', name: 'Kaskaden-Werft', kind: 'wharf', x: -90, z: 20, buys: ['hullparts', 'engineparts', 'claytronics', 'plasmaconductors', 'fieldcoils', 'energycells'] },
      { id: 'cascade-elektronik', name: 'Tharka-Elektronikwerk', kind: 'factory', x: 60, z: 60, buys: ['siliconwafers', 'graphene', 'superfluidcoolant', 'microchips', 'quantumtubes', 'energycells'], makes: ['microchips', 'quantumtubes', 'advancedelectronics'] },
    ],
    links: ['zhin', 'tkr'], licenseCost: 6_000_000, repRequired: 8,
    description: 'Gasnebel und 140 % Sonnenlicht – ideal für Solarkraftwerke.',
    surplus: ['hydrogen', 'helium', 'methane'], demand: ['energycells', 'graphene', 'antimattercells', 'plasmaconductors'],
  },
  {
    id: 'ravine', name: "Tharka's Ravine XVI", faction: 'frf', q: 0, r: -1, sunlight: 60,
    fields: [
      { id: 'ravine-nividium', ware: 'nividium', x: -40, z: -60, r: 38, richness: 1.6 },
      { id: 'ravine-ore', ware: 'ore', x: 100, z: -30, r: 38, richness: 1.3 },
      { id: 'ravine-silicon', ware: 'silicon', x: -60, z: 60, r: 36, richness: 1.5 },
    ],
    tradeStation: { name: 'Schluchtwacht', x: 30, z: -90 },
    npcStations: [
      { id: 'ravine-bastion', name: 'Schluchtbastion', kind: 'defence', x: 60, z: 60, buys: ['weaponscomponents', 'turretcomponents', 'shieldcomponents', 'missilecomponents', 'foodrations', 'medicalsupplies', 'energycells'] },
    ],
    links: ['tkr', 'rhy'], licenseCost: 9_000_000, repRequired: 12,
    description: 'Dunkel, gefährlich und reich an Nividium.',
    surplus: ['silicon', 'nividium'], demand: ['foodrations', 'medicalsupplies', 'weaponscomponents', 'turretcomponents'],
  },
  {
    id: 'rhy', name: "Rhy's Defiance", faction: 'zya', q: -1, r: 0, sunlight: 110,
    fields: [
      { id: 'rhy-ore', ware: 'ore', x: 60, z: -90, r: 34, richness: 1.1 },
      { id: 'rhy-hydrogen', ware: 'hydrogen', x: -100, z: -20, r: 40, richness: 1.1 },
      { id: 'rhy-helium', ware: 'helium', x: 40, z: 100, r: 34, richness: 1 },
    ],
    tradeStation: { name: 'Patriarchenhafen', x: 10, z: 10 },
    npcStations: [
      { id: 'rhy-werft', name: 'Patriarchenwerft', kind: 'wharf', x: -60, z: 70, buys: ['hullparts', 'engineparts', 'claytronics', 'shieldcomponents', 'weaponscomponents', 'advancedelectronics'] },
      { id: 'rhy-raffinerie', name: 'Rhy-Raffinerie', kind: 'factory', x: 80, z: 20, buys: ['ore', 'hydrogen', 'refinedmetals', 'antimattercells', 'energycells'], makes: ['refinedmetals', 'antimattercells', 'engineparts'] },
    ],
    links: ['zhin', 'zyarth', 'ravine'], licenseCost: 5_000_000, repRequired: 3,
    description: 'Grenzsektor des Zyarth-Patriarchats. Die Flotte braucht Nachschub.',
    surplus: ['hydrogen', 'energycells'], demand: ['antimattercells', 'engineparts', 'missilecomponents', 'shieldcomponents'],
  },
  {
    id: 'hoa', name: 'Heart of Acrimony II', faction: 'zya', q: 0, r: 1, sunlight: 90,
    fields: [
      { id: 'hoa-ice', ware: 'ice', x: -60, z: -30, r: 38, richness: 1.4 },
      { id: 'hoa-methane', ware: 'methane', x: 100, z: 20, r: 40, richness: 1.3 },
      { id: 'hoa-silicon', ware: 'silicon', x: -40, z: 100, r: 30, richness: 1 },
    ],
    tradeStation: { name: 'Acrimony-Markt', x: 20, z: -20 },
    npcStations: [
      { id: 'hoa-habitat', name: 'Acrimony-Habitat', kind: 'habitat', x: 80, z: -70, buys: ['foodrations', 'medicalsupplies', 'spacefuel', 'water', 'cheltmeat', 'scruffinfruit', 'energycells'] },
      { id: 'hoa-chemie', name: 'Acrimony-Chemiewerk', kind: 'factory', x: 60, z: 80, buys: ['methane', 'graphene', 'superfluidcoolant', 'energycells'], makes: ['graphene', 'plasmaconductors', 'quantumtubes'] },
    ],
    links: ['zhin', 'zyarth'], licenseCost: 7_000_000, repRequired: 6,
    description: 'Eis und Methan im Überfluss. Die Bevölkerung verlangt nach Nahrung.',
    surplus: ['ice', 'methane', 'water'], demand: ['cheltmeat', 'scruffinfruit', 'foodrations', 'spacefuel', 'quantumtubes'],
  },
  {
    id: 'zyarth', name: "Zyarth's Dominion I", faction: 'zya', q: -1, r: 1, sunlight: 120,
    fields: [
      { id: 'zyarth-ore', ware: 'ore', x: -100, z: -40, r: 36, richness: 1.1 },
      { id: 'zyarth-silicon', ware: 'silicon', x: 80, z: -90, r: 32, richness: 1.1 },
      { id: 'zyarth-methane', ware: 'methane', x: 60, z: 110, r: 34, richness: 1.1 },
      { id: 'zyarth-hydrogen', ware: 'hydrogen', x: -60, z: 110, r: 30, richness: 1 },
    ],
    tradeStation: { name: 'Thron des Patriarchen', x: 0, z: 0 },
    npcStations: [
      { id: 'zyarth-werft', name: 'Thronwerft', kind: 'wharf', x: -60, z: 50, buys: ['claytronics', 'advancedelectronics', 'dronecomponents', 'fieldcoils', 'hullparts', 'engineparts'] },
      { id: 'zyarth-arsenal', name: 'Zyarth-Arsenal', kind: 'defence', x: 80, z: 20, buys: ['weaponscomponents', 'turretcomponents', 'shieldcomponents', 'missilecomponents', 'energycells'] },
    ],
    links: ['rhy', 'hoa'], licenseCost: 12_000_000, repRequired: 12,
    description: 'Hauptwelt des Patriarchats. Höchste Preise für Schiffstechnik.',
    surplus: ['refinedmetals', 'graphene'], demand: ['advancedelectronics', 'claytronics', 'dronecomponents', 'fieldcoils', 'shieldcomponents', 'weaponscomponents'],
  },
];

export const SECTOR_MAP: Record<string, SectorDef> = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

export const NPC_STATIONS: (NpcStationDef & { sector: string })[] = SECTORS.flatMap((s) => s.npcStations.map((n) => ({ ...n, sector: s.id })));
export const NPC_MAP: Record<string, NpcStationDef & { sector: string }> = Object.fromEntries(NPC_STATIONS.map((n) => [n.id, n]));

/** Ort, Name und Sektor eines Marktes (Handelsposten = Sektor-ID, sonst NPC-Station) */
export function marketInfo(key: string): { sector: string; name: string; x: number; z: number; npc: boolean } {
  const n = NPC_MAP[key];
  if (n) return { sector: n.sector, name: n.name, x: n.x, z: n.z, npc: true };
  const s = SECTOR_MAP[key];
  return { sector: key, name: s.tradeStation.name, x: s.tradeStation.x, z: s.tradeStation.z, npc: false };
}

export function sector(id: string): SectorDef {
  const s = SECTOR_MAP[id];
  if (!s) throw new Error('Unbekannter Sektor: ' + id);
  return s;
}

/** Winkel (Bildschirm, y nach unten) der Sechseck-Seite, die zum Nachbarn zeigt (flache Oberkante). */
function sideAngle(dq: number, dr: number): number {
  const key = `${dq},${dr}`;
  const map: Record<string, number> = { '0,-1': -90, '1,-1': -30, '1,0': 30, '0,1': 90, '-1,1': 150, '-1,0': 210 };
  const a = map[key];
  if (a === undefined) throw new Error('Keine Nachbarn: ' + key);
  return (a * Math.PI) / 180;
}

export function gatesOf(id: string): Gate[] {
  const s = sector(id);
  const apothem = (SECTOR_RADIUS * Math.sqrt(3)) / 2;
  return s.links.map((to) => {
    const t = sector(to);
    const angle = sideAngle(t.q - s.q, t.r - s.r);
    const d = apothem * 0.9;
    return { to, x: Math.cos(angle) * d, z: Math.sin(angle) * d, angle };
  });
}

export function gate(from: string, to: string): Gate {
  const g = gatesOf(from).find((x) => x.to === to);
  if (!g) throw new Error(`Kein Tor von ${from} nach ${to}`);
  return g;
}

/** Kürzester Pfad über Sprungtore (Breitensuche) */
export function sectorPath(from: string, to: string): string[] {
  if (from === to) return [from];
  const prev: Record<string, string> = {};
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of sector(cur).links) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev[n] = cur;
      if (n === to) {
        const path = [to];
        let c = to;
        while (prev[c]) { c = prev[c]; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return [from];
}

export function hexCorners(radius: number): { x: number; z: number }[] {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    out.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius });
  }
  return out;
}

export function insideHex(x: number, z: number, radius: number): boolean {
  const ax = Math.abs(x), az = Math.abs(z);
  const apothem = (radius * Math.sqrt(3)) / 2;
  if (az > apothem) return false;
  return apothem * radius - apothem * ax - (radius / 2) * az >= 0;
}
