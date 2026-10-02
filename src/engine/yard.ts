// Eigene Werft: Schiffe aus eigenen Waren bauen – für die eigene Flotte oder auf Bestellung der Fraktionen.
import { MODULE_MAP } from '../data/modules';
import { FACTIONS, SECTOR_MAP } from '../data/sectors';
import { SHIP_CLASSES, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { addWare } from './economy';
import { stationById } from './logistics';
import { newShip } from './state';
import type { GameState, ShipOrder, Station } from './types';
import { emit, log, rand } from './util';

/** Bauzeit eines Schiffs in Sekunden (Spielwert; in X4 hängt sie von Rumpf und Ausrüstung ab) */
export const SHIP_BUILD_TIME: Record<'S' | 'M' | 'L', number> = { S: 6 * 60, M: 12 * 60, L: 30 * 60 };
export const MAX_YARD_QUEUE = 8;
const MAX_SHIPS = 60;

type Result = { ok: boolean; msg: string };

/** Schiffsgrößen, die eine Station bauen kann */
export function yardSizes(st: Station): Set<'S' | 'M' | 'L'> {
  const out = new Set<'S' | 'M' | 'L'>();
  for (const m of st.modules) {
    const y = MODULE_MAP[m.def]?.yardSize;
    if (y === 'M') { out.add('S'); out.add('M'); }
    if (y === 'L') out.add('L');
  }
  return out;
}

export function hasYard(st: Station): boolean {
  return st.modules.some((m) => MODULE_MAP[m.def]?.kind === 'shipyard');
}

export function yardStations(state: GameState): Station[] {
  return state.stations.filter(hasYard);
}

/** Warenwert des Baumaterials zum Durchschnittspreis */
export function materialValue(cls: string): number {
  let sum = 0;
  for (const [id, n] of Object.entries(SHIP_MAP[cls].materials)) sum += n * (WARES[id]?.price.avg ?? 0);
  return Math.round(sum);
}

/** Fehlendes Material für das nächste Schiff (Einheiten je Ware) */
export function missingFor(st: Station, cls: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(SHIP_MAP[cls].materials)) {
    const lack = n - (st.inventory[id] ?? 0);
    if (lack > 0.5) out[id] = Math.ceil(lack);
  }
  return out;
}

export function queueShipBuild(state: GameState, stationId: string, cls: string, order?: number): Result {
  const st = stationById(state, stationId);
  const c = SHIP_MAP[cls];
  if (!st || !c) return { ok: false, msg: 'Station oder Schiff nicht gefunden.' };
  if (!yardSizes(st).has(c.size)) return { ok: false, msg: c.size === 'L' ? 'Dafür braucht die Station eine L-Schiffsfertigung.' : 'Dafür braucht die Station eine S/M-Schiffsfertigung.' };
  st.yard ??= { queue: [], build: null };
  if (st.yard.queue.length >= MAX_YARD_QUEUE) return { ok: false, msg: `Höchstens ${MAX_YARD_QUEUE} Schiffe in der Warteschlange.` };
  st.yard.queue.push({ uid: state.nextId++, cls, order });
  return { ok: true, msg: `${c.name} in die Werft-Warteschlange gelegt.` };
}

export function cancelShipBuild(state: GameState, stationId: string, uid: number): Result {
  const st = stationById(state, stationId);
  if (!st?.yard) return { ok: false, msg: 'Keine Werft.' };
  const i = st.yard.queue.findIndex((j) => j.uid === uid);
  if (i < 0) return { ok: false, msg: 'Nicht gefunden.' };
  const [job] = st.yard.queue.splice(i, 1);
  // Eine abgebrochene Bestellung geht zurück an den Kunden (ohne Rufverlust, solange die Frist läuft)
  const o = job.order ? state.shipOrders?.find((x) => x.id === job.order) : undefined;
  if (o && o.status === 'active') { o.status = 'offer'; o.station = undefined; }
  return { ok: true, msg: 'Aus der Warteschlange entfernt.' };
}

