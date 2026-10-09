// Handel: Pilotenrang (Autohandel), Gelegenheiten (Preisspitzen nur für eigene Befehle) und Stammkunden-Bonus für Routen
import { NPC_MAP, marketInfo, sector } from '../data/sectors';
import { WARES } from '../data/wares';
import { marketPrice, marketStock } from './economy';
import { knownSectors } from './logistics';
import type { GameState, Opportunity, Ship } from './types';

export type { Opportunity };
import { log, pick, rand } from './util';
import { knows } from './intel';
import { book } from './ledger';

// ---------- Pilotenrang ----------

/** Fahrten bis zum Rang 1–5 */
export const RANK_TRIPS = [0, 15, 40, 90, 180];

export function pilotRank(s: Ship): number {
  let r = 1;
  for (let i = 1; i < RANK_TRIPS.length; i++) if (s.trips >= RANK_TRIPS[i]) r = i + 1;
  return r;
}

/** Fahrten bis zum nächsten Rang (null = höchster Rang) */
export function tripsToNextRank(s: Ship): number | null {
  const r = pilotRank(s);
  return r >= 5 ? null : RANK_TRIPS[r] - s.trips;
}

/** Stationshändler: wie viele Sprünge vom Heimatsektor er für die Station handelt (Rang 1–2: nur dort, ab Rang 3: Nachbarsektoren) */
export const RANK_RANGE = [0, 0, 0, 1, 1, 1];



