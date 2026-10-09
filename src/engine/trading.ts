// Handel: Pilotenrang (Autohandel), Gelegenheiten (Preisspitzen nur für eigene Befehle) und Stammkunden-Bonus für Routen
import { NPC_MAP, marketInfo, sector } from '../data/sectors';
import { WARES } from '../data/wares';
import { marketPrice, marketStock } from './economy';
import { knownSectors } from './logistics';
import type { GameState, Opportunity, Ship } from './types';

export type { Opportunity };
import { log, pick, rand } from './util';

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

/** Freier Autohandel: wie viele Sprünge vom Heimatsektor der Pilot handelt (Rang 1: nur dort) */
export const RANK_RANGE = [0, 0, 1, 2, 99, 99];
/** Freier Autohandel: aus wie vielen der besten Angebote der Pilot (zufällig, gewichtet) wählt – Rang 5 nimmt fast immer das beste */
export const RANK_CHOICE = [5, 5, 4, 3, 2, 1];

/** Freier Autohandel: Anteil des Laderaums, den der Pilot beim Einkauf füllt (vorsichtige Neulinge kaufen Teilladungen) */
export const RANK_LOAD = [0.35, 0.35, 0.5, 0.6, 0.7, 0.8];

/** Freier Autohandel: Anteil am Gewinn, den der Pilot für sich behält (er handelt dort auf eigene Faust) */
export const RANK_SHARE = [0.45, 0.45, 0.38, 0.32, 0.27, 0.22];

export function rankStars(r: number): string {
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

/** Nach jeder Fahrt: Rangaufstieg melden */
export function noteTrip(state: GameState, s: Ship): void {
  const r = pilotRank(s);
  if ((s.rank ?? 1) < r) {
    s.rank = r;
    log(state, `${s.name}: Pilot steigt auf Rang ${r} auf (${rankStars(r)}) – der Autohandel wird ${r >= 4 ? 'weitreichender und ' : r >= 2 ? 'weitreichender und ' : ''}geschickter.`, 'good', true);
  } else s.rank = r;
}

// ---------- Stammkunden-Bonus ----------

/** Je abgeschlossener Fahrt auf derselben Route +1 % beim Verkauf, höchstens +10 % */
export const STREAK_STEP = 0.01;
export const STREAK_MAX = 0.1;
export function streakBonus(streak = 0): number {
  return Math.min(STREAK_MAX, streak * STREAK_STEP);
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
 * Sonderpreis anwenden: Für eigene Befehle (Einzelkauf/-verkauf, Handelsroute, Lieferauftrag) gibt es auf die Menge, die
 * noch im Kontingent ist, den Preisfaktor. Rückgabe: zusätzliche Credits (positiv = Bonus beim Verkauf bzw. Rabatt beim Kauf).
 */
export function applyOpportunity(state: GameState, key: string, ware: string, kind: Opportunity['kind'], units: number, value: number): number {
  const o = activeOpportunity(state, key, ware, kind);
  if (!o || units <= 0) return 0;
  const n = Math.min(units, o.left);
  o.left -= n;
  const perUnit = value / units;
  const extra = kind === 'demand' ? n * perUnit * (o.mult - 1) : n * perUnit * (1 - o.mult);
  state.credits += extra;
  if (kind === 'demand') state.totals.sold += extra;
  if (o.left < 1) log(state, `Gelegenheit ausgeschöpft: ${WARES[ware].name} bei ${marketInfo(key).name}.`, 'info');
  return extra;
}

/** Ab und zu eine Gelegenheit: Eine Station zahlt kurz deutlich mehr oder ein Verkäufer räumt sein Lager günstig */
export function stepOpportunities(state: GameState, dt: number): void {
  state.opportunities = (state.opportunities ?? []).filter((o) => o.until > state.time && o.left >= 1);
  state.oppTimer = (state.oppTimer ?? 10 * 60) - dt;
  if (state.oppTimer > 0) return;
  state.oppTimer = (15 + rand(state) * 20) * 60;
  if (state.opportunities.length >= MAX_OPEN) return;
  const o = rand(state) < 0.6 ? demandOpportunity(state) : supplyOpportunity(state);
  if (!o) return;
  state.opportunities.push(o);
  const w = WARES[o.ware];
  const mins = Math.round((o.until - state.time) / 60);
  const name = marketInfo(o.key).name;
  log(state, o.kind === 'demand'
    ? `Gelegenheit: ${name} zahlt ${mins} min lang ×${o.mult.toFixed(1).replace('.', ',')} für ${w.name} (bis ${Math.round(o.left).toLocaleString('de-DE')} Einheiten) – Handel → ${w.name}.`
    : `Gelegenheit: ${name} verkauft ${mins} min lang ${w.name} für ${Math.round(o.mult * 100)} % des Preises (bis ${Math.round(o.left).toLocaleString('de-DE')} Einheiten) – Handel → ${w.name}.`, 'good', true);
}

function containerWare(id: string): boolean {
  return WARES[id]?.storage === 'Container';
}

function demandOpportunity(state: GameState): Opportunity | null {
  const cands: { key: string; ware: string }[] = [];
  for (const sec of knownSectors(state)) {
    for (const id of sector(sec).demand) if (containerWare(id)) cands.push({ key: sec, ware: id });
    for (const n of sector(sec).npcStations) for (const id of n.buys) if (containerWare(id)) cands.push({ key: n.id, ware: id });
  }
  // Nur Waren, die man in bekannten Sektoren auch kaufen kann
  const buyable = cands.filter((c) => knownSectors(state).some((sec) => (c.key !== sec && marketStock(state, sec, c.ware) > 100) || sector(sec).npcStations.some((n) => n.id !== c.key && n.makes?.includes(c.ware) && marketStock(state, n.id, c.ware) > 100)));
  const c = pick(state, buyable);
  if (!c || !state.markets[c.key]?.[c.ware]) return null;
  return {
    id: state.nextId++, key: c.key, ware: c.ware, kind: 'demand', mult: 1.5 + rand(state) * 0.5,
    left: Math.round(LOT / WARES[c.ware].volume), until: state.time + (30 + rand(state) * 30) * 60,
  };
}

function supplyOpportunity(state: GameState): Opportunity | null {
  const cands: { key: string; ware: string }[] = [];
  for (const sec of knownSectors(state)) {
    for (const id of Object.keys(state.markets[sec] ?? {})) if (containerWare(id) && marketStock(state, sec, id) > LOT / WARES[id].volume) cands.push({ key: sec, ware: id });
    for (const n of sector(sec).npcStations) for (const id of n.makes ?? []) if (containerWare(id) && marketStock(state, n.id, id) > LOT / WARES[id].volume) cands.push({ key: n.id, ware: id });
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
