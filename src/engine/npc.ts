// NPC-Verkehr: Händler besuchen deine Stationen, Kuriere liefern Aufträge,
// Hintergrundverkehr belebt die Sektoren.
import { SECTOR_MAP, gatesOf, sector } from '../data/sectors';
import { WARES } from '../data/wares';
import { addWare, applyMarketTrade, buildRoom, hasDockFor, marketPrice, marketRoom, marketStock, receiveWare, roomAt, stationWares } from './economy';
import { contractDeliver } from './contracts';
import { dockPoint, prioNeeds, sellableStock, stationById, surplus, wanted } from './logistics';
import type { GameState, NpcShip } from './types';
import { emit, pick, rand, randRange, weightedPick } from './util';

const NPC_CAPACITY = 6000; // m³, typischer M-Frachter
const NPC_SPEED = 2.0;
const DOCK = 40;

function spawnPoint(state: GameState, sectorId: string): { x: number; z: number } {
  const gates = gatesOf(sectorId);
  const ts = sector(sectorId).tradeStation;
  if (gates.length && rand(state) < 0.6) {
    const g = pick(state, gates);
    return { x: g.x * 0.96, z: g.z * 0.96 };
  }
  return { x: ts.x + randRange(state, -3, 3), z: ts.z + randRange(state, -3, 3) };
}

function makeNpc(state: GameState, partial: Partial<NpcShip> & Pick<NpcShip, 'sector' | 'kind' | 'tx' | 'tz'>): NpcShip {
  const start = spawnPoint(state, partial.sector);
  const exit = spawnPoint(state, partial.sector);
  return {
    id: 'npc-' + state.nextId++,
    x: start.x,
    z: start.z,
    heading: Math.atan2(partial.tz - start.z, partial.tx - start.x),
    station: '',
    ware: '',
    amount: 0,
    phase: 'in',
    timer: 0,
    exitX: exit.x,
    exitZ: exit.z,
    speed: NPC_SPEED * randRange(state, 0.85, 1.2),
    hue: Math.floor(rand(state) * 360),
    ...partial,
  };
}

function trySpawnTrader(state: GameState, sectorId: string): void {
  // Ohne Dock beliefern NPC-Händler nur das Baulager (sofern die Station Zukauf erlaubt)
  const stations = state.stations.filter((s) => s.sector === sectorId && (hasDockFor(s, 'M') || (s.autoBuyBuild !== false && (s.build || s.queue.length))));
  if (!stations.length) return;
  const offers: { item: { st: string; ware: string; kind: 'buyer' | 'seller'; amount: number }; w: number }[] = [];
  for (const st of stations) {
    const dock = hasDockFor(st, 'M');
    for (const id of stationWares(st)) {
      const w = WARES[id];
      const units = NPC_CAPACITY / w.volume;
      // Ware für aktive Aufträge wird nicht an NPC-Händler verkauft
      // Option der Station: erst die eigene Lieferreihenfolge versorgen, dann an NPC-Händler verkaufen
      const held = st.prioBeforeNpc && prioNeeds(state, st, id, units);
      const have = held ? 0 : surplus(state, st, id) - contractNeed(state, id);
      const room = marketRoom(state, sectorId, id);
      const sell = dock ? Math.min(have, units, room) : 0;
      if (sell >= Math.min(units * 0.25, 200)) offers.push({ item: { st: st.id, ware: id, kind: 'buyer', amount: sell }, w: sell * marketPrice(state, sectorId, id) });
      const want = wanted(state, st, id, false, true);
      const need = dock ? want : Math.min(want, buildRoom(st, id));
      const stock = marketStock(state, sectorId, id);
      const buy = Math.min(need, units, stock * 0.5, Math.max(0, state.credits - 100_000) / marketPrice(state, sectorId, id));
      // Kleine Restmengen fürs Baulager werden auch geliefert
      const minBuy = Math.min(units * 0.25, 200, Math.max(1, buildRoom(st, id) - 0.5));
      if (buy >= minBuy) offers.push({ item: { st: st.id, ware: id, kind: 'seller', amount: buy }, w: buy * w.price.avg * 0.8 });
    }
  }
  const o = weightedPick(state, offers);
  if (!o) return;
  const st = stationById(state, o.st)!;
  const dp = dockPoint(st, 'npc' + state.nextId);
  state.npcs.push(makeNpc(state, { sector: sectorId, kind: o.kind, tx: dp.x, tz: dp.z, station: st.id, ware: o.ware, amount: o.amount }));
}

function contractNeed(state: GameState, wareId: string): number {
  let n = 0;
  for (const c of state.contracts) if (c.status === 'active' && c.ware === wareId) n += Math.max(0, c.amount - c.delivered);
  return n;
}

function spawnTraffic(state: GameState, sectorId: string): void {
  const ts = SECTOR_MAP[sectorId].tradeStation;
  const gates = gatesOf(sectorId);
  const toTrade = rand(state) < 0.6 || gates.length < 2;
  const target = toTrade ? { x: ts.x + randRange(state, -4, 4), z: ts.z + randRange(state, -4, 4) } : pick(state, gates);
  state.npcs.push(makeNpc(state, { sector: sectorId, kind: 'traffic', tx: target.x, tz: target.z }));
}