export function rankStars(r: number): string {
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

/** Nach jeder Fahrt: Rangaufstieg melden */
export function noteTrip(state: GameState, s: Ship): void {
  const r = pilotRank(s);
  if ((s.rank ?? 1) < r) {
    s.rank = r;
    log(state, `${s.name}: Pilot steigt auf Rang ${r} auf (${rankStars(r)}) – handelt für seine Station ${RANK_RANGE[r] ? 'jetzt auch in den Nachbarsektoren' : 'im Heimatsektor'}.`, 'good', true, { kind: 'ship', id: s.id });
  } else s.rank = r;
}

// ---------- Stammkunde: Beziehung zu einer Station ----------

/** Je Lieferung (ab einer kleinen Ladung) ein Punkt; je Punkt +1 % beim Verkauf dort, höchstens +10 % */
export const RELATION_STEP = 0.01;
export const RELATION_MAX = 0.1;
/** Ohne Lieferungen schläft die Beziehung ein: ein Punkt alle 6 Stunden */
const RELATION_DECAY = 6 * 3600;
/** Ladung, die für einen vollen Punkt zählt (m³) */
const RELATION_LOAD = 1000;

function relationPts(state: GameState, key: string): number {
  const r = state.relations?.[key];
  if (!r) return 0;
  return Math.max(0, r.pts - (state.time - r.t) / RELATION_DECAY);
}

/** Preisaufschlag beim Verkauf an diese Station (0–10 %) */
export function relationBonus(state: GameState, key: string): number {
  return Math.min(RELATION_MAX, Math.floor(relationPts(state, key)) * RELATION_STEP);
}

/** Nach einem Verkauf an eine Station: Beziehung wächst mit der gelieferten Menge (höchstens ein Punkt je Lieferung) */
export function noteDelivery(state: GameState, key: string, ware: string, units: number): void {
  if (!state.start) return;
  const pts = relationPts(state, key) + Math.min(1, (units * WARES[ware].volume) / RELATION_LOAD);
  (state.relations ??= {})[key] = { pts: Math.min(pts, RELATION_MAX / RELATION_STEP + 2), t: state.time };
}

/** Rückwärtskompatibel für Anzeigen alter Routen */
export function streakBonus(streak = 0): number {
  return Math.min(RELATION_MAX, streak * RELATION_STEP);
}

// ---------- Gelegenheiten ----------


const MAX_OPEN = 3;
/** Ladungsgröße, an der sich die Sondermenge orientiert (m³) */
const LOT = 3000;

export function activeOpportunity(state: GameState, key: string, ware: string, kind: Opportunity['kind']): Opportunity | undefined {
  return state.opportunities?.find((o) => o.key === key && o.ware === ware && o.kind === kind && o.left >= 1 && o.until > state.time);
}

/** Preis inklusive Gelegenheit – für Anzeigen und eigene Befehle (der freie Autohandel rechnet ohne) */
export function effectivePrice(state: GameState, key: string, ware: string, kind: Opportunity['kind']): number {
  const p = marketPrice(state, key, ware);
  const o = activeOpportunity(state, key, ware, kind);
  return o ? p * o.mult : p;
}

/**
 * Sonderpreis anwenden – nur für eine Fahrt, die das Sonderangebot ausdrücklich angenommen hat (job.opp).
 * Rückgabe: zusätzliche Credits (positiv = Rabatt beim Kauf bzw. Bonus beim Verkauf).
 */
export function applyOpportunity(state: GameState, key: string, ware: string, kind: Opportunity['kind'], units: number, value: number, oppId?: number): number {
  const o = activeOpportunity(state, key, ware, kind);
  if (!o || units <= 0 || oppId == null || o.id !== oppId) return 0;
  const n = Math.min(units, o.left);
  o.left -= n;
  const perUnit = value / units;
  const extra = kind === 'demand' ? n * perUnit * (o.mult - 1) : n * perUnit * (1 - o.mult);
  book(state, extra, 'trade', `Sonderangebot ${WARES[ware].name} · ${marketInfo(key).name}`, { kind: 'market', key });
  if (kind === 'demand') state.totals.sold += extra;
  if (o.left < 1) log(state, `Gelegenheit ausgeschöpft: ${WARES[ware].name} bei ${marketInfo(key).name}.`, 'info', false, { kind: 'market', key });
  return extra;
}

/** Ab und zu eine Gelegenheit: Eine Station zahlt kurz deutlich mehr oder ein Verkäufer räumt sein Lager günstig */
export function stepOpportunities(state: GameState, dt: number): void {
  state.opportunities = (state.opportunities ?? []).filter((o) => o.until > state.time && o.left >= 1);
  state.oppTimer = (state.oppTimer ?? 10 * 60) - dt;
  if (state.oppTimer > 0) return;
  state.oppTimer = (15 + rand(state) * 20) * 60;
  if (state.opportunities.length >= MAX_OPEN) return;
  // Hohe Nachfrage kommt als Lieferauftrag; Sonderangebote sind Lagerräumungen, die man zusagen muss
  const o = supplyOpportunity(state);
  if (!o) return;
  state.opportunities.push(o);
  const w = WARES[o.ware];
  const mins = Math.round((o.until - state.time) / 60);
  const name = marketInfo(o.key).name;
  log(state, `Sonderangebot: ${name} räumt ${mins} min lang ${w.name} für ${Math.round(o.mult * 100)} % des Preises (bis ${Math.round(o.left).toLocaleString('de-DE')} Einheiten) – antippen zum Kaufen.`, 'good', true, { kind: 'opp', id: o.id, key: o.key, ware: o.ware });
}

function containerWare(id: string): boolean {
  return WARES[id]?.storage === 'Container';
}

function supplyOpportunity(state: GameState): Opportunity | null {
  const cands: { key: string; ware: string }[] = [];
  for (const sec of knownSectors(state)) {
    if (!knows(state, sec)) continue;
    for (const id of Object.keys(state.markets[sec] ?? {})) if (containerWare(id) && marketStock(state, sec, id) > LOT / WARES[id].volume) cands.push({ key: sec, ware: id });
    for (const n of sector(sec).npcStations) if (knows(state, n.id)) for (const id of n.makes ?? []) if (containerWare(id) && marketStock(state, n.id, id) > LOT / WARES[id].volume) cands.push({ key: n.id, ware: id });
  }
  const c = pick(state, cands);
  if (!c) return null;
  const sells = !NPC_MAP[c.key] || !!NPC_MAP[c.key].makes?.includes(c.ware);
  if (!sells) return null;
  return {
    id: state.nextId++, key: c.key, ware: c.ware, kind: 'supply', mult: 0.5 + rand(state) * 0.15,
    left: Math.round(Math.min(LOT / WARES[c.ware].volume, marketStock(state, c.key, c.ware) * 0.5)), until: state.time + (30 + rand(state) * 30) * 60,
  };
}
