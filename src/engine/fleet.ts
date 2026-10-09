// Verhalten der eigenen Schiffe: Miner fördern für ihre Heimatstation,
// Transporter handeln automatisch oder fliegen feste Versorgungslinien.
import { NPC_MAP, SECTOR_MAP, marketInfo, sector } from '../data/sectors';
import { MODULE_MAP } from '../data/modules';
import { DOCK_TIME, SHIP_MAP } from '../data/ships';
import { WARES } from '../data/wares';
import { BUILD_TOLERANCE, spendable, addWare, applyMarketTrade, buildDemand, buildRoom, receiveWare, roomAt, freeUnits, hasDockFor, stationRates, storageCap, marketPrice, marketRoom, marketStock, marketTradeValue, pendingNeeds, stationWares, wareLimit } from './economy';
import {
  dockPoint, sellableStock, endpointName, endpointPlace, fieldById, fieldWare, incoming, knownSectors, marketKey, moveAlong, outgoing, planPath, reserveFor, stationById, surplus, travelDistance, wanted,
  type Place,
} from './logistics';
import { contractDeliver, isDelivery, wareSellers } from './contracts';
import { endOf, fieldEnd, recordFlow, stationEnd } from './flows';
import type { Contract, FieldDef, GameState, RouteOrder, RestAction, RestCase, Ship, ShipClassDef, Station, TradeEndpoint, TradeJob } from './types';
import { emit, log, rand } from './util';
import { intelAge, knows, noteMarket, seenPrice, seenRoom, seenStock } from './intel';
import { FIELD_STEPS, fieldCapFactor, fieldFloor, fieldRegenFactor, finishSurvey, stepFieldUp } from './fieldUp';
import { RANK_RANGE, applyOpportunity, effectivePrice, noteDelivery, noteTrip, pilotRank, relationBonus } from './trading';

/**
 * Rohstofffelder (neue Spiele): Der Vorrat eines Felds erschöpft sich beim Abbau und wächst langsam nach.
 * Je leerer das Feld, desto länger dauert eine Ladung – viele Miner auf einem Feld bringen abnehmenden Ertrag.
 */
export const FIELD_REGEN = 0.2; // Anteil des Vorrats pro Stunde
export function fieldCap(f: FieldDef, state?: GameState): number {
  return f.r * f.r * 60 * f.richness * (state ? fieldCapFactor(state, f.id) : 1); // m³, mit Feldausbau
}
export function fieldLevel(state: GameState, fieldId: string): number {
  return state.start ? state.fieldStock?.[fieldId] ?? 1 : 1;
}
/** Abbaurate in m³/s an einem Feld (mit Erschöpfung) */
export function mineRate(state: GameState, cls: ShipClassDef, fieldId?: string): number {
  if (!fieldId) return cls.miningRate;
  const floor = fieldFloor(state, fieldId);
  return cls.miningRate * (floor + (1 - floor) * fieldLevel(state, fieldId));
}
function depleteField(state: GameState, f: FieldDef, m3: number): void {
  if (!state.start) return;
  (state.fieldStock ??= {})[f.id] = Math.max(0, fieldLevel(state, f.id) - m3 / fieldCap(f, state));
}
export function stepFields(state: GameState, dt: number): void {
  const fs = state.fieldStock;
  if (!fs) return;
  for (const id in fs) fs[id] = Math.min(1, fs[id] + (FIELD_REGEN * fieldRegenFactor(state, id) * dt) / 3600);
  stepFieldUp(state);
}

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
  if (cls.role === 'miner') { if (s.home) stepMiner(state, s, dt); else stepFreeMiner(state, s, dt); }
  else stepTrader(state, s, dt);
}

// ---------- Miner ----------

type MiningChoice = { ware: string; field: string; sellKey?: string; direct?: boolean } | { reason: string };

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
  const sale: { ware: string; field: string; score: number; sellKey?: string }[] = [];
  let full = false;
  for (const f of fields) {
    const w = WARES[f.ware];
    const load = cls.capacity / w.volume;
    const dist = Math.hypot(f.x - home.x, f.z - home.z);
    const trip = (2 * dist) / cls.speed + cls.capacity / (mineRate(state, cls, f.id) * f.richness) + DOCK_TIME[cls.size];
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
    } else if (state.start) {
      // Neue Spiele: nur fördern, wofür es einen Käufer mit Platz gibt – bewertet nach Erlös pro Flugzeit
      const m = bestMarketFor(state, { sector: home.sector, x: f.x, z: f.z }, f.ware, Math.min(room, load));
      if (m) sale.push({ ware: f.ware, field: f.id, score: m.score / (1 + dist / 100), sellKey: m.key });
    } else sale.push({ ware: f.ware, field: f.id, score: (Math.min(room, load) / (1 + dist / 100)) * w.price.avg });
  }
  if (production.length) { const best = production.sort((a, b) => b.score - a.score)[0]; return { ware: best.ware, field: best.field }; }
  const best = sale.sort((a, b) => b.score - a.score)[0];
  // Neue Spiele: Was die Heimat nicht braucht, fliegt direkt zum Käufer – im Lager brächte es nichts ein
  if (best) return best.sellKey ? { ware: best.ware, field: best.field, sellKey: best.sellKey, direct: true } : { ware: best.ware, field: best.field };
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
      if (!state.markets[key]?.[ware] || !knows(state, key)) continue;
      const info = marketInfo(key);
      // NPC-Käufer nehmen nur, was in ihr Lager passt; der Handelsposten nimmt alles (Preis fällt) – in neuen Spielen
      // auch er nur, was in sein Lager passt
      // Entschieden wird mit dem bekannten Stand (live oder Momentaufnahme)
      const room = state.start ? seenRoom(state, key, ware) ?? 0 : marketRoom(state, key, ware);
      const n = info.npc || state.start ? Math.min(amount, room) : amount;
      if (n < amount * 0.5) continue;
      const value = state.start ? n * (seenPrice(state, key, ware) ?? 0) : marketTradeValue(state, key, ware, n);
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
  recordFlow(state, fieldEnd(s.miningField), { key: 'm:' + key, sector: info.sector, x: info.x, z: info.z }, s.cargo.ware, n);
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
  const topupSaves = field ? (cargo.amount * w.volume) / (mineRate(state, cls, field.id) * field.richness) : 0;
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
  s.sellDirect = undefined;
  goTo(s, { sector: info.sector.id, x: info.field.x + Math.cos(a) * r, z: info.field.z + Math.sin(a) * r });
  s.phase = 'toTarget';
  s.status = `Füllt auf: ${WARES[s.cargo!.ware].name} (${fmtN(s.cargo!.amount)} an Bord)`;
}

