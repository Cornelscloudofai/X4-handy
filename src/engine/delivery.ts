// Lieferaufträge gezielt bedienen: angeheuerter Kurier (kostet Gebühr) oder eigener Transporter (kostet Zeit).
import { SECTOR_MAP } from '../data/sectors';
import { DOCK_TIME, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { sellOrder } from './actions';
import { hasDockFor } from './economy';
import { inTransitForContract, shipPlace } from './fleet';
import { sellableStock, stationById, travelDistance } from './logistics';
import type { GameState, Ship } from './types';

/** Geschwindigkeit des NPC-Kuriers (siehe spawnCourier) */
const COURIER_SPEED = 3.2;
const MAX_TRIPS = 6;

export interface ShipDeliveryOption {
  ship: Ship;
  /** Einheiten je Fahrt */
  perTrip: number;
  trips: number;
  /** Einheiten, die das Schiff insgesamt bringt */
  amount: number;
  /** Zeit bis zur letzten Ablieferung (Schätzung) */
  eta: number;
  busy: boolean;
  /** Warum das Schiff nicht geht ('' = geht) */
  reason: string;
}

export interface DeliveryOptions {
  /** Was der Auftrag noch braucht (ohne bereits unterwegs befindliche Ware) */
  need: number;
  stock: number;
  /** Bestand über der eingestellten Reserve – nur den geben eigene Transporter ab */
  sellable: number;
  courier: { amount: number; fee: number; eta: number };
  ships: ShipDeliveryOption[];
}

/** Ware, die für einen Auftrag schon unterwegs oder als Schiffsauftrag eingeplant ist */
export function contractPending(state: GameState, contractId: number): number {
  let n = inTransitForContract(state, contractId);
  for (const s of state.ships) for (const o of s.orders ?? []) if (o.contract === contractId) n += o.amount;
  return n;
}

export function deliveryOptions(state: GameState, contractId: number, stationId: string): DeliveryOptions | null {
  const c = state.contracts.find((x) => x.id === contractId);
  const st = stationById(state, stationId);
  if (!c || !st) return null;
  const w = WARES[c.ware];
  const need = Math.max(0, c.amount - c.delivered - contractPending(state, c.id));
  const stock = st.inventory[c.ware] ?? 0;
  const sellable = sellableStock(st, c.ware);
  const target = SECTOR_MAP[c.sector].tradeStation;
  const dest = { sector: c.sector, x: target.x, z: target.z };
  const leg = travelDistance(st, dest);
  const courierAmount = Math.min(stock, need);
  const courier = { amount: courierAmount, fee: Math.round(courierAmount * w.price.avg * 0.1), eta: leg / COURIER_SPEED };
  const ships: ShipDeliveryOption[] = [];
  for (const s of state.ships) {
    const cls = SHIP_MAP[s.cls];
    if (cls.role !== 'trader') continue;
    const perTrip = Math.floor(cls.capacity / w.volume);
    const amount = Math.min(need, sellable, perTrip * MAX_TRIPS);
    const trips = Math.max(1, Math.ceil(amount / perTrip));
    const busy = !!s.job || !!s.cargo || (s.orders?.length ?? 0) > 0 || s.mode === 'route';
    const dock = DOCK_TIME[cls.size];
    const approach = travelDistance(shipPlace(s), st) / cls.speed;
    const flight = leg / cls.speed;
    const eta = approach + trips * (2 * dock + flight) + (trips - 1) * flight;
    const reason = w.storage !== cls.storage ? 'Frachtraum passt nicht'
      : !hasDockFor(st, cls.size) ? (cls.size === 'L' ? 'Station hat keinen Pier' : 'Station hat kein Dock')
      : amount < 1 ? (need < 1 ? 'Auftrag ist schon gedeckt' : 'Nichts über der Reserve') : '';
    ships.push({ ship: s, perTrip, trips, amount, eta, busy, reason });
  }
  // Freie und schnelle Schiffe zuerst
  ships.sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || Number(a.busy) - Number(b.busy) || a.eta - b.eta);
  return { need, stock, sellable, courier, ships };
}

/** Eigener Transporter liefert für den Auftrag – ohne Kuriergebühr, dafür mit Flugzeit */
export function deliverWithShip(state: GameState, contractId: number, stationId: string, shipId: string): { ok: boolean; msg: string } {
  const opts = deliveryOptions(state, contractId, stationId);
  const c = state.contracts.find((x) => x.id === contractId);
  const o = opts?.ships.find((x) => x.ship.id === shipId);
  if (!opts || !c || !o) return { ok: false, msg: 'Auftrag, Station oder Schiff nicht verfügbar.' };
  if (o.reason) return { ok: false, msg: o.reason + '.' };
  let left = o.amount;
  let trips = 0;
  while (left >= 1 && trips < MAX_TRIPS) {
    const n = Math.min(left, o.perTrip);
    const r = sellOrder(state, shipId, stationId, c.ware, n, { kind: 'market', sector: c.sector }, c.id);
    if (!r.ok) return trips ? { ok: true, msg: `${o.ship.name}: ${trips} Fahrt(en) eingeplant.` } : r;
    left -= n;
    trips++;
  }
  // Einzelaufträge haben Vorrang vor dem Autohandel; eine feste Route bleibt bestehen
  return { ok: true, msg: `${o.ship.name} liefert ${Math.round(o.amount).toLocaleString('de-DE')} ${WARES[c.ware].name} in ${trips} Fahrt${trips === 1 ? '' : 'en'}.` };
}
