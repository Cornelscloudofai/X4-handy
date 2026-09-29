// Verhalten der eigenen Schiffe: Miner fördern für ihre Heimatstation,
// Transporter handeln automatisch oder fliegen feste Versorgungslinien.
import { marketInfo, sector } from '../data/sectors';
import { DOCK_TIME, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { addWare, applyMarketTrade, freeUnits, hasDockFor, stationRates, storageCap, marketPrice, marketRoom, marketStock, marketTradeValue, stationWares, wareLimit } from './economy';
import {
  dockPoint, sellableStock, endpointName, endpointPlace, fieldById, fieldWare, incoming, knownSectors, marketKey, moveAlong, outgoing, planPath, reserveFor, stationById, surplus, travelDistance, wanted,
  type Place,
} from './logistics';
import { contractDeliver } from './contracts';
import type { GameState, Ship, TradeEndpoint, TradeJob } from './types';
import { emit, log, rand } from './util';

function shipPlace(s: Ship): Place {
  return { sector: s.sector, x: s.x, z: s.z };
}

function goTo(s: Ship, to: Place, dockFor?: string): void {
  const target = dockFor ? { ...to, ...dockPoint(to, s.id) } : to;
  s.path = planPath(shipPlace(s), target);
  s.phase = 'toTarget';
}

export function stepShip(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  if (cls.role === 'miner') stepMiner(state, s, dt);
  else stepTrader(state, s, dt);
}

// ---------- Miner ----------

type MiningChoice = { ware: string; field: string } | { reason: string };

/**
 * Welchen Rohstoff soll der Miner holen? Zuerst, was die Heimat verbraucht – dabei zählt auch,
 * was während des Flugs verbraucht wird. Ohne Verbrauch wird für den Verkauf gefördert.
 * Liefert sonst den tatsächlichen Grund, warum der Miner wartet.
 */
export function chooseMining(state: GameState, s: Ship): MiningChoice {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  if (!home) return { reason: 'Keine Heimatstation' };
  const sec = sector(home.sector);
  const typeName = cls.storage === 'Liquid' ? 'Gas' : 'Mineral';
  const fields = sec.fields.filter((f) => WARES[f.ware].storage === cls.storage && (!s.mineWare || f.ware === s.mineWare));
  if (!fields.length) return { reason: s.mineWare ? `Kein ${WARES[s.mineWare].name}-Feld in ${sec.name}` : `Kein ${typeName}-Feld in ${sec.name}` };
  if (storageCap(home)[cls.storage] <= 0) return { reason: cls.storage === 'Liquid' ? 'Heimat hat kein Flüssiglager' : 'Heimat hat kein Feststofflager' };
  const rates = stationRates(home);
  const production: { ware: string; field: string; score: number }[] = [];
  const sale: { ware: string; field: string; score: number }[] = [];
  let full = false;
  for (const f of fields) {
    const w = WARES[f.ware];
    const load = cls.capacity / w.volume;
    const dist = Math.hypot(f.x - home.x, f.z - home.z);
    const trip = (2 * dist) / cls.speed + cls.capacity / (cls.miningRate * f.richness) + DOCK_TIME[cls.size];
    const use = Math.max(0, (rates[f.ware]?.use ?? 0) - (rates[f.ware]?.prod ?? 0));
    // Freier Platz, abzüglich anderer Miner mit derselben Ware (ohne dieses Schiff), plus Verbrauch während der Fahrt
    const others = incoming(state, home.id, f.ware) - (s.miningField && fieldWare(s.miningField) === f.ware && !s.cargo ? load : 0);
    const room = freeUnits(home, f.ware) - others + (use * trip) / 3600;
    if (room < load * 0.25) { full = true; continue; }
    const score = Math.min(room, load) / (1 + dist / 100);
    if (use > 0 || s.mineWare) production.push({ ware: f.ware, field: f.id, score: score * (1 + use / 1000) });
    else sale.push({ ware: f.ware, field: f.id, score: score * w.price.avg });
  }
  const best = (production.length ? production : sale).sort((a, b) => b.score - a.score)[0];
  if (best) return { ware: best.ware, field: best.field };
  return { reason: full ? 'Lager voll – wartet auf Platz' : 'Kein Rohstoffbedarf' };
}

function stepMiner(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  if (!home) { s.status = 'Keine Heimatstation'; return; }
  switch (s.phase) {
    case 'idle': {
      if (s.cargo) { goTo(s, home, s.id); s.phase = 'toHome'; s.status = 'Rückflug mit Ladung'; return; }
      const choice = chooseMining(state, s);
      if ('reason' in choice) {
        s.status = choice.reason;
        s.phase = 'waiting';
        s.timer = 30;
        if (s.sector !== home.sector || Math.hypot(s.x - home.x, s.z - home.z) > 8) goTo(s, home, s.id), (s.phase = 'toHome');
        return;
      }
      const info = fieldById(choice.field)!;
      const a = rand(state) * Math.PI * 2;
      const r = Math.sqrt(rand(state)) * info.field.r * 0.6;
      s.miningField = choice.field;
      goTo(s, { sector: info.sector.id, x: info.field.x + Math.cos(a) * r, z: info.field.z + Math.sin(a) * r });
      s.status = `Fliegt zum Feld: ${WARES[choice.ware].name}`;
      return;
    }
    case 'toTarget': {
      if (moveAlong(s, cls.speed, dt)) {
        const info = fieldById(s.miningField);
        if (!info) { s.phase = 'idle'; return; }
        s.phase = 'mining';
        s.timer = cls.capacity / (cls.miningRate * info.field.richness);
        s.status = `Baut ${WARES[info.field.ware].name} ab`;
      }
      return;
    }
    case 'mining': {
      s.timer -= dt;
      if (s.timer <= 0) {
        const info = fieldById(s.miningField)!;
        const w = WARES[info.field.ware];
        s.cargo = { ware: w.id, amount: cls.capacity / w.volume };
        goTo(s, home, s.id);
        s.phase = 'toHome';
        s.status = `Bringt ${fmtN(s.cargo.amount)} ${w.name}`;
      }
      return;
    }
    case 'toHome': {
      if (moveAlong(s, cls.speed, dt)) {
        if (!s.cargo) { s.phase = 'waiting'; s.timer = 20; return; }
        if (!hasDockFor(home, cls.size)) {
          s.status = cls.size === 'L' ? 'Station hat keinen Pier' : 'Station hat kein Dock';
          s.phase = 'waiting';
          s.timer = 20;
          return;
        }
        s.phase = 'docking';
        s.timer = DOCK_TIME[cls.size];
        s.status = 'Dockt an';
      }
      return;
    }
    case 'docking': {
      s.timer -= dt;
      if (s.timer > 0) return;
      s.phase = 'unloading';
      return;
    }
    case 'unloading': {
      if (!s.cargo) { s.phase = 'idle'; return; }
      const n = Math.min(s.cargo.amount, freeUnits(home, s.cargo.ware));
      if (n > 0.5) {
        addWare(home, s.cargo.ware, n);
        s.cargo.amount -= n;
        state.totals.mined[s.cargo.ware] = (state.totals.mined[s.cargo.ware] ?? 0) + n;
        s.earned += n * WARES[s.cargo.ware].price.avg;
      }
      if (s.cargo.amount < 0.5) {
        s.cargo = null;
        s.trips++;
        s.phase = 'idle';
        s.miningField = '';
      } else {
        s.status = 'Wartet: Lager voll';
        s.phase = 'waiting';
        s.timer = 15;
      }
      return;
    }
    case 'waiting': {
      if (s.path.length) moveAlong(s, cls.speed, dt);
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.cargo) {
          if (s.sector === home.sector && Math.hypot(s.x - home.x, s.z - home.z) < 8) s.phase = hasDockFor(home, cls.size) ? 'unloading' : 'waiting';
          else { goTo(s, home, s.id); s.phase = 'toHome'; }
          s.timer = 15;
        } else s.phase = 'idle';
      }
      return;
    }
  }
}

