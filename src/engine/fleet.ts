// Verhalten der eigenen Schiffe: Miner fördern für ihre Heimatstation,
// Transporter handeln automatisch oder fliegen feste Versorgungslinien.
import { marketInfo, sector } from '../data/sectors';
import { MODULE_MAP } from '../data/modules';
import { DOCK_TIME, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { addWare, applyMarketTrade, freeUnits, hasDockFor, stationRates, storageCap, marketPrice, marketRoom, marketStock, marketTradeValue, stationWares, wareLimit } from './economy';
import {
  dockPoint, sellableStock, endpointName, endpointPlace, fieldById, fieldWare, incoming, knownSectors, marketKey, moveAlong, outgoing, planPath, reserveFor, stationById, surplus, travelDistance, wanted,
  type Place,
} from './logistics';
import { contractDeliver } from './contracts';
import type { GameState, RestAction, RestCase, Ship, Station, TradeEndpoint, TradeJob } from './types';
import { emit, log, rand } from './util';

export function shipPlace(s: Ship): Place {
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

type MiningChoice = { ware: string; field: string; sellKey?: string } | { reason: string };

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
  const starving = starvingInputs(home);
  const production: { ware: string; field: string; score: number }[] = [];
  const sale: { ware: string; field: string; score: number }[] = [];
  let full = false;
  for (const f of fields) {
    const w = WARES[f.ware];
    const load = cls.capacity / w.volume;
    const dist = Math.hypot(f.x - home.x, f.z - home.z);
    const trip = (2 * dist) / cls.speed + cls.capacity / (cls.miningRate * f.richness) + DOCK_TIME[cls.size];
    const use = Math.max(0, (rates[f.ware]?.use ?? 0) - (rates[f.ware]?.prod ?? 0));
    // Ware, die andere Miner schon bringen (ohne dieses Schiff)
    const others = incoming(state, home.id, f.ware) - (s.miningField && fieldWare(s.miningField) === f.ware && !s.cargo ? load : 0);
    // Platz bei Ankunft: frei − schon unterwegs + höchstens eine halbe Ladung Verbrauch während der Fahrt
    const room = freeUnits(home, f.ware) - others + Math.min((use * trip) / 3600, load * 0.5);
    if (room < load * 0.25) { full = true; continue; }
    if (use > 0 || s.mineWare) {
      // Vorrang hat, was im Lager am knappsten ist (Füllstand inkl. unterwegs), Fehlendes für stehende Module zuerst
      const limit = wareLimit(home, f.ware);
      const fill = limit > 0 ? Math.min(1, ((home.inventory[f.ware] ?? 0) + others) / limit) : 1;
      const score = (1 - fill) * 10 + (starving.has(f.ware) ? 5 : 0) - dist / 1000;
      production.push({ ware: f.ware, field: f.id, score });
    } else sale.push({ ware: f.ware, field: f.id, score: (Math.min(room, load) / (1 + dist / 100)) * w.price.avg });
  }
  const best = (production.length ? production : sale).sort((a, b) => b.score - a.score)[0];
  if (best) return { ware: best.ware, field: best.field };
  // Alles voll: auf Wunsch direkt für den Markt fördern statt untätig zu warten
  if (full && restMode(s) !== 'wait') {
    const pick = fields.map((f) => {
      const m = bestMarketFor(state, home, f.ware, cls.capacity / WARES[f.ware].volume);
      return m ? { f, m } : null;
    }).filter(Boolean).sort((a, b) => b!.m.score - a!.m.score)[0];
    if (pick) return { ware: pick.f.ware, field: pick.f.id, sellKey: pick.m.key };
  }
  return { reason: full ? 'Lager voll – wartet auf Platz' : 'Kein Rohstoffbedarf' };
}

/** Eingangswaren, auf die Produktionsmodule der Station gerade warten */
function starvingInputs(st: Station): Set<string> {
  const out = new Set<string>();
  for (const m of st.modules) {
    if (m.stall !== 'input') continue;
    const d = MODULE_MAP[m.def];
    if (!d?.ware) continue;
    for (const i of WARES[d.ware].inputs) if ((st.inventory[i.ware] ?? 0) < i.amount) out.add(i.ware);
  }
  return out;
}

/** Bester erreichbarer Käufer für eine Miner-Ladung: Handelsposten oder NPC-Station, die die Ware ankauft */
export function bestMarketFor(state: GameState, from: Place, ware: string, amount: number): { key: string; value: number; score: number } | null {
  let best: { key: string; value: number; score: number } | null = null;
  for (const secId of knownSectors(state)) {
    const keys = [secId, ...sector(secId).npcStations.filter((n) => n.buys.includes(ware)).map((n) => n.id)];
    for (const key of keys) {
      if (!state.markets[key]?.[ware]) continue;
      const info = marketInfo(key);
      // NPC-Käufer nehmen nur, was in ihr Lager passt; der Handelsposten nimmt alles (Preis fällt)
      const n = info.npc ? Math.min(amount, marketRoom(state, key, ware)) : amount;
      if (n < amount * 0.5) continue;
      const value = marketTradeValue(state, key, ware, n);
      const time = travelDistance(from, { sector: info.sector, x: info.x, z: info.z }) / 2 + 60;
      const score = value / time;
      if (!best || score > best.score) best = { key, value, score };
    }
  }
  return best;
}

/** Nächster erreichbarer Handelsposten – nimmt jede Menge ab */
function nearestTradePost(state: GameState, from: Place): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const secId of knownSectors(state)) {
    const ts = sector(secId).tradeStation;
    const d = travelDistance(from, { sector: secId, x: ts.x, z: ts.z });
    if (d < bestD) { bestD = d; best = secId; }
  }
  return best;
}

