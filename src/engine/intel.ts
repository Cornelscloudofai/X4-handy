// Marktwissen: Preise und Bestände kennt man nur, wo man Augen hat.
// Jeder Sektor hat vier Quadranten. Live sichtbar ist ein Quadrant mit eigener Station oder eigenem Satelliten.
// Sonst gilt die letzte Momentaufnahme – von einem Schiff, das dort angedockt hat oder nahe vorbeigeflogen ist.
// Gilt nur in neuen Spielen (mit Startwahl); alte Spielstände sehen wie bisher alles.
import { NPC_STATIONS, SECTORS, marketInfo } from '../data/sectors';
import { priceAt } from './economy';
import type { GameState } from './types';
import { log } from './util';

export const SAT_COST = 35_000;
/** Schiffe erfassen Stationen in diesem Umkreis (km) */
export const SCAN_RANGE = 15;
const SCAN_EVERY = 5;

export type Quadrant = 0 | 1 | 2 | 3;
export const QUADRANT_NAME = ['Nordwest', 'Nordost', 'Südwest', 'Südost'];

/** Quadrant eines Punkts (x nach rechts, z nach unten = Süden) */
export function quadrantOf(x: number, z: number): Quadrant {
  return ((x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0)) as Quadrant;
}

/** Wissen ist eingeschränkt (nur neue Spiele) */
export function limited(state: GameState): boolean {
  return !!state.start;
}

let coverCache: { at: number; n: number; set: Set<string> } | null = null;

/** Live abgedeckte Quadranten: eigene Stationen und Satelliten */
export function coveredQuadrants(state: GameState): Set<string> {
  const n = state.stations.length * 1000 + (state.satellites?.length ?? 0);
  if (coverCache && coverCache.at === state.time && coverCache.n === n) return coverCache.set;
  const set = new Set<string>();
  for (const st of state.stations) set.add(`${st.sector}:${quadrantOf(st.x, st.z)}`);
  for (const s of state.satellites ?? []) set.add(`${s.sector}:${s.q}`);
  coverCache = { at: state.time, n, set };
  return set;
}

export function quadrantCovered(state: GameState, sector: string, q: Quadrant): boolean {
  return !limited(state) || coveredQuadrants(state).has(`${sector}:${q}`);
}

/** Markt live sichtbar? */
export function isLive(state: GameState, key: string): boolean {
  if (!limited(state)) return true;
  const p = marketInfo(key);
  return coveredQuadrants(state).has(`${p.sector}:${quadrantOf(p.x, p.z)}`);
}

/** Markt bekannt (live oder mit Momentaufnahme)? */
export function knows(state: GameState, key: string): boolean {
  return !limited(state) || isLive(state, key) || !!state.intel?.[key];
}

/** Alter der Information in Sekunden (0 = live, null = unbekannt) */
export function intelAge(state: GameState, key: string): number | null {
  if (isLive(state, key)) return 0;
  const i = state.intel?.[key];
  return i ? state.time - i.t : null;
}

/** Momentaufnahme eines Markts festhalten (Andocken, Vorbeiflug, Lieferauftrag) */
export function noteMarket(state: GameState, key: string): void {
  if (!limited(state)) return;
  const m = state.markets[key];
  if (!m) return;
  const stock: Record<string, number> = {};
  for (const id in m) stock[id] = m[id].stock;
  const first = !state.intel?.[key];
  (state.intel ??= {})[key] = { t: state.time, stock };
  if (first) log(state, `Neue Station erfasst: ${marketInfo(key).name}.`, 'info');
}

/** Bekannter Bestand: live der echte, sonst die Momentaufnahme; null = unbekannt */
export function seenStock(state: GameState, key: string, ware: string): number | null {
  const m = state.markets[key]?.[ware];
  if (!m) return null;
  if (isLive(state, key)) return m.stock;
  const s = state.intel?.[key]?.stock[ware];
  return s ?? null;
}

/** Bekannter Preis (aus dem bekannten Bestand); null = unbekannt */
export function seenPrice(state: GameState, key: string, ware: string): number | null {
  const m = state.markets[key]?.[ware];
  const stock = seenStock(state, key, ware);
  if (!m || stock == null) return null;
  return priceAt(ware, stock / m.cap);
}

/** Bekannter freier Platz; null = unbekannt */
export function seenRoom(state: GameState, key: string, ware: string): number | null {
  const m = state.markets[key]?.[ware];
  const stock = seenStock(state, key, ware);
  return !m || stock == null ? null : Math.max(0, m.cap - stock);
}

/** Alle Marktschlüssel (Handelsposten und NPC-Stationen) */
export function allMarketKeys(): string[] {
  return [...SECTORS.map((s) => s.id), ...NPC_STATIONS.map((n) => n.id)];
}

/** Regelmäßig: eigene Schiffe erfassen Stationen in ihrer Nähe */
export function stepIntel(state: GameState, dt: number): void {
  if (!limited(state)) return;
  state.scanTimer = (state.scanTimer ?? 0) - dt;
  if (state.scanTimer > 0) return;
  state.scanTimer = SCAN_EVERY;
  const keys = allMarketKeys().filter((k) => state.markets[k]);
  for (const s of state.ships) {
    for (const key of keys) {
      const p = marketInfo(key);
      if (p.sector !== s.sector || Math.hypot(p.x - s.x, p.z - s.z) > SCAN_RANGE) continue;
      if (!isLive(state, key)) noteMarket(state, key);
    }
  }
}

/** Satellit aussetzen: deckt einen Quadranten live ab */
export function deploySatellite(state: GameState, sector: string, q: Quadrant): { ok: boolean; msg: string } {
  if (!limited(state)) return { ok: false, msg: 'In diesem Spielstand sind alle Märkte sichtbar.' };
  if (quadrantCovered(state, sector, q)) return { ok: false, msg: 'Dieser Quadrant ist schon abgedeckt.' };
  if (state.credits < SAT_COST) return { ok: false, msg: `Ein Satellit kostet ${SAT_COST.toLocaleString('de-DE')} Cr.` };
  state.credits -= SAT_COST;
  (state.satellites ??= []).push({ id: state.nextId++, sector, q });
  coverCache = null;
  log(state, `Satellit ausgesetzt: ${QUADRANT_NAME[q]}.`, 'good');
  return { ok: true, msg: `Satellit im Quadranten ${QUADRANT_NAME[q]} ausgesetzt – Preise dort sind jetzt live sichtbar.` };
}

/** Spielstart: Die Familie gibt dir einen (älteren) Marktbericht des Heimatsektors mit */
export function initIntel(state: GameState, sector: string): void {
  if (!limited(state)) return;
  for (const key of allMarketKeys()) if (state.markets[key] && marketInfo(key).sector === sector) {
    const m = state.markets[key];
    const stock: Record<string, number> = {};
    for (const id in m) stock[id] = m[id].stock;
    (state.intel ??= {})[key] = { t: state.time, stock };
  }
}
