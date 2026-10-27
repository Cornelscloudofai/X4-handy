// Neue Sektoren ins Spiel einhängen: Entdeckte und schon ausgebaute Sektoren (data/frontierSectors.ts) kommen in
// SECTORS/SECTOR_MAP, ihre NPC-Stationen in NPC_STATIONS, und die Tore zu den Nachbarn werden in beide Richtungen
// verbunden. Alles andere (Märkte, Händler, Aufträge, Karte) sieht sie dann wie jeden anderen Sektor.
// Bei jedem neuen Spiel und Laden wird erst alles entfernt und dann passend zum Spielstand neu eingehängt.
import { FRONTIER, FRONTIER_MAP } from '../data/frontier';
import { FRONTIER_SECTORS } from '../data/frontierSectors';
import { NPC_MAP, NPC_STATIONS, SECTORS, SECTOR_MAP } from '../data/sectors';
import type { GameState, NpcStationDef } from './types';

/** Torverbindungen und NPC-Stationen der Split-Sektoren, bevor neue Sektoren eingehängt werden */
const BASE_LINKS: Record<string, string[]> = Object.fromEntries(SECTORS.map((s) => [s.id, [...s.links]]));
const BASE_NPC: Record<string, NpcStationDef[]> = Object.fromEntries(Object.values(FRONTIER_SECTORS).map((s) => [s.id, s.npcStations.filter((n) => !n.founded)]));

/** Entdeckte Sektoren, die schon spielbar sind (in Kartenreihenfolge) */
export function activeFrontier(state: Pick<GameState, 'frontier'> | null): string[] {
  const found = new Set(state?.frontier?.discovered ?? []);
  return FRONTIER.filter((f) => found.has(f.id) && FRONTIER_SECTORS[f.id]).map((f) => f.id);
}

export function syncFrontier(state: Pick<GameState, 'frontier'> | null): void {
  // alles Neue entfernen
  for (let i = SECTORS.length - 1; i >= 0; i--) if (FRONTIER_SECTORS[SECTORS[i].id]) SECTORS.splice(i, 1);
  for (const id of Object.keys(FRONTIER_SECTORS)) delete SECTOR_MAP[id];
  for (let i = NPC_STATIONS.length - 1; i >= 0; i--) if (FRONTIER_SECTORS[NPC_STATIONS[i].sector] && !NPC_STATIONS[i].founded) { delete NPC_MAP[NPC_STATIONS[i].id]; NPC_STATIONS.splice(i, 1); }
  for (const s of SECTORS) if (BASE_LINKS[s.id]) s.links = [...BASE_LINKS[s.id]];
  // entdeckte wieder einhängen
  const active = new Set(activeFrontier(state));
  for (const id of active) {
    const def = FRONTIER_SECTORS[id];
    def.links = FRONTIER_MAP[id].links.filter((l) => active.has(l) || BASE_LINKS[l]);
    def.npcStations = [...BASE_NPC[id]];
    SECTORS.push(def);
    SECTOR_MAP[id] = def;
    for (const n of BASE_NPC[id]) {
      const full = { ...n, sector: id };
      NPC_STATIONS.push(full);
      NPC_MAP[n.id] = full;
    }
    for (const l of def.links) if (BASE_LINKS[l] && !SECTOR_MAP[l].links.includes(id)) SECTOR_MAP[l].links.push(id);
  }
}