/**
 * Freier Miner mit Sektorbefehl: baut einen Rohstoff in einem Sektor ab und verkauft an den bestbietenden bekannten
 * Abnehmer im Sektor – oder liefert dauerhaft an einen fest eingestellten (Markt oder eigene Station).
 */
function stepFreeMiner(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const o = s.sectorOrder;
  if (s.survey && (s.surveyGo || s.phase === 'surveying' || (!s.cargo && (s.phase === 'idle' || s.phase === 'waiting')))) { stepSurvey(state, s, dt); return; }
  switch (s.phase) {
    case 'idle': {
      if (!o) { s.status = 'Frei – wartet auf Befehl'; s.phase = 'waiting'; s.timer = 10; return; }
      if (s.cargo) { freeMinerSell(state, s); return; }
      const fields = sector(o.sector).fields.filter((f) => f.ware === o.ware);
      const f = fields.sort((a, b) => fieldLevel(state, b.id) * b.richness - fieldLevel(state, a.id) * a.richness)[0];
      if (!f) { s.status = 'Kein passendes Feld im Sektor'; s.phase = 'waiting'; s.timer = 30; return; }
      const a = rand(state) * Math.PI * 2, r = Math.sqrt(rand(state)) * f.r * 0.6;
      s.miningField = f.id;
      goTo(s, { sector: o.sector, x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r });
      s.status = `Fliegt zum Feld: ${WARES[f.ware].name}`;
      return;
    }
    case 'toTarget': {
      if (!moveAlong(s, cls.speed, dt)) return;
      const info = fieldById(s.miningField);
      if (!info) { s.phase = 'idle'; return; }
      const used = s.cargo && s.cargo.ware === info.field.ware ? s.cargo.amount * WARES[s.cargo.ware].volume : 0;
      s.phase = 'mining';
      s.timer = Math.max(0, cls.capacity - used) / (mineRate(state, cls, info.field.id) * info.field.richness);
      s.status = `Baut ${WARES[info.field.ware].name} ab`;
      return;
    }
    case 'mining': {
      s.timer -= dt;
      if (s.timer > 0) return;
      const info = fieldById(s.miningField);
      if (!info) { s.phase = 'idle'; return; }
      const w = WARES[info.field.ware];
      const before = s.cargo && s.cargo.ware === w.id ? s.cargo.amount * w.volume : 0;
      depleteField(state, info.field, cls.capacity - before);
      s.cargo = { ware: w.id, amount: cls.capacity / w.volume };
      freeMinerSell(state, s);
      return;
    }
    case 'toMarket': {
      if (moveAlong(s, cls.speed, dt)) { s.phase = 'selling'; s.timer = DOCK_TIME[cls.size]; s.status = 'Dockt an'; }
      return;
    }
    case 'selling': {
      s.timer -= dt;
      if (s.timer > 0 || !s.cargo) return;
      const key = s.sellKey ?? '';
      if (key.startsWith('st:')) {
        const st = stationById(state, key.slice(3));
        if (st) {
          const n = receiveWare(state, st, s.cargo.ware, s.cargo.amount, 'own');
          recordFlow(state, fieldEnd(s.miningField), stationEnd(state, st.id), s.cargo.ware, n);
          state.totals.mined[s.cargo.ware] = (state.totals.mined[s.cargo.ware] ?? 0) + n;
          s.earned += n * WARES[s.cargo.ware].price.avg;
          s.cargo.amount -= n;
        }
      } else if (key) {
        sellCargo(state, s, key);
        noteMarket(state, key);
      }
      s.trips++;
      noteTrip(state, s);
      s.sellKey = undefined;
      if (s.cargo && s.cargo.amount > 0.5) {
        // Rest: Abnehmer voll – kurz warten und erneut versuchen
        s.status = 'Abnehmer voll – wartet mit Restladung';
        s.phase = 'waiting';
        s.timer = 60;
        return;
      }
      s.cargo = null;
      s.miningField = '';
      s.phase = 'idle';
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

/** Freier Miner: Ladung zum festen Abnehmer oder zum Bestbietenden im Sektor bringen */
function freeMinerSell(state: GameState, s: Ship): void {
  const o = s.sectorOrder;
  const cargo = s.cargo!;
  let key = o?.to ?? '';
  if (!key) {
    let best: { key: string; score: number } | null = null;
    const sec = o?.sector ?? s.sector;
    for (const k of [sec, ...sector(sec).npcStations.filter((n) => n.buys.includes(cargo.ware)).map((n) => n.id)]) {
      if (!state.markets[k]?.[cargo.ware] || !knows(state, k)) continue;
      const price = seenPrice(state, k, cargo.ware), room = seenRoom(state, k, cargo.ware);
      if (price == null || room == null || room < cargo.amount * 0.5) continue;
      if (!best || price > best.score) best = { key: k, score: price };
    }
    key = best?.key ?? sec;
  }
  s.sellKey = key;
  if (key.startsWith('st:')) {
    const st = stationById(state, key.slice(3));
    if (!st) { s.sellKey = undefined; s.status = 'Abnehmer nicht gefunden'; s.phase = 'waiting'; s.timer = 30; return; }
    goTo(s, st, s.id);
    s.status = `Liefert ${WARES[cargo.ware].name} an ${st.name}`;
  } else {
    const info = marketInfo(key);
    goTo(s, { sector: info.sector, x: info.x, z: info.z }, s.id);
    s.status = `Verkauft ${WARES[cargo.ware].name} bei ${info.name}`;
  }
  s.phase = 'toMarket';
}

function stepSurvey(state: GameState, s: Ship, dt: number): void {
  const info = fieldById(s.survey!);
  if (!info) { s.survey = undefined; s.surveyGo = false; s.phase = 'idle'; return; }
  const cls = SHIP_MAP[s.cls];
  if (s.phase === 'surveying') {
    s.timer -= dt;
    s.status = `Vermisst ${WARES[info.field.ware].name}-Feld · noch ${Math.ceil(Math.max(0, s.timer) / 60)} min`;
    if (s.timer <= 0) {
      finishSurvey(state, info.field.id);
      s.survey = undefined;
      s.phase = 'idle';
    }
    return;
  }
  if (!s.surveyGo) {
    goTo(s, { sector: info.sector.id, x: info.field.x, z: info.field.z });
    s.surveyGo = true;
    s.status = `Fliegt zur Vermessung: ${WARES[info.field.ware].name}-Feld`;
    return;
  }
  if (moveAlong(s, cls.speed, dt)) {
    s.surveyGo = false;
    s.phase = 'surveying';
    s.timer = FIELD_STEPS[0].time;
  }
}

function stepMiner(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  if (!home) { s.status = 'Keine Heimatstation'; return; }
  // Feldausbau: Vermessung – erst die laufende Ladung abliefern, dann eine Stunde vor Ort kartieren
  if (s.survey && (s.surveyGo || s.phase === 'surveying' || (!s.cargo && (s.phase === 'idle' || s.phase === 'waiting')))) { stepSurvey(state, s, dt); return; }
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
      s.sellDirect = choice.direct || undefined;
      goTo(s, { sector: info.sector.id, x: info.field.x + Math.cos(a) * r, z: info.field.z + Math.sin(a) * r });
      s.status = choice.direct ? `Fördert ${WARES[choice.ware].name} für ${marketInfo(choice.sellKey!).name}` : choice.sellKey ? `Lager voll – fördert ${WARES[choice.ware].name} für den Markt` : `Fliegt zum Feld: ${WARES[choice.ware].name}`;
      return;
    }
    case 'toTarget': {
      if (moveAlong(s, cls.speed, dt)) {
        const info = fieldById(s.miningField);
        if (!info) { s.phase = 'idle'; return; }
        s.phase = 'mining';
        // Beim Nachfüllen nur den freien Laderaum abbauen
        const used = s.cargo && s.cargo.ware === info.field.ware ? s.cargo.amount * WARES[s.cargo.ware].volume : 0;
        s.timer = Math.max(0, cls.capacity - used) / (mineRate(state, cls, info.field.id) * info.field.richness);
        s.status = used ? `Füllt auf: ${WARES[info.field.ware].name}` : `Baut ${WARES[info.field.ware].name} ab`;
      }
      return;
    }
    case 'mining': {
      s.timer -= dt;
      if (s.timer <= 0) {
        const info = fieldById(s.miningField)!;
        const w = WARES[info.field.ware];
        const before = s.cargo && s.cargo.ware === w.id ? s.cargo.amount * w.volume : 0;
        depleteField(state, info.field, cls.capacity - before);
        s.cargo = { ware: w.id, amount: cls.capacity / w.volume };
        s.topUp = false;
        // Für den Markt gefördert: nur nach Hause, wenn dort inzwischen Platz für fast die ganze Ladung ist –
        // sonst Umweg nach Hause für einen kleinen Teil. Die Entscheidung fällt einmal; unterwegs wird nicht umgeplant.
        if (s.sellKey && (s.sellDirect || freeUnits(home, w.id) < s.cargo.amount * 0.75)) { headToMarket(s, s.sellKey); return; }
        s.sellKey = undefined;
        s.sellDirect = undefined;
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
        recordFlow(state, fieldEnd(s.miningField), stationEnd(state, home.id), s.cargo.ware, n);
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
      log(state, `${s.name}: ${s.sellDirect ? 'Ladung' : 'Überschuss'} verkauft für ${Math.round(value).toLocaleString('de-DE')} Cr (${marketInfo(key).name}).`, 'info');
      s.cargo = null;
      s.trips++;
      s.sellKey = undefined;
      s.sellDirect = undefined;
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

interface Candidate {
  job: TradeJob;
  score: number;
  /** Lieferung von der Heimat an eine andere eigene Station: deren ID und welcher Anteil der möglichen Ladung dort abgenommen wird */
  toStation?: string;
  fill?: number;
}

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
  // Ohne Dock an der Heimat bleibt nur die Belieferung ihres Baulagers (das nimmt Schiffe auch ohne Dock an)
  const homeDock = canDockAt(state, s, { kind: 'station', id: home.id });
  if (!homeDock && !Object.keys(home.buildStore ?? {}).length && !home.build && !home.queue.length) return null;
  const minLoad = (id: string) => Math.min(unitsFor(s, id) * 0.3, Math.max(50, 60_000 / WARES[id].price.avg));
  // Fürs Baulager genügt auch die kleine Restmenge, sonst bliebe ein Modul kurz vor Schluss stehen
  // Baulagerbedarf je Station nur einmal pro Suche berechnen
  const demands = new Map<string, Record<string, number>>();
  const roomOf = (st: Station, id: string, market = false) => {
    let d = demands.get(st.id);
    if (!d) demands.set(st.id, (d = buildDemand(st)));
    return buildRoom(st, id, d, market);
  };
  const minFor = (st: Station, id: string, market = false) => {
    const r = roomOf(st, id, market);
    // Restmenge für ein geplantes Schiff der Werft darf auch klein sein
    const rest = (pendingNeeds(st)[id] ?? 0) - (st.inventory[id] ?? 0);
    const min = r > BUILD_TOLERANCE ? Math.min(minLoad(id), r) : minLoad(id);
    return rest >= 1 ? Math.min(min, rest) : min;
  };
  // Im Autohandel ist die Heimatstation immer einer der beiden Handelspartner:
  // Sie gibt ab (an Märkte, Aufträge oder eigene Stationen) oder wird versorgt. Kein Handel zwischen fremden Stationen.
  for (const base of [home]) {
    const weight = 1;
    const baseEp: TradeEndpoint = { kind: 'station', id: base.id };
    // Stationshändler: Reichweite nach Pilotenrang (Rang 1–2: Heimatsektor, ab Rang 3 auch die Nachbarsektoren)
    const nearbyMarkets = !state.start || RANK_RANGE[pilotRank(s)] > 0 ? [base.sector, ...sector(base.sector).links.filter((l) => known.includes(l))] : [base.sector];

    // 1) Überschüsse abgeben
    for (const id of homeDock ? stationWares(base) : []) {
      if (WARES[id].storage !== cls.storage) continue;
      const have = surplus(state, base, id);
      if (have < 1) continue;
      const qty = Math.min(have, unitsFor(s, id));
      const avg = WARES[id].price.avg;
      for (const other of state.stations) {
        if (other.id === base.id || !known.includes(other.sector)) continue;
        const to: TradeEndpoint = { kind: 'station', id: other.id };
        // Ohne passendes Dock nimmt nur das Baulager der Station Ware an
        const dock = canDockAt(state, s, to);
        const need = dock ? wanted(state, other, id) : Math.min(wanted(state, other, id), roomOf(other, id));
        const n = Math.min(qty, need);
        if (n < minFor(other, id)) continue;
        // Baulager hat Vorrang; deckt die Fuhre seinen ganzen Bedarf, zählt sie in der Lieferreihenfolge als volle Ladung
        const forBuild = Math.min(n, roomOf(other, id));
        // Ebenso, wenn die Fuhre den Rest für ein geplantes Schiff der Werft bringt – sonst wartet die Werft auf ein paar Einheiten
        const yardRest = (pendingNeeds(other)[id] ?? 0) - (other.inventory[id] ?? 0);
        const fill = (forBuild > BUILD_TOLERANCE && n >= roomOf(other, id) - BUILD_TOLERANCE) || (yardRest >= 1 && n >= yardRest - BUILD_TOLERANCE) ? 1 : n / Math.max(1, Math.min(qty, unitsFor(s, id)));
        cands.push({ job: { ware: id, amount: n, from: baseEp, to, stage: 'pickup' }, score: (weight * (n * avg * 1.5 + buildBonus(forBuild, avg))) / travelTime(state, s, baseEp, to), toStation: other.id, fill });
      }
      for (const c of state.contracts) {
        if (c.status !== 'active' || c.ware !== id) continue;
        const rest = c.amount - c.delivered - inTransitForContract(state, c.id);
        if (rest < 1) continue;
        const n = Math.min(qty, rest);
        // Restmengen eines Auftrags dürfen auch klein sein
        if (n < Math.min(minLoad(id), rest)) continue;
        const to = contractEndpoint(c);
        const perUnit = c.story ? avg * 2 : c.reward / c.amount;
        const finishes = n >= rest - 0.5 ? 500_000 : 0; // Abschluss hat Vorrang
        cands.push({ job: { ware: id, amount: n, from: baseEp, to, stage: 'pickup', contract: c.id }, score: (weight * (n * perUnit * 1.2 + finishes)) / travelTime(state, s, baseEp, to) });
      }
      for (const sec of nearbyMarkets) {
        // Handelsposten und spezialisierte NPC-Käufer im Sektor
        for (const key of [sec, ...sector(sec).npcStations.filter((n) => n.buys.includes(id)).map((n) => n.id)]) {
          if (!knows(state, key)) continue;
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
      const cap = (n: number, market = false) => (homeDock ? n : Math.min(n, roomOf(base, id, market)));
      const need = cap(wanted(state, base, id));
      const min = minFor(base, id);
      if (need < min) continue;
      const qty = Math.min(need, unitsFor(s, id));
      const avg = WARES[id].price.avg;
      for (const other of state.stations) {
        if (other.id === base.id || !known.includes(other.sector)) continue;
        const from: TradeEndpoint = { kind: 'station', id: other.id };
        if (!canDockAt(state, s, from)) continue;
        const have = surplus(state, other, id);
        if (have < Math.min(min, qty)) continue;
        const n = Math.min(qty, have);
        cands.push({ job: { ware: id, amount: n, from, to: baseEp, stage: 'pickup' }, score: (weight * (n * avg * 1.5 + buildBonus(Math.min(n, roomOf(base, id)), avg))) / travelTime(state, s, from, baseEp) });
      }
      if (WARES[id].mined && state.ships.some((m) => m.home === base.id && SHIP_MAP[m.cls].role === 'miner' && SHIP_MAP[m.cls].storage === WARES[id].storage)) continue;
      // Häkchen der Station: nur bei eigenen Stationen einkaufen
      if (base.ownOnly) continue;
      // Vom Markt nur, was die Station dort kaufen darf (Baulager ggf. nur aus eigenen Stationen)
      const qtyMarket = Math.min(qty, cap(wanted(state, base, id, false, true), true));
      const minMarket = minFor(base, id, true);
      // Handelsposten und NPC-Fabriken, die die Ware herstellen
      for (const [sec, key] of nearbyMarkets.flatMap((sec) => [[sec, sec], ...sector(sec).npcStations.filter((n) => n.makes?.includes(id)).map((n) => [sec, n.id])])) {
        if (!knows(state, key)) continue;
        const stock = marketStock(state, key, id);
        const price = marketPrice(state, key, id);
        const afford = spendable(state, 50_000) / price;
        const n = Math.min(qtyMarket, stock * 0.8, afford);
        if (n < minMarket) continue;
        const from: TradeEndpoint = key === sec ? { kind: 'market', sector: sec } : { kind: 'market', sector: sec, market: key };
        // Einkauf lohnt sich, wenn der Preis nicht über dem Durchschnitt liegt
        const bonus = price <= avg ? 1 : 0.5;
        cands.push({ job: { ware: id, amount: n, from, to: baseEp, stage: 'pickup' }, score: (weight * (n * avg * 0.9 * bonus + buildBonus(Math.min(n, roomOf(base, id, true)), avg))) / travelTime(state, s, from, baseEp) });
      }
    }
  }
  // Angenommene Kurieraufträge haben Vorrang: Der Spieler hat sie bewusst zugesagt
  const courier = courierJob(state, s);
  if (courier) return courier;
  // Stationshändler: nur für die eigene Station – freier Handel zwischen fremden Stationen ist Sache freier Schiffe (Sektorbefehl)
  return pickByPriority(home, cands)?.job ?? null;
}

/** Lieferziel eines Auftrags: der genannte Markt oder der Handelsposten des Sektors */
export function contractEndpoint(c: Contract): TradeEndpoint {
  return c.market && c.market !== c.sector ? { kind: 'market', sector: c.sector, market: c.market } : { kind: 'market', sector: c.sector };
}

/** Marktschlüssel → Handelsendpunkt */
export function marketEndpoint(key: string): TradeEndpoint {
  const p = marketInfo(key);
  return key === p.sector ? { kind: 'market', sector: p.sector } : { kind: 'market', sector: p.sector, market: key };
}

/**
 * Bedarfsauftrag als Fahrt: Ware einkaufen und zum Ziel bringen. Ohne vorgegebenen Verkäufer wählt das Schiff den mit dem
 * besten Gewinn pro Flugzeit (Lohn minus Einkauf).
 */
export function courierTrip(state: GameState, s: Ship, c: Contract, from?: TradeEndpoint): TradeJob | null {
  if (c.status !== 'active' || !isDelivery(c)) return null;
  const w = WARES[c.ware];
  if (w.storage !== SHIP_MAP[s.cls].storage || SHIP_MAP[s.cls].role !== 'trader') return null;
  const rest = c.amount - c.delivered - inTransitForContract(state, c.id);
  const n = Math.min(rest, unitsFor(s, c.ware));
  if (n < 1) return null;
  const to = contractEndpoint(c);
  if (!from) {
    const perUnit = c.reward / c.amount;
    let best: { ep: TradeEndpoint; score: number } | null = null;
    const sellers = c.source ? [{ key: c.source, price: marketPrice(state, c.source, c.ware), stock: marketStock(state, c.source, c.ware) }] : wareSellers(state, c.ware, c.market);
    for (const x of sellers) {
      const k = Math.min(n, x.stock);
      if (k < Math.min(n, 1)) continue;
      const ep = marketEndpoint(x.key);
      const score = (k * (perUnit - x.price)) / travelTime(state, s, ep, to);
      if (!best || score > best.score) best = { ep, score };
    }
    if (!best) return null;
    from = best.ep;
  }
  return { ware: c.ware, amount: n, from, to, stage: 'pickup', contract: c.id };
}

function courierJob(state: GameState, s: Ship): TradeJob | null {
  let best: { job: TradeJob; t: number } | null = null;
  for (const c of state.contracts) {
    const job = courierTrip(state, s, c);
    if (!job) continue;
    const t = travelTime(state, s, job.from, job.to);
    if (!best || t < best.t) best = { job, t };
  }
  return best?.job ?? null;
}

/**
 * Sektor-Autohandel (freie Schiffe, unabhängig vom Rang): eine Ware in einem Sektor – beim günstigsten bekannten Verkäufer
 * kaufen, beim bestbietenden bekannten Abnehmer verkaufen. Abnehmer eigener Handelsrouten und was andere eigene Schiffe
 * gerade dorthin bringen, bleiben außen vor.
 */
export function sectorTradeJob(state: GameState, s: Ship, sectorId: string, ware: string): TradeJob | null {
  const w = WARES[ware];
  if (!w || w.storage !== SHIP_MAP[s.cls].storage || !SECTOR_MAP[sectorId]) return null;
  const reserved = new Set<string>();
  const incomingAt = new Map<string, number>();
  for (const o of state.ships) {
    if (o === s) continue;
    if (o.mode === 'route' && o.route && o.route.ware === ware) for (const to of [o.route.to, ...(o.route.alt ?? [])]) if (to.kind === 'market') reserved.add(marketKey(to));
    const j = o.job;
    if (j && j.ware === ware && j.to.kind === 'market') incomingAt.set(marketKey(j.to), (incomingAt.get(marketKey(j.to)) ?? 0) + (o.cargo?.amount ?? j.amount));
  }
  const sec = sector(sectorId);
  const keys = [sectorId, ...sec.npcStations.map((n) => n.id)].filter((k) => state.markets[k]?.[ware] && knows(state, k));
  const units = unitsFor(s, ware);
  let seller: { key: string; price: number; stock: number } | null = null;
  for (const k of keys) {
    if (k !== sectorId && !NPC_MAP[k]?.makes?.includes(ware)) continue;
    const price = seenPrice(state, k, ware), stock = seenStock(state, k, ware);
    if (price == null || stock == null || stock < 1) continue;
    if (!seller || price < seller.price) seller = { key: k, price, stock };
  }
  if (!seller) return null;
  let buyer: { key: string; price: number; room: number } | null = null;
  for (const k of keys) {
    if (k === seller.key || reserved.has(k)) continue;
    if (k !== sectorId && !NPC_MAP[k]?.buys.includes(ware)) continue;
    const price = seenPrice(state, k, ware), room = (seenRoom(state, k, ware) ?? 0) - (incomingAt.get(k) ?? 0);
    if (price == null || room < 1) continue;
    if (!buyer || price > buyer.price) buyer = { key: k, price, room };
  }
  if (!buyer) return null;
  // Gehandelt wird die ganze Ladung zum Preis bei Abschluss (ein Preis je Fuhre)
  const n = Math.min(units, seller.stock, buyer.room, spendable(state, 10_000) / seller.price);
  if (n < 1 || n * (buyer.price - seller.price) < Math.max(2_000, n * w.price.avg * 0.04)) return null;
  return { ware, amount: n, from: marketEndpoint(seller.key), to: marketEndpoint(buyer.key), stage: 'pickup' };
}

/** Ab diesem Alter (s) schaut ein wartender Sektorhändler selbst nach, was sich an einem Markt getan hat */
export const SCOUT_AGE = 15 * 60;

/**
 * Kein lohnendes Geschäft bekannt: Der freie Händler fliegt den Markt mit der ältesten Momentaufnahme an und erfasst ihn
 * (wie ein Spieler, der nachschaut). Live abgedeckte Märkte (Station, Satellit) braucht er nicht anzufliegen.
 */
export function sectorScoutJob(state: GameState, s: Ship, sectorId: string, ware: string): TradeJob | null {
  if (!SECTOR_MAP[sectorId]) return null;
  let pick: { key: string; age: number } | null = null;
  for (const k of [sectorId, ...sector(sectorId).npcStations.map((n) => n.id)]) {
    if (!state.markets[k]?.[ware]) continue;
    const age = intelAge(state, k);
    if (age == null || age < SCOUT_AGE) continue;
    if (!pick || age > pick.age) pick = { key: k, age };
  }
  if (!pick) return null;
  const to = marketEndpoint(pick.key);
  return { ware, amount: 0, from: to, to, stage: 'deliver', explore: true };
}

/** Vorrang fürs Baulager: Ein stehender Bau wiegt mehr als der reine Warenwert */
function buildBonus(units: number, avg: number): number {
  return units > 0.5 ? 150_000 + units * avg * 2 : 0;
}

/** Mindestens dieser Anteil einer Ladung muss eine Prioritäts-Station abnehmen, sonst rutscht der Transporter eine Stufe tiefer */
export const PRIO_MIN_FILL = 0.5;

/**
 * Lieferreihenfolge der Heimatstation: Überschüsse gehen der Reihe nach an die eingetragenen eigenen Stationen.
 * Nimmt eine Station weniger als eine halbe Ladung ab, kommt die nächste dran; zuletzt Verkauf zum besten Preis
 * (Märkte, Aufträge, nicht eingetragene Stationen). Die Versorgung der Heimat selbst läuft unabhängig davon mit.
 */
function pickByPriority(home: Station, cands: Candidate[]): Candidate | null {
  const best = (list: Candidate[]) => list.sort((a, b) => b.score - a.score)[0] ?? null;
  const prio = (home.deliveryPrio ?? []).filter((id) => id !== home.id);
  if (!prio.length) return best(cands);
  const supplyHome = cands.filter((c) => c.job.to.kind === 'station' && c.job.to.id === home.id);
  for (const id of prio) {
    const tier = cands.filter((c) => c.toStation === id && (c.fill ?? 0) >= PRIO_MIN_FILL);
    if (tier.length) return best([...tier, ...supplyHome]);
  }
  // Letzte Stufe: bester Preis – eingetragene Stationen, die zu wenig abnehmen, bleiben außen vor
  return best(cands.filter((c) => !c.toStation || !prio.includes(c.toStation)));
}

export function inTransitForContract(state: GameState, contractId: number): number {
  let n = 0;
  for (const s of state.ships) {
    if (s.job?.contract === contractId) n += s.cargo?.amount ?? s.job.amount;
    // Erteilte, noch nicht begonnene Fahrten zählen mit – sonst würde derselbe Auftrag mehrfach vergeben
    for (const o of s.orders ?? []) if (o.contract === contractId) n += o.amount;
  }
  for (const npc of state.npcs) if (npc.contract === contractId) n += npc.amount;
  return n;
}

/**
 * Ladung am Ende der Warteschlange: was nach allen erteilten Befehlen an Bord sein wird
 * (einmalige Käufe füllen den Laderaum, „Laderaum verkaufen“ leert ihn, normale Fahrten enden leer).
 */
export function expectedCargo(s: Ship): { ware: string; amount: number } | null {
  let cargo = s.cargo ? { ...s.cargo } : null;
  if (s.job?.hold && !s.cargo) cargo = { ware: s.job.ware, amount: s.job.amount };
  if (s.job?.fromHold) cargo = null;
  for (const o of s.orders ?? []) {
    if (o.hold) cargo = { ware: o.ware, amount: o.amount };
    else if (o.fromHold) cargo = null;
  }
  return cargo;
}

/** Angenommener, noch offener Auftrag mit diesem Lieferziel (Marktschlüssel) und dieser Ware */
export function openContractAt(state: GameState, key: string, ware: string): Contract | undefined {
  return state.contracts.find((c) => c.status === 'active' && c.ware === ware && !c.story && (c.market ?? c.sector) === key && c.delivered < c.amount - 0.5);
}

/** Platz für die Ware an einem Ziel (eigene Station oder Markt, plus offener Auftrag dort) */
function roomFor(state: GameState, to: TradeEndpoint, ware: string, own: boolean): number {
  if (to.kind === 'station') {
    const st = stationById(state, to.id);
    return st ? roomAt(st, ware, own ? 'own' : 'market') : 0;
  }
  const c = openContractAt(state, marketKey(to), ware);
  return marketRoom(state, marketKey(to), ware) + (c ? Math.max(0, c.amount - c.delivered - inTransitForContract(state, c.id)) : 0);
}

/**
 * Ziel einer Route: Bei mehreren Abnehmern der, der gerade am besten zahlt (mit Gelegenheit) und noch Platz hat.
 * Eigene Stationen als Ziel haben immer Vorrang vor Märkten in der Liste.
 */
export function routeTarget(state: GameState, r: RouteOrder, minRoom = 1): { to: TradeEndpoint; room: number; price: number } | null {
  let best: { to: TradeEndpoint; room: number; price: number } | null = null;
  for (const to of [r.to, ...(r.alt ?? [])]) {
    const room = roomFor(state, to, r.ware, r.from.kind === 'station');
    if (room < minRoom) continue;
    const price = to.kind === 'station' ? Infinity : effectivePrice(state, marketKey(to), r.ware, 'demand');
    if (!best || price > best.price) best = { to, room, price };
  }
  return best;
}

/** Gewinn einer Handelsroute zwischen Märkten: (bester Verkaufspreis − Einkaufspreis) / Einkaufspreis; null bei eigenen Stationen */
export function routeMargin(state: GameState, r: RouteOrder): number | null {
  if (r.from.kind !== 'market' || r.to.kind !== 'market') return null;
  const buy = effectivePrice(state, marketKey(r.from), r.ware, 'supply');
  const t = routeTarget(state, r) ?? { price: effectivePrice(state, marketKey(r.to), r.ware, 'demand') };
  return buy > 0 ? (t.price - buy) / buy : null;
}

function routeJob(state: GameState, s: Ship): TradeJob | null {
  const r = s.route;
  s.routeNote = undefined;
  if (!r) return null;
  // Gewinnschwelle: unter dem Mindestgewinn pausieren oder die Route beenden
  const margin = r.minMargin != null ? routeMargin(state, r) : null;
  if (margin != null && margin < r.minMargin!) {
    const pct = (x: number) => `${Math.round(x * 100)} %`;
    if (r.onLow === 'end') {
      log(state, `${s.name}: Handelsroute ${WARES[r.ware].name} beendet – Gewinn ${pct(margin)} unter ${pct(r.minMargin!)}.`, 'warn', true);
      s.route = null;
      s.mode = 'auto';
      return null;
    }
    s.routeNote = `Route pausiert: Gewinn ${pct(margin)} unter ${pct(r.minMargin!)}`;
    return null;
  }
  const units = unitsFor(s, r.ware);
  let have: number;
  if (r.from.kind === 'station') {
    const st = stationById(state, r.from.id);
    if (!st) return null;
    // Eine Station, die die Ware selbst verbraucht, behält eine Reserve
    const limit = wareLimit(st, r.ware);
    have = Math.max(0, (st.inventory[r.ware] ?? 0) - reserveFor(st, r.ware, limit) - outgoing(state, st.id, r.ware));
  } else if (r.from.kind === 'market' && r.from.market && !NPC_MAP[r.from.market]?.makes?.includes(r.ware)) {
    have = 0; // NPC-Käuferstationen verkaufen nichts, NPC-Fabriken nur ihre Produkte
  } else {
    have = Math.min(marketStock(state, marketKey(r.from), r.ware) * 0.8, spendable(state, 50_000) / marketPrice(state, marketKey(r.from), r.ware));
  }
  const t = routeTarget(state, r, Math.min(units * 0.2, 100));
  if (!t) return null;
  const n = Math.min(units, have, t.room);
  if (n < Math.min(units * 0.2, 100)) return null;
  return { ware: r.ware, amount: n, from: r.from, to: t.to, stage: 'pickup', manual: true, route: true };
}

function stepTrader(state: GameState, s: Ship, dt: number): void {
  const cls = SHIP_MAP[s.cls];
  const home = stationById(state, s.home);
  switch (s.phase) {
    case 'idle': {
      if (s.cargo && s.job) { startLeg(state, s); return; }
      if (s.cargo && !s.job) {
        // „Laderaum verkaufen“ als nächster Befehl: die Ladung an Bord dorthin bringen
        const next = s.orders?.[0];
        if (next?.fromHold) {
          s.orders!.shift();
          s.job = { ...next, ware: s.cargo.ware, amount: s.cargo.amount, stage: 'deliver' };
          startLeg(state, s);
          return;
        }
        // Ladung aus einem einmaligen Kauf: wartet auf Befehl
        if (s.holdCargo) {
          s.status = next
            ? `Laderaum voll (${WARES[s.cargo.ware].name}) – zuerst „Laderaum verkaufen“ einreihen`
            : `Wartet mit ${Math.round(s.cargo.amount).toLocaleString('de-DE')} ${WARES[s.cargo.ware].name} auf Befehl`;
          s.phase = 'waiting';
          s.timer = 5;
          return;
        }
        // Restladung am nächsten Markt verkaufen
        s.job = { ware: s.cargo.ware, amount: s.cargo.amount, from: { kind: 'market', sector: s.sector }, to: { kind: 'market', sector: s.sector }, stage: 'deliver' };
        startLeg(state, s);
        return;
      }
      // Vom Spieler erteilte Aufträge haben Vorrang
      const order = s.orders?.shift();
      if (order) { s.job = order; startLeg(state, s); return; }
      const so = s.sectorOrder;
      // Freie Schiffe: angenommene Lieferaufträge zuerst, dann der Sektorhandel
      const job = s.mode === 'route' ? routeJob(state, s) : home ? findTradeJob(state, s) : courierJob(state, s) ?? (so?.kind === 'trade' ? sectorTradeJob(state, s, so.sector, so.ware) ?? sectorScoutJob(state, s, so.sector, so.ware) : null);
      if (!job) {
        s.status = s.mode === 'route' ? (s.routeNote ?? 'Route wartet auf Ware oder Platz')
          : !home ? (so ? `Sektorhandel ${WARES[so.ware].name}: gerade kein lohnendes Geschäft` : 'Frei – wartet auf Befehl') : home && !hasDockFor(home, cls.size) ? (cls.size === 'L' ? 'Heimat hat keinen Pier' : 'Heimat hat kein Dock') : 'Sucht Handelsgelegenheit';
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
  s.status = job.explore ? `Fliegt zu ${endpointName(state, ep)} und erfasst die Station` : job.stage === 'pickup' ? `Holt ${w} bei ${endpointName(state, ep)}` : `Liefert ${w} an ${endpointName(state, ep)}`;
}

/** Andocken und handeln; danach ist die Lage am Markt bekannt (Momentaufnahme nach dem eigenen Handel) */
function doTrade(state: GameState, s: Ship): void {
  const job = s.job;
  const ep = job ? (job.stage === 'pickup' ? job.from : job.to) : null;
  tradeAtDock(state, s);
  if (ep?.kind === 'market') noteMarket(state, marketKey(ep));
}

function tradeAtDock(state: GameState, s: Ship): void {
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
      // NPC-Käufer verkaufen nichts, NPC-Fabriken nur ihre eigenen Produkte
      const sells = !job.from.market || !!NPC_MAP[job.from.market]?.makes?.includes(job.ware);
      n = !sells ? 0 : Math.min(job.amount, units, marketStock(state, key, job.ware), spendable(state, 10_000) / price);
      if (n > 0) {
        let cost = applyMarketTrade(state, key, job.ware, -n);
        // Angenommenes Sonderangebot: Rabatt auf die zugesagte Menge
        if (job.opp != null) cost -= applyOpportunity(state, key, job.ware, 'supply', n, cost, job.opp);
        const home = stationById(state, s.home);
        if (home) home.expenses += cost;
        s.earned -= cost;
      }
    }
    if (n < 1) { s.job = null; s.phase = 'idle'; return; }
    s.cargo = { ware: job.ware, amount: n };
    job.amount = n;
    if (job.hold) {
      // Einmaliger Kauf: Ladung behalten, auf den nächsten Befehl warten
      s.holdCargo = true;
      s.job = null;
      s.phase = 'idle';
      s.trips++;
      return;
    }
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
      const n = receiveWare(state, st, s.cargo.ware, s.cargo.amount, job.from.kind === 'station' ? 'own' : 'market');
      recordFlow(state, endOf(state, job.from), endOf(state, job.to), s.cargo.ware, n);
      s.cargo.amount -= n;
      s.earned += n * w.price.avg * 0.1;
    }
  } else {
    const key = marketKey(job.to);
    // Jede Lieferung an ein Auftragsziel zählt für den Auftrag – auch über Versorgungslinien, Einzelverkäufe oder freien Handel
    const contractId = job.contract ?? openContractAt(state, key, s.cargo.ware)?.id;
    if (contractId != null) {
      const { used, pay } = contractDeliver(state, contractId, s.cargo.ware, s.cargo.amount);
      s.cargo.amount -= used;
      // Der Lohn zählt als Ertrag des Schiffs und seiner Heimat – mit Credit-Anzeige am Ziel
      if (pay > 0) {
        s.earned += pay;
        const home = stationById(state, s.home);
        if (home) home.income += pay;
        const place = marketInfo(key);
        emit({ type: 'sale', station: '', sector: place.sector, x: place.x, z: place.z, value: pay });
      }
      state.totals.delivered += used;
      recordFlow(state, endOf(state, job.from), endOf(state, job.to), s.cargo.ware, used);
    }
    if (s.cargo.amount > 0.5) {
      // NPC-Käufer nehmen nur, was in ihr Lager passt; der Handelsposten etwas mehr zum Mindestpreis
      const n = Math.min(s.cargo.amount, marketRoom(state, key, s.cargo.ware) + (job.to.market ? 0 : s.cargo.amount * 0.2));
      if (n > 0) {
        let value = applyMarketTrade(state, key, s.cargo.ware, n);
        // Stammkunde: Wer eine Station regelmäßig beliefert, bekommt dort bessere Preise (bis +10 %)
        const extra = value * relationBonus(state, key);
        if (extra > 0) { state.credits += extra; state.totals.sold += extra; value += extra; }
        noteDelivery(state, key, s.cargo.ware, n);
        recordFlow(state, endOf(state, job.from), endOf(state, job.to), s.cargo.ware, n);
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
  noteTrip(state, s);
  if (s.cargo.amount < 0.5) { s.cargo = null; s.holdCargo = false; }
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
      return travelDistance(shipPlace(s), a) / cls.speed + cls.capacity / (mineRate(state, cls, info.field.id) * info.field.richness) + travelDistance(a, home) / cls.speed;
    }
    if (s.phase === 'mining') return s.timer + toHome;
    if (s.phase === 'toHome') return toHome;
    if (s.phase === 'docking') return s.timer;
  }
  return null;
}
