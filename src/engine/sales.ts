// Verkaufsentscheidung: Welche Käufer gibt es für eine Ladung, und was bringt jeder davon –
// pro Fahrt, pro Stunde und an umgeschlagener Menge?
import { SECTOR_MAP, marketInfo, sector } from '../data/sectors';
import { DOCK_TIME, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { marketRoom, marketTradeValue, stationRates } from './economy';
import { knownSectors, marketKey, sectorDistanceHint, stationById, travelDistance, type Place } from './logistics';
import type { GameState, ShipClassDef, TradeEndpoint } from './types';
import { productionUtil } from './analysis';

export type SalePriority = 'price' | 'perHour' | 'throughput';

export interface SaleOffer {
  id: string;
  endpoint: TradeEndpoint;
  kind: 'trade' | 'npc' | 'contract';
  contract?: number;
  name: string;
  sector: string;
  /** Sprünge über Tore */
  hops: number;
  /** einfache Strecke in km */
  km: number;
  /** Durchschnittspreis je Einheit für genau diese Ladung (Preis sinkt mit der Menge) */
  unitPrice: number;
  /** Preis für die erste Einheit (Angebotspreis) */
  listPrice: number;
  /** Einheiten, die der Käufer von dieser Ladung tatsächlich abnimmt */
  accept: number;
  /** Was der Käufer insgesamt noch aufnehmen würde */
  room: number;
  limit: 'buyer' | 'ship' | 'amount';
  value: number;
  /** Flugzeit einfache Strecke in Sekunden */
  flight: number;
  /** Gesamter Zyklus: Laden, Hinflug, Entladen, Rückflug */
  cycle: number;
  perHour: number;
  unitsPerHour: number;
}

export interface SaleContext {
  stock: number;
  /** Überschuss der Station pro Stunde bei aktueller Auslastung */
  netPerHour: number;
  shipUnits: number;
  /** Zeit, bis die Produktion eine volle Schiffsladung nachliefert */
  refillSeconds: number;
}

export function saleContext(state: GameState, stationId: string, ware: string, cls: ShipClassDef): SaleContext {
  const st = stationById(state, stationId)!;
  const r = stationRates(st)[ware];
  const net = r ? (r.prod - r.use) * (productionUtil(st) || 1) : 0;
  const shipUnits = cls.capacity / WARES[ware].volume;
  return { stock: st.inventory[ware] ?? 0, netPerHour: net, shipUnits, refillSeconds: net > 0 ? (shipUnits / net) * 3600 : Infinity };
}

/** Alle Käufer in bekannten Sektoren für eine konkrete Ladung mit einem konkreten Schiffstyp */
export function saleOffers(state: GameState, stationId: string, ware: string, cls: ShipClassDef, amount: number): SaleOffer[] {
  const st = stationById(state, stationId);
  if (!st || WARES[ware].storage !== cls.storage) return [];
  const origin: Place = { sector: st.sector, x: st.x, z: st.z };
  const shipUnits = cls.capacity / WARES[ware].volume;
  const load = Math.max(0, Math.min(amount, shipUnits));
  const dock = DOCK_TIME[cls.size];
  const out: SaleOffer[] = [];

  const add = (o: Omit<SaleOffer, 'hops' | 'km' | 'flight' | 'cycle' | 'perHour' | 'unitsPerHour' | 'limit' | 'accept' | 'unitPrice' | 'value'> & { valueOf: (n: number) => number }) => {
    const accept = Math.min(load, o.room);
    if (accept < 1) return;
    const place = o.endpoint.kind === 'market' ? marketInfo(marketKey(o.endpoint)) : null;
    if (!place) return;
    const km = travelDistance(origin, { sector: place.sector, x: place.x, z: place.z });
    const flight = km / cls.speed;
    // An der eigenen Station laden, beim Käufer entladen, leer zurück
    const cycle = 2 * flight + 2 * dock;
    const value = o.valueOf(accept);
    const limit = o.room < load - 0.5 ? 'buyer' : amount > shipUnits + 0.5 ? 'ship' : 'amount';
    out.push({
      id: o.id, endpoint: o.endpoint, kind: o.kind, contract: o.contract, name: o.name, sector: o.sector, room: o.room, listPrice: o.listPrice,
      hops: sectorDistanceHint(st.sector, o.sector), km, flight, cycle, accept, limit, value, unitPrice: value / accept,
      perHour: value / (cycle / 3600), unitsPerHour: accept / (cycle / 3600),
    });
  };

  for (const secId of knownSectors(state)) {
    const sec = SECTOR_MAP[secId];
    // Handelsposten: großes Lager, Preis nach Bestand
    add({
      id: 'm:' + secId, endpoint: { kind: 'market', sector: secId }, kind: 'trade', name: sec.tradeStation.name, sector: secId,
      room: marketRoom(state, secId, ware), listPrice: marketTradeValue(state, secId, ware, 1),
      valueOf: (n) => marketTradeValue(state, secId, ware, n),
    });
    // Spezialisierte Käufer: begrenzte Abnahme, meist bessere Preise
    for (const n of sector(secId).npcStations) {
      if (!n.buys.includes(ware)) continue;
      add({
        id: 'm:' + n.id, endpoint: { kind: 'market', sector: secId, market: n.id }, kind: 'npc', name: n.name, sector: secId,
        room: marketRoom(state, n.id, ware), listPrice: marketTradeValue(state, n.id, ware, 1),
        valueOf: (x) => marketTradeValue(state, n.id, ware, x),
      });
    }
  }
  // Aktive Lieferaufträge
  for (const c of state.contracts) {
    if (c.status !== 'active' || c.ware !== ware) continue;
    const rest = c.amount - c.delivered;
    const perUnit = c.story ? 0 : c.reward / c.amount;
    add({
      id: 'c:' + c.id, endpoint: { kind: 'market', sector: c.sector }, kind: 'contract', contract: c.id, name: c.title, sector: c.sector,
      room: rest, listPrice: perUnit, valueOf: (n) => n * perUnit,
    });
  }
  return out;
}

export function sortOffers(offers: SaleOffer[], prio: SalePriority): SaleOffer[] {
  const key = (o: SaleOffer) => (prio === 'price' ? o.unitPrice : prio === 'perHour' ? o.perHour : o.unitsPerHour);
  return [...offers].sort((a, b) => key(b) - key(a));
}

/** Kennzeichnet die Spitzenreiter je Kriterium */
export function offerBadges(offers: SaleOffer[]): Record<string, SalePriority[]> {
  const out: Record<string, SalePriority[]> = {};
  const withValue = offers.filter((o) => o.kind !== 'contract' || o.value > 0);
  for (const prio of ['price', 'perHour', 'throughput'] as SalePriority[]) {
    const best = sortOffers(prio === 'price' ? withValue : offers, prio)[0];
    if (best) (out[best.id] ??= []).push(prio);
  }
  return out;
}

/** Einschätzung, was gerade der Engpass ist */
export function saleAdvice(ctx: SaleContext, offers: SaleOffer[]): { bottleneck: 'production' | 'transport' | 'none'; text: string } {
  if (!offers.length) return { bottleneck: 'none', text: '' };
  const fastest = Math.min(...offers.map((o) => o.cycle));
  if (ctx.netPerHour <= 0) return { bottleneck: 'none', text: 'Die Station produziert diese Ware gerade nicht nach – verkauft wird nur der Lagerbestand.' };
  if (ctx.refillSeconds > fastest) {
    return { bottleneck: 'production', text: `Deine Produktion ist der Engpass: Eine volle Ladung braucht ${Math.round(ctx.refillSeconds / 60)} min Nachschub, die schnellste Fahrt nur ${Math.round(fastest / 60)} min. Das Schiff hätte ohnehin Zeit – längere Wege zum besten Preis lohnen sich.` };
  }
  return { bottleneck: 'transport', text: `Der Transport ist der Engpass: Die Station füllt eine Ladung in ${Math.round(ctx.refillSeconds / 60)} min. Achte auf Ertrag pro Stunde und Abnahmemenge, sonst läuft das Lager voll.` };
}

export function shipClassFor(state: GameState, shipId: string): ShipClassDef | null {
  const s = state.ships.find((x) => x.id === shipId);
  return s ? SHIP_MAP[s.cls] : null;
}
