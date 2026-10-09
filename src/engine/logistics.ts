// Bedarf, Überschuss, Reservierungen und Wegberechnung.
import { SECTOR_MAP, gate, marketInfo, sector, sectorPath } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { buildRoom, consumesWare, pendingNeeds, storageCap, stationWares, tradeRule, wareLimit } from './economy';
import type { GameState, Ship, Station, TradeEndpoint, Vec } from './types';
import { hashStr } from './util';

export interface Place { sector: string; x: number; z: number }

export function stationById(state: GameState, id: string): Station | undefined {
  return state.stations.find((s) => s.id === id);
}

export function endpointPlace(state: GameState, ep: TradeEndpoint): Place | null {
  if (ep.kind === 'market') {
    if (!SECTOR_MAP[ep.sector]) return null;
    const m = marketInfo(marketKey(ep));
    return { sector: m.sector, x: m.x, z: m.z };
  }
  const st = stationById(state, ep.id);
  return st ? { sector: st.sector, x: st.x, z: st.z } : null;
}

export function endpointName(state: GameState, ep: TradeEndpoint): string {
  if (ep.kind === 'market') return SECTOR_MAP[ep.sector] ? marketInfo(marketKey(ep)).name : 'Markt';
  return stationById(state, ep.id)?.name ?? 'Station';
}

/** Schlüssel des Marktes hinter einem Endpunkt (Handelsposten oder NPC-Station) */
export function marketKey(ep: TradeEndpoint): string {
  return ep.kind === 'market' ? ep.market ?? ep.sector : '';
}

/** Andockpunkt eines Schiffs rund um eine Station (damit sich Schiffe nicht stapeln) */
export function dockPoint(base: Vec, shipId: string): Vec {
  const h = hashStr(shipId);
  const a = ((h % 360) * Math.PI) / 180;
  const r = 2.5 + ((h >> 9) % 30) / 10;
  return { x: base.x + Math.cos(a) * r, z: base.z + Math.sin(a) * r };
}

/** Wegpunkte von A nach B über Sprungtore */
export function planPath(from: Place, to: Place): Ship['path'] {
  const hops = sectorPath(from.sector, to.sector);
  const path: Ship['path'] = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const g = gate(hops[i], hops[i + 1]);
    path.push({ sector: hops[i], x: g.x, z: g.z, gateTo: hops[i + 1] });
  }
  path.push({ sector: to.sector, x: to.x, z: to.z });
  return path;
}

export function pathLength(from: Place, path: Ship['path']): number {
  let d = 0;
  let cur = { ...from };
  for (const p of path) {
    if (p.sector === cur.sector) d += Math.hypot(p.x - cur.x, p.z - cur.z);
    cur = { sector: p.sector, x: p.x, z: p.z };
    if (p.gateTo) {
      const g = gate(p.gateTo, p.sector);
      cur = { sector: p.gateTo, x: g.x, z: g.z };
    }
  }
  return d;
}

export function travelDistance(from: Place, to: Place): number {
  return pathLength(from, planPath(from, to));
}

/**
 * Bewegt ein Objekt entlang seiner Wegpunkte. Liefert true, wenn das Ziel erreicht ist.
 * Beim Erreichen eines Sprungtors wechselt das Objekt in den Nachbarsektor.
 */
export function moveAlong(ship: { sector: string; x: number; z: number; heading: number; path: Ship['path'] }, speed: number, dt: number): boolean {
  let budget = speed * dt;
  let guard = 0;
  while (ship.path.length && guard++ < 20) {
    const p = ship.path[0];
    if (p.sector !== ship.sector) {
      // Ungültiger Wegpunkt (z. B. nach Laden eines alten Spielstands) – verwerfen
      ship.path.shift();
      continue;
    }
    const dx = p.x - ship.x;
    const dz = p.z - ship.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      const target = Math.atan2(dz, dx);
      let diff = target - ship.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ship.heading += diff * Math.min(1, dt * 3);
    }
    if (d <= budget) {
      budget -= d;
      ship.x = p.x;
      ship.z = p.z;
      ship.path.shift();
      if (p.gateTo) {
        const g = gate(p.gateTo, p.sector);
        ship.sector = p.gateTo;
        ship.x = g.x * 0.96;
        ship.z = g.z * 0.96;
        ship.heading = g.angle + Math.PI;
      }
    } else {
      ship.x += (dx / d) * budget;
      ship.z += (dz / d) * budget;
      return false;
    }
  }
  return ship.path.length === 0;
}

// ---------- Reservierungen ----------

export function incoming(state: GameState, stationId: string, wareId: string): number {
  let n = 0;
  for (const s of state.ships) {
    const cls = SHIP_MAP[s.cls];
    if (cls.role === 'miner') {
      if (s.home !== stationId) continue;
      if (s.cargo?.ware === wareId) n += s.cargo.amount;
      else if (!s.cargo && s.miningField && fieldWare(s.miningField) === wareId && (s.phase === 'toTarget' || s.phase === 'mining')) n += cls.capacity / WARES[wareId].volume;
    } else if (s.job && s.job.ware === wareId && s.job.to.kind === 'station' && s.job.to.id === stationId) {
      n += s.cargo?.ware === wareId ? s.cargo.amount : s.job.amount;
    }
  }
  for (const npc of state.npcs) if (npc.kind === 'seller' && npc.station === stationId && npc.ware === wareId && npc.phase === 'in') n += npc.amount;
  return n;
}