/** Kurier bringt Ware von einer Station zu einem Auftrag */
export function spawnCourier(state: GameState, stationId: string, contractId: number, wareId: string, amount: number): void {
  const st = stationById(state, stationId)!;
  const c = state.contracts.find((x) => x.id === contractId)!;
  let tx: number, tz: number;
  if (c.sector === st.sector) {
    const ts = SECTOR_MAP[c.sector].tradeStation;
    tx = ts.x; tz = ts.z;
  } else {
    const g = gatesOf(st.sector).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
    tx = g.x; tz = g.z;
  }
  const npc = makeNpc(state, { sector: st.sector, kind: 'courier', tx, tz, station: st.id, ware: wareId, amount, contract: contractId });
  npc.x = st.x; npc.z = st.z;
  npc.speed = 3.2;
  npc.hue = 170;
  state.npcs.push(npc);
}

function moveNpc(n: NpcShip, tx: number, tz: number, dt: number): boolean {
  const dx = tx - n.x, dz = tz - n.z;
  const d = Math.hypot(dx, dz);
  const step = n.speed * dt;
  if (d > 1e-6) {
    const target = Math.atan2(dz, dx);
    let diff = target - n.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    n.heading += diff * Math.min(1, dt * 3);
  }
  if (d <= step) { n.x = tx; n.z = tz; return true; }
  n.x += (dx / d) * step;
  n.z += (dz / d) * step;
  return false;
}

function npcTrade(state: GameState, n: NpcShip): void {
  const st = stationById(state, n.station);
  if (!st) return;
  if (n.kind === 'buyer') {
    // Inzwischen braucht eine Station der Lieferreihenfolge die Ware: der Händler zieht ohne Kauf weiter
    if (st.prioBeforeNpc && prioNeeds(state, st, n.ware, NPC_CAPACITY / WARES[n.ware].volume)) return;
    const qty = Math.min(n.amount, sellableStock(st, n.ware), marketRoom(state, n.sector, n.ware) + n.amount * 0.1);
    if (qty < 1) return;
    addWare(st, n.ware, -qty);
    const value = applyMarketTrade(state, n.sector, n.ware, qty);
    st.income += value;
    emit({ type: 'sale', station: st.id, sector: st.sector, x: st.x, z: st.z, value });
  } else if (n.kind === 'seller') {
    const price = marketPrice(state, n.sector, n.ware);
    const room = hasDockFor(st, 'M') ? roomAt(st, n.ware) : buildRoom(st, n.ware);
    const qty = Math.min(n.amount, room, marketStock(state, n.sector, n.ware), Math.max(0, state.credits - 20_000) / price);
    if (qty < 1) return;
    const cost = applyMarketTrade(state, n.sector, n.ware, -qty);
    receiveWare(state, st, n.ware, qty);
    st.expenses += cost;
    emit({ type: 'sale', station: st.id, sector: st.sector, x: st.x, z: st.z, value: -cost });
  }
}

export function stepNpcs(state: GameState, dt: number): void {
  for (const secId of state.sectors) {
    state.npcTimer[secId] = (state.npcTimer[secId] ?? 30) - dt;
    if (state.npcTimer[secId] > 0) continue;
    const here = state.npcs.filter((n) => n.sector === secId);
    const traders = here.filter((n) => n.kind === 'buyer' || n.kind === 'seller').length;
    const stations = state.stations.filter((s) => s.sector === secId).length;
    if (traders < 1 + stations * 2) trySpawnTrader(state, secId);
    if (here.filter((n) => n.kind === 'traffic').length < 5) spawnTraffic(state, secId);
    state.npcTimer[secId] = randRange(state, 50, 110) / Math.max(1, Math.sqrt(stations));
  }
  const gone = new Set<string>();
  for (const n of state.npcs) {
    if (n.phase === 'in') {
      if (moveNpc(n, n.tx, n.tz, dt)) {
        if (n.kind === 'traffic') { n.phase = 'docked'; n.timer = randRange(state, 20, 90); }
        else if (n.kind === 'courier') {
          if (n.contract != null) {
            const used = contractDeliver(state, n.contract, n.ware, n.amount);
            state.totals.delivered += used;
          }
          gone.add(n.id);
        } else { n.phase = 'docked'; n.timer = DOCK; }
      }
    } else if (n.phase === 'docked') {
      n.timer -= dt;
      if (n.timer <= 0) {
        if (n.kind === 'buyer' || n.kind === 'seller') npcTrade(state, n);
        n.phase = 'out';
      }
    } else if (moveNpc(n, n.exitX, n.exitZ, dt)) gone.add(n.id);
  }
  if (gone.size) state.npcs = state.npcs.filter((n) => !gone.has(n.id));
  // Aufräumen: NPCs in Sektoren ohne Baurecht entfernen
  if (state.npcs.length > 200) state.npcs.splice(0, state.npcs.length - 200);
}