/** Ladung am Markt verkaufen: Handelsposten nimmt alles, NPC-Käufer nur bis zu ihrem freien Platz */
function sellCargo(state: GameState, s: Ship, key: string): number {
  if (!s.cargo) return 0;
  const info = marketInfo(key);
  const n = info.npc ? Math.min(s.cargo.amount, marketRoom(state, key, s.cargo.ware)) : s.cargo.amount;
  if (n < 0.5) return 0;
  const value = applyMarketTrade(state, key, s.cargo.ware, n);
  s.cargo.amount -= n;
  s.earned += value;
  const home = stationById(state, s.home);
  if (home) home.income += value;
  state.totals.mined[s.cargo.ware] = (state.totals.mined[s.cargo.ware] ?? 0) + n;
  emit({ type: 'sale', station: '', sector: info.sector, x: info.x, z: info.z, value });
  return value;
}

/** Überschuss zum besten Käufer bringen */
function headToMarket(s: Ship, key: string): void {
  const info = marketInfo(key);
  s.sellKey = key;
  goTo(s, { sector: info.sector, x: info.x, z: info.z }, s.id);
  s.phase = 'toMarket';
  s.status = `Lager voll – verkauft ${WARES[s.cargo?.ware ?? 'ore'].name} bei ${info.name}`;
}

export function restMode(s: Ship): RestAction {
  return s.restAction ?? (s.fullAction === 'wait' ? 'wait' : 'auto');
}

/** Felder einer Ware im Heimatsektor, nächstes zuerst */
function fieldsOf(home: Station, ware: string) {
  return sector(home.sector).fields.filter((f) => f.ware === ware).sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z));
}

/** Andere Ware derselben Lagerart, die die Station dringender braucht (Füllstand unter 75 %, also spürbar Platz) */
function urgentOther(state: GameState, s: Ship, home: Station, ware: string): string | null {
  if (s.mineWare) return null;
  const cls = SHIP_MAP[s.cls];
  const rates = stationRates(home);
  let best: { w: string; fill: number } | null = null;
  for (const f of sector(home.sector).fields) {
    const w = f.ware;
    if (w === ware || WARES[w].storage !== cls.storage) continue;
    const use = Math.max(0, (rates[w]?.use ?? 0) - (rates[w]?.prod ?? 0));
    if (use <= 0) continue;
    const limit = wareLimit(home, w);
    const fill = limit > 0 ? ((home.inventory[w] ?? 0) + incoming(state, home.id, w)) / limit : 1;
    if (fill < 0.75 && freeUnits(home, w) > (cls.capacity / WARES[w].volume) * 0.25 && (!best || fill < best.fill)) best = { w, fill };
  }
  return best?.w ?? null;
}