export function outgoing(state: GameState, stationId: string, wareId: string): number {
  let n = 0;
  for (const s of state.ships) {
    if (s.job && s.job.stage === 'pickup' && s.job.ware === wareId && s.job.from.kind === 'station' && s.job.from.id === stationId) n += s.job.amount;
    for (const o of s.orders ?? []) if (o.ware === wareId && o.from.kind === 'station' && o.from.id === stationId) n += o.amount;
  }
  for (const npc of state.npcs) if (npc.kind === 'buyer' && npc.station === stationId && npc.ware === wareId && npc.phase === 'in') n += npc.amount;
  return n;
}

export function fieldWare(fieldId: string): string {
  for (const s of Object.values(SECTOR_MAP)) {
    const f = s.fields.find((x) => x.id === fieldId);
    if (f) return f.ware;
  }
  return '';
}

export function fieldById(fieldId: string) {
  for (const s of Object.values(SECTOR_MAP)) {
    const f = s.fields.find((x) => x.id === fieldId);
    if (f) return { field: f, sector: s };
  }
  return null;
}

/** Reserve, die eine Station für die eigene Produktion zurückhält */
/** Material für den nächsten Feldausbau, das im Lager einer Station bereitliegt (wird nicht verkauft) */
const fieldReserve = new Map<string, Record<string, number>>();
export function setFieldReserve(stationId: string, needs: Record<string, number> | null): void {
  if (needs) fieldReserve.set(stationId, needs);
  else fieldReserve.delete(stationId);
}

export function reserveFor(st: Station, wareId: string, limit: number): number {
  const set = st.reserve?.[wareId];
  const field = fieldReserve.get(st.id)?.[wareId] ?? 0;
  if (set !== undefined) return Math.max(set, field);
  const yard = (pendingNeeds(st)[wareId] ?? 0) + field;
  return Math.max(yard, consumesWare(st, wareId) ? limit * 0.4 : 0);
}

/** Bestand über der Reserve – das darf die Station abgeben */
export function sellableStock(st: Station, wareId: string): number {
  return Math.max(0, (st.inventory[wareId] ?? 0) - reserveFor(st, wareId, wareLimit(st, wareId)));
}

/**
 * Wie viel die Station noch einkaufen möchte (abzüglich bereits unterwegs befindlicher Ware): Lagerbedarf nach Handelsregel
 * plus Baumaterial fürs Baulager. market = Lieferung vom Markt oder von NPC-Händlern – dann zählt das Baulager nur,
 * wenn die Station Zukauf von Baumaterial erlaubt.
 */
export function wanted(state: GameState, st: Station, wareId: string, ignoreRule = false, market = false): number {
  const build = market && st.autoBuyBuild === false ? 0 : buildRoom(st, wareId);
  let stock = 0;
  const rule = tradeRule(st, wareId);
  const cap = storageCap(st)[WARES[wareId].storage];
  if ((rule.buy || ignoreRule) && cap > 0) {
    const limit = wareLimit(st, wareId, storageCap(st), stationWares(st));
    // Für bestellte Schiffe wird die volle Menge gebraucht – nicht nur 95 % des Limits
    const yard = Math.min(pendingNeeds(st)[wareId] ?? 0, cap / WARES[wareId].volume);
    stock = Math.max(0, Math.max(limit * 0.95, yard) - (st.inventory[wareId] ?? 0));
  }
  return Math.max(0, stock + build - incoming(state, st.id, wareId));
}

/** Wie viel die Station abgeben kann */
export function surplus(state: GameState, st: Station, wareId: string): number {
  const rule = tradeRule(st, wareId);
  if (!rule.sell) return 0;
  const limit = wareLimit(st, wareId, storageCap(st), stationWares(st));
  return Math.max(0, (st.inventory[wareId] ?? 0) - reserveFor(st, wareId, limit) - outgoing(state, st.id, wareId));
}

export function sectorDistanceHint(a: string, b: string): number {
  return sectorPath(a, b).length - 1;
}

export function knownSectors(state: GameState): string[] {
  const set = new Set(state.sectors);
  for (const id of state.sectors) for (const l of sector(id).links) set.add(l);
  return [...set];
}

/**
 * Braucht noch eine Station aus der Lieferreihenfolge diese Ware? „Versorgt“ heißt wie beim Durchrutschen der
 * Transporter: Sie kann weniger als eine halbe Ladung abnehmen (bezogen auf das, was tatsächlich mitginge) und ihr
 * Baulager braucht nichts mehr davon.
 */
export function prioNeeds(state: GameState, st: Station, wareId: string, load: number): Station | null {
  const have = Math.max(0, (st.inventory[wareId] ?? 0) - reserveFor(st, wareId, wareLimit(st, wareId)));
  const ref = Math.min(have, load);
  if (ref < 1) return null;
  for (const id of st.deliveryPrio ?? []) {
    const o = stationById(state, id);
    if (!o) continue;
    // Bedarf im Baulager zählt immer – auch kleine Restmengen halten sonst einen Bau auf
    // ebenso der Rest für ein geplantes Schiff der Werft
    const yardRest = (pendingNeeds(o)[wareId] ?? 0) - (o.inventory[wareId] ?? 0);
    if (wanted(state, o, wareId) >= ref * 0.5 || Math.min(buildRoom(o, wareId), wanted(state, o, wareId)) >= 0.5 || Math.min(yardRest, wanted(state, o, wareId)) >= 0.5) return o;
  }
  return null;
}