export function stepYard(state: GameState, st: Station, dt: number): void {
  const y = st.yard;
  if (!y) return;
  if (!y.build) {
    const next = y.queue[0];
    if (!next) { y.waiting = ''; return; }
    const c = SHIP_MAP[next.cls];
    if (!yardSizes(st).has(c.size)) { y.waiting = 'Werftmodul fehlt'; return; }
    const lack = missingFor(st, next.cls);
    const ids = Object.keys(lack);
    if (ids.length) { y.waiting = 'Material fehlt: ' + ids.map((id) => WARES[id].name).join(', '); return; }
    if (!next.order && state.ships.length >= MAX_SHIPS) { y.waiting = `Flotte voll (${MAX_SHIPS} Schiffe)`; return; }
    for (const [id, n] of Object.entries(c.materials)) addWare(st, id, -n);
    y.queue.shift();
    y.waiting = '';
    const t = SHIP_BUILD_TIME[c.size];
    y.build = { ...next, remaining: t, total: t };
    return;
  }
  y.build.remaining -= dt;
  if (y.build.remaining > 1e-6) return;
  const job = y.build;
  y.build = null;
  const c = SHIP_MAP[job.cls];
  const order = job.order ? state.shipOrders?.find((o) => o.id === job.order) : undefined;
  if (order && order.status === 'active') {
    state.credits += order.price;
    st.income += order.price;
    state.totals.sold += order.price;
    state.rep[order.faction] = Math.min(30, state.rep[order.faction] + order.rep);
    order.status = 'done';
    state.totals.shipsSold = (state.totals.shipsSold ?? 0) + 1;
    log(state, `${st.name}: ${c.name} an ${FACTIONS[order.faction].short} übergeben · +${order.price.toLocaleString('de-DE')} Cr.`, 'good', true);
  } else {
    const ship = newShip(state, job.cls, st);
    state.ships.push(ship);
    state.totals.shipsBuilt = (state.totals.shipsBuilt ?? 0) + 1;
    if (c.size === 'L') state.totals.shipsBuiltL = (state.totals.shipsBuiltL ?? 0) + 1;
    log(state, `${st.name}: ${ship.name} (${c.name}) vom Stapel gelaufen.`, 'good', true);
  }
  emit({ type: 'shipBuilt', station: st.id, cls: job.cls });
}

// ---------- Schiffsbestellungen der Fraktionen ----------

const OFFER_TTL = 8 * 3600;
const ORDER_TIME = 36 * 3600;

export function stepShipOrders(state: GameState, dt: number): void {
  const yards = yardStations(state);
  state.shipOrders ??= [];
  for (const o of state.shipOrders) {
    if (o.status === 'offer' && state.time > o.deadline) o.status = 'failed';
    if (o.status === 'active' && state.time > o.deadline) {
      o.status = 'failed';
      state.rep[o.faction] = Math.max(-10, state.rep[o.faction] - 2);
      for (const st of state.stations) if (st.yard) st.yard.queue = st.yard.queue.filter((j) => j.order !== o.id);
      log(state, `Schiffsbestellung verfallen: ${SHIP_MAP[o.cls].name}. Ruf −2.`, 'bad', true);
    }
  }
  state.shipOrders = [...state.shipOrders.filter((o) => o.status === 'done' || o.status === 'failed').slice(-8), ...state.shipOrders.filter((o) => o.status === 'offer' || o.status === 'active')];
  if (!yards.length) return;
  state.shipOrderTimer = (state.shipOrderTimer ?? 20 * 60) - dt;
  if (state.shipOrderTimer > 0) return;
  state.shipOrderTimer = (60 + rand(state) * 60) * 60;
  if (state.shipOrders.filter((o) => o.status === 'offer').length >= 3) return;
  const sizes = new Set<string>();
  for (const st of yards) for (const s of yardSizes(st)) sizes.add(s);
  const pool = SHIP_CLASSES.filter((c) => sizes.has(c.size));
  if (!pool.length) return;
  const c = pool[Math.floor(rand(state) * pool.length)];
  const sectors = state.sectors.filter((id) => SECTOR_MAP[id]);
  const sec = sectors[Math.floor(rand(state) * sectors.length)] ?? 'zhin';
  const faction = SECTOR_MAP[sec].faction;
  const o: ShipOrder = {
    id: state.nextId++, faction, sector: sec, cls: c.id, price: Math.round((c.price * (0.9 + rand(state) * 0.2)) / 1000) * 1000,
    rep: c.size === 'L' ? 2 : 1, deadline: state.time + OFFER_TTL, status: 'offer',
  };
  state.shipOrders.push(o);
  log(state, `Schiffsbestellung: ${FACTIONS[faction].short} sucht eine ${c.name} (${o.price.toLocaleString('de-DE')} Cr).`, 'info', true);
}

export function acceptShipOrder(state: GameState, orderId: number, stationId: string): Result {
  const o = state.shipOrders?.find((x) => x.id === orderId);
  if (!o || o.status !== 'offer') return { ok: false, msg: 'Bestellung nicht mehr verfügbar.' };
  const r = queueShipBuild(state, stationId, o.cls, o.id);
  if (!r.ok) return r;
  o.status = 'active';
  o.station = stationId;
  o.deadline = state.time + ORDER_TIME;
  return { ok: true, msg: 'Bestellung angenommen – die Werft baut das Schiff, sobald das Material da ist.' };
}