/**
 * Was tun mit einer Restladung, die nicht mehr ins Lager passt? Vergleicht drei Wege:
 * Warten (bis der Verbrauch Platz macht), Verkaufen (Umweg zum Käufer) und Nachfüllen (Rest bleibt an Bord,
 * der Miner baut nur den freien Laderaum ab – kostet keine Zeit, solange dieselbe Ware weiter gebraucht wird).
 */
export function decideRest(state: GameState, s: Ship, home: Station): RestCase {
  const cls = SHIP_MAP[s.cls];
  const cargo = s.cargo!;
  const w = WARES[cargo.ware];
  const r = stationRates(home)[cargo.ware];
  const use = r ? Math.max(0, r.use - r.prod) : 0;
  const wait = use > 0 ? (cargo.amount / use) * 3600 : null;
  const m = bestMarketFor(state, home, cargo.ware, cargo.amount);
  const field = fieldsOf(home, cargo.ware)[0];
  const topupOk = !!field && (!s.mineWare || s.mineWare === cargo.ware);
  const topupSaves = field ? (cargo.amount * w.volume) / (cls.miningRate * field.richness) : 0;
  // Verkaufen kostet den Umweg – und braucht die Station die Ware, muss die verkaufte Menge später erneut gefördert werden
  const sell = m ? (2 * travelDistance(home, marketInfo(m.key))) / cls.speed + DOCK_TIME[cls.size] + (use > 0 ? topupSaves : 0) : null;
  const base = { t: state.time, ware: cargo.ware, amount: cargo.amount, wait, sell, sellValue: m?.value ?? 0, topup: topupOk ? 0 : null, topupSaves };
  const cheaper = (why: string): RestCase => {
    if (wait != null && (sell == null || wait <= sell)) return { ...base, choice: 'wait', reason: why + ' – Warten ist kürzer als der Umweg.' };
    if (sell != null) return { ...base, choice: 'sell', reason: why + ' – der Umweg zum Käufer ist kürzer als Warten.' };
    return { ...base, choice: 'wait', reason: why + ' – kein Käufer erreichbar.' };
  };
  const mode = restMode(s);
  if (mode === 'wait') return { ...base, choice: 'wait', reason: 'Fest eingestellt: Warten.' };
  if (mode === 'sell') return sell != null ? { ...base, choice: 'sell', reason: 'Fest eingestellt: Verkaufen.' } : { ...base, choice: 'wait', reason: 'Verkaufen eingestellt, aber kein Käufer erreichbar.' };
  if (mode === 'topup') return topupOk ? { ...base, choice: 'topup', reason: 'Fest eingestellt: Nachfüllen.' } : cheaper('Nachfüllen eingestellt, aber kein passendes Feld');
  // Automatik
  if (use <= 0) return cheaper(`Die Station verbraucht kein ${w.name}`);
  const other = urgentOther(state, s, home, cargo.ware);
  if (other) return cheaper(`Die Station braucht dringender ${WARES[other].name}`);
  if ((s.restStreak ?? 0) >= 2 && sell != null) return { ...base, choice: 'sell', reason: `Zum ${s.restStreak}. Mal in Folge ein Rest – die Miner fördern mehr ${w.name}, als die Station verbraucht.` };
  if (topupOk) return { ...base, choice: 'topup', reason: `${w.name} wird weiter gebraucht – der Rest bleibt an Bord, Nachfüllen kostet keine Zeit.` };
  return cheaper('Kein Feld zum Nachfüllen');
}