// ---------- Transporter ----------

interface Candidate { job: TradeJob; score: number }

function unitsFor(s: Ship, wareId: string): number {
  return SHIP_MAP[s.cls].capacity / WARES[wareId].volume;
}

function placeOf(state: GameState, ep: TradeEndpoint): Place | null {
  return endpointPlace(state, ep);
}

function travelTime(state: GameState, s: Ship, a: TradeEndpoint, b: TradeEndpoint): number {
  const cls = SHIP_MAP[s.cls];
  const pa = placeOf(state, a), pb = placeOf(state, b);
  if (!pa || !pb) return Infinity;
  return (travelDistance(shipPlace(s), pa) + travelDistance(pa, pb)) / cls.speed + DOCK_TIME[cls.size] * 2 + 60;
}

function canDockAt(state: GameState, s: Ship, ep: TradeEndpoint): boolean {
  if (ep.kind === 'market') return true;
  const st = stationById(state, ep.id);
  return !!st && hasDockFor(st, SHIP_MAP[s.cls].size);
}

export function findTradeJob(state: GameState, s: Ship): TradeJob | null {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  if (!home) return null;
  const known = knownSectors(state);
  const cands: Candidate[] = [];
  if (!canDockAt(state, s, { kind: 'station', id: home.id })) return null;
  const minLoad = (id: string) => Math.min(unitsFor(s, id) * 0.3, Math.max(50, 60_000 / WARES[id].price.avg));
  // Der Transporter bedient seine Heimat und – nachrangig – alle eigenen Stationen im selben Sektor.
  const served = state.stations.filter((x) => x.id === home.id || x.sector === home.sector);
  for (const base of served) {
    const weight = base.id === home.id ? 1 : 0.55;
    const baseEp: TradeEndpoint = { kind: 'station', id: base.id };
    if (!canDockAt(state, s, baseEp)) continue;
    const nearbyMarkets = [base.sector, ...sector(base.sector).links.filter((l) => known.includes(l))];

    // 1) Überschüsse abgeben
    for (const id of stationWares(base)) {
      if (WARES[id].storage !== cls.storage) continue;
      const have = surplus(state, base, id);
      if (have < 1) continue;
      const qty = Math.min(have, unitsFor(s, id));
      const avg = WARES[id].price.avg;
      for (const other of state.stations) {
        if (other.id === base.id || !known.includes(other.sector)) continue;
        const to: TradeEndpoint = { kind: 'station', id: other.id };
        if (!canDockAt(state, s, to)) continue;
        const need = wanted(state, other, id);
        const n = Math.min(qty, need);
        if (n < minLoad(id)) continue;
        cands.push({ job: { ware: id, amount: n, from: baseEp, to, stage: 'pickup' }, score: (weight * n * avg * 1.5) / travelTime(state, s, baseEp, to) });
      }
      for (const c of state.contracts) {
        if (c.status !== 'active' || c.ware !== id) continue;
        const rest = c.amount - c.delivered - inTransitForContract(state, c.id);
        if (rest < 1) continue;
        const n = Math.min(qty, rest);
        // Restmengen eines Auftrags dürfen auch klein sein
        if (n < Math.min(minLoad(id), rest)) continue;
        const to: TradeEndpoint = { kind: 'market', sector: c.sector };
        const perUnit = c.story ? avg * 2 : c.reward / c.amount;
        const finishes = n >= rest - 0.5 ? 500_000 : 0; // Abschluss hat Vorrang
        cands.push({ job: { ware: id, amount: n, from: baseEp, to, stage: 'pickup', contract: c.id }, score: (weight * (n * perUnit * 1.2 + finishes)) / travelTime(state, s, baseEp, to) });
      }
      for (const sec of nearbyMarkets) {
        // Handelsposten und spezialisierte NPC-Käufer im Sektor
        for (const key of [sec, ...sector(sec).npcStations.filter((n) => n.buys.includes(id)).map((n) => n.id)]) {
          const room = marketRoom(state, key, id);
          const n = Math.min(qty, room);
          if (n < minLoad(id)) continue;
          const to: TradeEndpoint = key === sec ? { kind: 'market', sector: sec } : { kind: 'market', sector: sec, market: key };
          cands.push({ job: { ware: id, amount: n, from: baseEp, to, stage: 'pickup' }, score: (weight * marketTradeValue(state, key, id, n)) / travelTime(state, s, baseEp, to) });
        }
      }
    }

    // 2) Bedarf decken
    for (const id of stationWares(base)) {
      if (WARES[id].storage !== cls.storage) continue;
      const need = wanted(state, base, id);
      if (need < minLoad(id)) continue;
      const qty = Math.min(need, unitsFor(s, id));
      const avg = WARES[id].price.avg;
      for (const other of state.stations) {
        if (other.id === base.id || !known.includes(other.sector)) continue;
        const from: TradeEndpoint = { kind: 'station', id: other.id };
        if (!canDockAt(state, s, from)) continue;
        const have = surplus(state, other, id);
        if (have < minLoad(id)) continue;
        const n = Math.min(qty, have);
        cands.push({ job: { ware: id, amount: n, from, to: baseEp, stage: 'pickup' }, score: (weight * n * avg * 1.5) / travelTime(state, s, from, baseEp) });
      }
      if (WARES[id].mined && state.ships.some((m) => m.home === base.id && SHIP_MAP[m.cls].role === 'miner' && SHIP_MAP[m.cls].storage === WARES[id].storage)) continue;
      for (const sec of nearbyMarkets) {
        const stock = marketStock(state, sec, id);
        const price = marketPrice(state, sec, id);
        const afford = Math.max(0, state.credits - 50_000) / price;
        const n = Math.min(qty, stock * 0.8, afford);
        if (n < minLoad(id)) continue;
        const from: TradeEndpoint = { kind: 'market', sector: sec };
        // Einkauf lohnt sich, wenn der Preis nicht über dem Durchschnitt liegt
        const bonus = price <= avg ? 1 : 0.5;
        cands.push({ job: { ware: id, amount: n, from, to: baseEp, stage: 'pickup' }, score: (weight * n * avg * 0.9 * bonus) / travelTime(state, s, from, baseEp) });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0]?.job ?? null;
}

export function inTransitForContract(state: GameState, contractId: number): number {
  let n = 0;
  for (const s of state.ships) if (s.job?.contract === contractId) n += s.cargo?.amount ?? s.job.amount;
  for (const npc of state.npcs) if (npc.contract === contractId) n += npc.amount;
  return n;
}

function routeJob(state: GameState, s: Ship): TradeJob | null {
  const r = s.route;
  if (!r) return null;
  const units = unitsFor(s, r.ware);
  let have: number;
  if (r.from.kind === 'station') {
    const st = stationById(state, r.from.id);
    if (!st) return null;
    // Eine Station, die die Ware selbst verbraucht, behält eine Reserve
    const limit = wareLimit(st, r.ware);
    have = Math.max(0, (st.inventory[r.ware] ?? 0) - reserveFor(st, r.ware, limit) - outgoing(state, st.id, r.ware));
  } else if (r.from.kind === 'market' && r.from.market) {
    have = 0; // NPC-Käuferstationen verkaufen nichts
  } else {
    have = Math.min(marketStock(state, marketKey(r.from), r.ware) * 0.8, Math.max(0, state.credits - 50_000) / marketPrice(state, marketKey(r.from), r.ware));
  }
  let room: number;
  if (r.to.kind === 'station') {
    const st = stationById(state, r.to.id);
    if (!st) return null;
    room = freeUnits(st, r.ware);
  } else room = marketRoom(state, marketKey(r.to), r.ware);
  const n = Math.min(units, have, room);
  if (n < Math.min(units * 0.2, 100)) return null;
  return { ware: r.ware, amount: n, from: r.from, to: r.to, stage: 'pickup' };
}

function stepTrader(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  switch (s.phase) {
    case 'idle': {
      if (s.cargo && s.job) { startLeg(state, s); return; }
      if (s.cargo && !s.job) {
        // Restladung am nächsten Markt verkaufen
        s.job = { ware: s.cargo.ware, amount: s.cargo.amount, from: { kind: 'market', sector: s.sector }, to: { kind: 'market', sector: s.sector }, stage: 'deliver' };
        startLeg(state, s);
        return;
      }
      // Vom Spieler erteilte Aufträge haben Vorrang
      const order = s.orders?.shift();
      if (order) { s.job = order; startLeg(state, s); return; }
      const job = s.mode === 'route' ? routeJob(state, s) : findTradeJob(state, s);
      if (!job) {
        s.status = s.mode === 'route' ? 'Route wartet auf Ware oder Platz' : home && !hasDockFor(home, cls.size) ? (cls.size === 'L' ? 'Heimat hat keinen Pier' : 'Heimat hat kein Dock') : 'Sucht Handelsgelegenheit';
        s.phase = 'waiting';
        s.timer = 25;
        if (home && (s.sector !== home.sector || Math.hypot(s.x - home.x, s.z - home.z) > 10)) goTo(s, home, s.id), (s.phase = 'waiting');
        return;
      }
      s.job = job;
      startLeg(state, s);
      return;
    }
    case 'toTarget': {
      if (moveAlong(s, cls.speed, dt)) {
        s.phase = 'docking';
        s.timer = DOCK_TIME[cls.size];
        s.status = 'Dockt an';
      }
      return;
    }
    case 'docking': {
      s.timer -= dt;
      if (s.timer <= 0) doTrade(state, s);
      return;
    }
    case 'waiting': {
      if (s.path.length) moveAlong(s, cls.speed, dt);
      s.timer -= dt;
      if (s.timer <= 0) s.phase = 'idle';
      return;
    }
    default:
      s.phase = 'idle';
  }
}

function startLeg(state: GameState, s: Ship): void {
  const job = s.job!;
  const ep = job.stage === 'pickup' ? job.from : job.to;
  const place = endpointPlace(state, ep);
  if (!place) { s.job = null; s.phase = 'idle'; return; }
  goTo(s, place, s.id);
  const w = WARES[job.ware].name;
  s.status = job.stage === 'pickup' ? `Holt ${w} bei ${endpointName(state, ep)}` : `Liefert ${w} an ${endpointName(state, ep)}`;
}

function doTrade(state: GameState, s: Ship): void {
  const job = s.job;
  if (!job) { s.phase = 'idle'; return; }
  const units = unitsFor(s, job.ware);
  if (job.stage === 'pickup') {
    let n = 0;
    if (job.from.kind === 'station') {
      const st = stationById(state, job.from.id);
      if (st) {
        n = Math.min(job.amount, units, sellableStock(st, job.ware));
        addWare(st, job.ware, -n);
      }
    } else {
      const key = marketKey(job.from);
      const price = marketPrice(state, key, job.ware);
      n = job.from.market ? 0 : Math.min(job.amount, units, marketStock(state, key, job.ware), Math.max(0, state.credits - 10_000) / price);
      if (n > 0) {
        const cost = applyMarketTrade(state, key, job.ware, -n);
        const home = stationById(state, s.home);
        if (home) home.expenses += cost;
        s.earned -= cost;
      }
    }
    if (n < 1) { s.job = null; s.phase = 'idle'; return; }
    s.cargo = { ware: job.ware, amount: n };
    job.amount = n;
    job.stage = 'deliver';
    startLeg(state, s);
    return;
  }
  // Abliefern
  if (!s.cargo) { s.job = null; s.phase = 'idle'; return; }
  const w = WARES[s.cargo.ware];
  if (job.to.kind === 'station') {
    const st = stationById(state, job.to.id);
    if (st) {
      const n = Math.min(s.cargo.amount, freeUnits(st, s.cargo.ware));
      addWare(st, s.cargo.ware, n);
      s.cargo.amount -= n;
      s.earned += n * w.price.avg * 0.1;
    }
  } else {
    const key = marketKey(job.to);
    if (job.contract != null) {
      const used = contractDeliver(state, job.contract, s.cargo.ware, s.cargo.amount);
      s.cargo.amount -= used;
      state.totals.delivered += used;
    }
    if (s.cargo.amount > 0.5) {
      // NPC-Käufer nehmen nur, was in ihr Lager passt; der Handelsposten etwas mehr zum Mindestpreis
      const n = Math.min(s.cargo.amount, marketRoom(state, key, s.cargo.ware) + (job.to.market ? 0 : s.cargo.amount * 0.2));
      if (n > 0) {
        const value = applyMarketTrade(state, key, s.cargo.ware, n);
        s.cargo.amount -= n;
        s.earned += value;
        const home = stationById(state, s.home);
        if (home) home.income += value;
        const place = marketInfo(key);
        emit({ type: 'sale', station: '', sector: place.sector, x: place.x, z: place.z, value });
      }
    }
  }
  s.trips++;
  if (s.cargo.amount < 0.5) s.cargo = null;
  if (s.cargo) {
    // Nicht alles abgesetzt: Rest beim nächsten Leerlauf am Markt verkaufen
    log(state, `${s.name}: ${fmtN(s.cargo.amount)} ${w.name} konnten nicht abgeliefert werden.`, 'warn');
    s.job = null;
  } else s.job = null;
  s.phase = 'idle';
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

/** Voraussichtliche Sekunden bis das Schiff seine Heimat wieder erreicht (für Anzeigen) */
export function shipEta(state: GameState, s: Ship): number | null {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  if (!home) return null;
  const toHome = travelDistance(shipPlace(s), home) / cls.speed;
  if (cls.role === 'miner') {
    if (s.phase === 'toTarget') {
      const info = fieldById(s.miningField);
      if (!info) return null;
      const a = { sector: info.sector.id, x: info.field.x, z: info.field.z };
      return travelDistance(shipPlace(s), a) / cls.speed + cls.capacity / (cls.miningRate * info.field.richness) + travelDistance(a, home) / cls.speed;
    }
    if (s.phase === 'mining') return s.timer + toHome;
    if (s.phase === 'toHome') return toHome;
    if (s.phase === 'docking') return s.timer;
  }
  return null;
}
