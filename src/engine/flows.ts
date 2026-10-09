// Warenfluss: merkt sich, welche Mengen zuletzt wohin bewegt wurden (für die Flusslinien auf der Karte).
// Liegt neben dem Spielstand (wird nicht gespeichert) und klingt mit der Spielzeit ab.
import { SECTOR_MAP, gate, sectorPath } from '../data/sectors';
import { endpointPlace, fieldById, marketKey, stationById } from './logistics';
import type { GameState, TradeEndpoint } from './types';

export interface FlowEnd { key: string; sector: string; x: number; z: number }
export interface Flow {
  from: FlowEnd;
  to: FlowEnd;
  ware: string;
  /** Abklingende Summe der bewegten Einheiten */
  acc: number;
  /** Spielzeit der letzten Aktualisierung von acc */
  t: number;
  /** own = eigene Schiffe, npc = Händler der Fraktionen */
  kind: 'own' | 'npc';
}

/** Abklingzeit in Spielsekunden: ein Fluss wirkt etwa zwei Stunden nach */
const TAU = 2 * 3600;
const stores = new WeakMap<GameState, Map<string, Flow>>();

function storeOf(state: GameState): Map<string, Flow> {
  let m = stores.get(state);
  if (!m) stores.set(state, (m = new Map()));
  return m;
}

export function endOf(state: GameState, ep: TradeEndpoint): FlowEnd | null {
  const p = endpointPlace(state, ep);
  if (!p) return null;
  return { key: ep.kind === 'station' ? ep.id : 'm:' + marketKey(ep), ...p };
}

export function stationEnd(state: GameState, id: string): FlowEnd | null {
  const st = stationById(state, id);
  return st ? { key: st.id, sector: st.sector, x: st.x, z: st.z } : null;
}

export function fieldEnd(fieldId: string): FlowEnd | null {
  const f = fieldById(fieldId);
  return f ? { key: 'f:' + fieldId, sector: f.sector.id, x: f.field.x, z: f.field.z } : null;
}

/** Eine Lieferung vermerken */
export function recordFlow(state: GameState, from: FlowEnd | null, to: FlowEnd | null, ware: string, amount: number, kind: 'own' | 'npc' = 'own'): void {
  if (!from || !to || amount <= 0 || from.key === to.key) return;
  const store = storeOf(state);
  const key = `${from.key}>${to.key}:${ware}`;
  const f = store.get(key);
  if (f) {
    f.acc = f.acc * Math.exp(-(state.time - f.t) / TAU) + amount;
    f.t = state.time;
    f.from = from;
    f.to = to;
    return;
  }
  store.set(key, { from, to, ware, acc: amount, t: state.time, kind });
}

/** Einheiten pro Stunde (gleitender Wert) */
export function flowRate(f: Flow, now: number): number {
  return ((f.acc * Math.exp(-Math.max(0, now - f.t) / TAU)) * 3600) / TAU;
}

export interface FlowSeg {
  ware: string;
  /** Einheiten pro Stunde */
  rate: number;
  /** Volumen pro Stunde (m³) – bestimmt die Linienstärke */
  volume: number;
  ax: number; az: number;
  bx: number; bz: number;
  /** Endpunkte (Schlüssel) für Hervorhebung der ausgewählten Station */
  fromKey: string;
  toKey: string;
  kind: 'own' | 'npc';
  /** Gerade unterwegs (aktiver Auftrag), auch wenn noch nichts angekommen ist */
  active: boolean;
  /** Teilstück zu bzw. von einem Sprungtor */
  viaGate: boolean;
}

/** Ein Fluss im Sektor: Endpunkte außerhalb werden durch das Sprungtor auf dem Weg dorthin ersetzt */
export function segIn(sectorId: string, from: FlowEnd, to: FlowEnd): { ax: number; az: number; bx: number; bz: number; viaGate: boolean } | null {
  if (from.sector === sectorId && to.sector === sectorId) return { ax: from.x, az: from.z, bx: to.x, bz: to.z, viaGate: false };
  const path = sectorPath(from.sector, to.sector);
  const i = path.indexOf(sectorId);
  if (i < 0) return null;
  const a = i === 0 ? from : (() => { const g = gate(sectorId, path[i - 1]); return { x: g.x, z: g.z }; })();
  const b = i === path.length - 1 ? to : (() => { const g = gate(sectorId, path[i + 1]); return { x: g.x, z: g.z }; })();
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, viaGate: true };
}

/** Aktuelle Flüsse eines Sektors: gemessene Lieferungen plus laufende Aufträge eigener Schiffe */
export function sectorFlows(state: GameState, sectorId: string, volumeOf: (ware: string) => number): FlowSeg[] {
  if (!SECTOR_MAP[sectorId]) return [];
  const out = new Map<string, FlowSeg>();
  const add = (from: FlowEnd | null, to: FlowEnd | null, ware: string, rate: number, kind: 'own' | 'npc', active: boolean) => {
    if (!from || !to || from.key === to.key) return;
    const seg = segIn(sectorId, from, to);
    if (!seg) return;
    const key = `${from.key}>${to.key}:${ware}`;
    const hit = out.get(key);
    if (hit) {
      hit.rate += rate;
      hit.volume = hit.rate * volumeOf(ware);
      hit.active ||= active;
      return;
    }
    out.set(key, { ware, rate, volume: rate * volumeOf(ware), ...seg, fromKey: from.key, toKey: to.key, kind, active });
  };
  const store = storeOf(state);
  for (const [key, f] of store) {
    const rate = flowRate(f, state.time);
    if (rate < 0.5) {
      if (state.time - f.t > TAU * 4) store.delete(key);
      continue;
    }
    add(f.from, f.to, f.ware, rate, f.kind, false);
  }
  // Laufende Aufträge: Verbindung schon zeigen, bevor die erste Ladung ankommt
  for (const s of state.ships) {
    if (s.job) add(endOf(state, s.job.from), endOf(state, s.job.to), s.job.ware, 0, 'own', true);
    else if (s.mode === 'route' && s.route) add(endOf(state, s.route.from), endOf(state, s.route.to), s.route.ware, 0, 'own', true);
    if (s.miningField && s.cargo && s.home) add(fieldEnd(s.miningField), stationEnd(state, s.home), s.cargo.ware, 0, 'own', true);
  }
  return [...out.values()];
}

/** Nur für Tests: gemessene Flüsse leeren */
export function clearFlows(state: GameState): void {
  stores.delete(state);
}