/** Rest an Bord behalten und am nächsten Feld derselben Ware auffüllen */
function startTopUp(state: GameState, s: Ship, home: Station): void {
  const f = fieldsOf(home, s.cargo!.ware)[0];
  const info = fieldById(f.id)!;
  const a = rand(state) * Math.PI * 2;
  const r = Math.sqrt(rand(state)) * info.field.r * 0.6;
  s.miningField = f.id;
  s.topUp = true;
  s.sellKey = undefined;
  goTo(s, { sector: info.sector.id, x: info.field.x + Math.cos(a) * r, z: info.field.z + Math.sin(a) * r });
  s.phase = 'toTarget';
  s.status = `Füllt auf: ${WARES[s.cargo!.ware].name} (${fmtN(s.cargo!.amount)} an Bord)`;
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
      s.sellKey = choice.sellKey;
      goTo(s, { sector: info.sector.id, x: info.field.x + Math.cos(a) * r, z: info.field.z + Math.sin(a) * r });
      s.status = choice.sellKey ? `Lager voll – fördert ${WARES[choice.ware].name} für den Markt` : `Fliegt zum Feld: ${WARES[choice.ware].name}`;
      return;
    }
    case 'toTarget': {
      if (moveAlong(s, cls.speed, dt)) {
        const info = fieldById(s.miningField);
        if (!info) { s.phase = 'idle'; return; }
        s.phase = 'mining';
        // Beim Nachfüllen nur den freien Laderaum abbauen
        const used = s.cargo && s.cargo.ware === info.field.ware ? s.cargo.amount * WARES[s.cargo.ware].volume : 0;
        s.timer = Math.max(0, cls.capacity - used) / (cls.miningRate * info.field.richness);
        s.status = used ? `Füllt auf: ${WARES[info.field.ware].name}` : `Baut ${WARES[info.field.ware].name} ab`;
      }
      return;
    }
    case 'mining': {
      s.timer -= dt;
      if (s.timer <= 0) {
        const info = fieldById(s.miningField)!;
        const w = WARES[info.field.ware];
        s.cargo = { ware: w.id, amount: cls.capacity / w.volume };
        s.topUp = false;
        // Für den Markt gefördert: nur nach Hause, wenn dort inzwischen Platz für fast die ganze Ladung ist –
        // sonst Umweg nach Hause für einen kleinen Teil. Die Entscheidung fällt einmal; unterwegs wird nicht umgeplant.
        if (s.sellKey && freeUnits(home, w.id) < s.cargo.amount * 0.75) { headToMarket(s, s.sellKey); return; }
        s.sellKey = undefined;
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
      // Wiederholter Versuch nach kurzem Warten zählt nicht als neue Restladung
      const retry = !!s.lastRest && s.lastRest.choice === 'wait' && s.lastRest.ware === s.cargo.ware && state.time - s.lastRest.t < 600 && (s.status.startsWith('Lädt ab') || s.status === 'Wartet: Lager voll');
      if (s.cargo.amount < 0.5) {
        s.cargo = null;
        s.trips++;
        s.phase = 'idle';
        s.miningField = '';
        if (!retry) s.restStreak = 0;
        return;
      }
      if (!retry) s.restStreak = (s.restStreak ?? 0) + 1;
      const c = decideRest(state, s, home);
      s.lastRest = c;
      if (c.choice === 'topup') { startTopUp(state, s, home); return; }
      if (c.choice === 'sell') {
        const m = bestMarketFor(state, home, s.cargo.ware, s.cargo.amount);
        if (m) { headToMarket(s, m.key); return; }
      }
      s.status = restMode(s) === 'wait' ? 'Wartet: Lager voll' : 'Lädt ab – wartet kurz auf Platz';
      s.phase = 'waiting';
      s.timer = Math.max(10, Math.min(30, c.wait ?? 15));
      return;
    }
    case 'toMarket': {
      if (moveAlong(s, cls.speed, dt)) { s.phase = 'selling'; s.timer = DOCK_TIME[cls.size]; s.status = `Verkauft an ${marketInfo(s.sellKey ?? home.sector).name}`; }
      return;
    }
    case 'selling': {
      s.timer -= dt;
      if (s.timer > 0) return;
      const key = s.sellKey ?? home.sector;
      const value = sellCargo(state, s, key);
      if (s.cargo && s.cargo.amount > 0.5) {
        // Nur NPC-Käufer nehmen begrenzt ab. Den Rest nimmt der nächste Handelsposten vollständig –
        // so endet jede Verkaufsfahrt nach höchstens zwei Stationen, kein Hin und Her.
        const post = nearestTradePost(state, s);
        if (post && post !== key) { headToMarket(s, post); return; }
        sellCargo(state, s, post ?? home.sector);
        s.cargo = null;
      }
      log(state, `${s.name}: Überschuss verkauft für ${Math.round(value).toLocaleString('de-DE')} Cr (${marketInfo(key).name}).`, 'info');
      s.cargo = null;
      s.trips++;
      s.sellKey = undefined;
      s.miningField = '';
      s.phase = 'idle';
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
