// NPC-Wirtschaft: Die Fabriken der Fraktionen produzieren nach den X4-Rezepten, verbrauchen dabei echte Vorprodukte
// und wachsen langsam. Sie versorgen sich nur zu einem kleinen Teil selbst (wenige eigene Frachter) – den Rest
// müssen andere liefern, vor allem der Spieler. Ihre Produkte verkaufen sie an der Station und bringen einen Teil
// zum Handelsposten.
import { NPC_STATIONS, sector } from '../data/sectors';
import { WARES } from '../data/wares';
import { baseDemand } from './economy';
import { makeNpc } from './npc';
import type { GameState, NpcEco, NpcStationDef } from './types';
import { log } from './util';

/** Anteil des Vorproduktbedarfs (bei voller Produktion), den die Fraktion mit eigenen Frachtern heranschafft */
export const SELF_SHARE = 0.35;
/** Anteil der Produktion, den eigene Frachter zum Handelsposten bringen */
export const EXPORT_SHARE = 0.5;
/** Größte Zahl an Produktionsmodulen je NPC-Fabrik */
export const MAX_MODULES = 10;
/** Ausbau: Prüfung alle 6 Spielstunden, je Fraktion höchstens ein Modul pro Spieltag, nur bei guter Auslastung */
const GROW_CHECK = 6 * 3600;
const FACTION_GROW_GAP = 24 * 3600;
export const GROW_UTIL = 0.7;
/** Ladung eines NPC-Frachters (m³) */
const HAUL_M3 = 6000;

type Factory = NpcStationDef & { sector: string };

export const NPC_FACTORIES: Factory[] = NPC_STATIONS.filter((n) => n.makes?.length);

/** Verbrauch je Sekunde einer Ware bei voller Produktion */
export function inputRate(eco: NpcEco, id: string): number {
  let r = 0;
  for (const [w, n] of Object.entries(eco.prod)) for (const i of WARES[w].inputs) if (i.ware === id) r += (n * i.amount) / WARES[w].cycle;
  return r;
}

/** Produktion je Sekunde einer Ware bei voller Auslastung */
export function outputRate(eco: NpcEco, id: string): number {
  const n = eco.prod[id] ?? 0;
  return n ? (n * WARES[id].batch) / WARES[id].cycle : 0;
}

/** Alle Vorprodukte der Fabrik (auch selbst hergestellte Zwischenprodukte) */
export function factoryInputs(eco: NpcEco): string[] {
  return [...new Set(Object.keys(eco.prod).flatMap((w) => WARES[w].inputs.map((i) => i.ware)))];
}

/** Lager der Fabrik passend zur Größe: Vorprodukte für 3 Stunden, Produkte für 4 Stunden */
function ensureMarket(state: GameState, n: Factory): void {
  const eco = state.npcEco![n.id];
  const m = (state.markets[n.id] ??= {});
  const want = new Map<string, number>();
  for (const id of factoryInputs(eco)) want.set(id, inputRate(eco, id) * 3 * 3600);
  for (const id of Object.keys(eco.prod)) want.set(id, Math.max(want.get(id) ?? 0, outputRate(eco, id) * 4 * 3600));
  for (const [id, size] of want) {
    const cap = Math.max(baseDemand(id) * 2, size);
    if (!m[id]) m[id] = { stock: cap * 0.3, cap, eq: 0.3 };
    else m[id].cap = Math.max(m[id].cap, cap);
  }
}

/** Legt die Fabrikdaten an (neue Spiele und alte Spielstände) */
export function initNpcEconomy(state: GameState): void {
  state.npcEco ??= {};
  state.npcGrow ??= {};
  for (const n of NPC_FACTORIES) {
    if (!state.npcEco[n.id]) {
      // Start: die ersten beiden Produkte mit je zwei Modulen, das dritte mit einem
      const prod = Object.fromEntries(n.makes!.map((w, i) => [w, i < 2 ? 2 : 1]));
      state.npcEco[n.id] = { prod, t: {}, util: {}, grown: state.time, supply: {}, export: {} };
    }
    ensureMarket(state, n);
  }
}

export function isNpcFactory(state: GameState, key: string): boolean {
  return !!state.npcEco?.[key];
}

/** Durchschnittliche Auslastung einer NPC-Fabrik */
export function factoryUtil(eco: NpcEco): number {
  const ids = Object.keys(eco.prod);
  return ids.length ? ids.reduce((s, w) => s + (eco.util[w] ?? 0), 0) / ids.length : 0;
}

function produce(state: GameState, n: Factory, eco: NpcEco, dt: number): void {
  const m = state.markets[n.id];
  for (const [w, count] of Object.entries(eco.prod)) {
    const def = WARES[w];
    const out = m[w];
    const possible = (dt * count) / def.cycle;
    eco.t[w] = (eco.t[w] ?? 0) + possible;
    let done = 0;
    while (eco.t[w] >= 1) {
      const ok = def.inputs.every((i) => (m[i.ware]?.stock ?? 0) >= i.amount) && out.stock + def.batch <= out.cap;
      // fehlt etwas, steht das Modul – die Zeit ist verloren
      if (!ok) { eco.t[w] = Math.min(eco.t[w], 1); break; }
      for (const i of def.inputs) m[i.ware].stock -= i.amount;
      out.stock += def.batch;
      eco.t[w] -= 1;
      done++;
    }
    // Auslastung: tatsächlich gelaufene Zyklen gegenüber möglichen, über etwa zwei Stunden gemittelt
    const k = Math.min(1, dt / 7200);
    eco.util[w] = Math.max(0, Math.min(1, (eco.util[w] ?? 0) + (done / Math.max(possible, 1e-9) - (eco.util[w] ?? 0)) * k));
  }
}

/** Eigene Frachter: Vorprodukte vom Handelsposten holen, Produkte dorthin bringen – je Richtung höchstens einer unterwegs */
function haul(state: GameState, n: Factory, eco: NpcEco, dt: number): void {
  const m = state.markets[n.id];
  const post = state.markets[n.sector];
  const ts = sector(n.sector).tradeStation;
  // unterwegs = auf dem Hinflug oder angedockt; auf dem Rückweg zählt der Frachter nicht mehr
  const inFlight = (to: string) => state.npcs.some((x) => x.kind === 'haul' && x.home === n.id && x.station === to && x.phase !== 'out');
  const own = new Set(Object.keys(eco.prod));
  // Vorprodukte (nur, was die Fabrik nicht selbst herstellt)
  for (const id of factoryInputs(eco)) {
    if (own.has(id)) continue;
    const load = HAUL_M3 / WARES[id].volume;
    eco.supply[id] = Math.min(load * 2, (eco.supply[id] ?? 0) + SELF_SHARE * inputRate(eco, id) * dt);
  }
  if (!inFlight(n.id)) {
    // zuerst, was am knappsten ist (volle Lager nicht weiter auffüllen)
    const fill = (id: string) => (m[id] ? m[id].stock / m[id].cap : 1);
    const pick = Object.entries(eco.supply)
      .filter(([id, b]) => fill(id) < 0.8 && b >= (HAUL_M3 / WARES[id].volume) * 0.4)
      .sort((a, b) => fill(a[0]) - fill(b[0]))[0];
    if (pick) {
      const [id, budget] = pick;
      const load = HAUL_M3 / WARES[id].volume;
      const amount = Math.min(budget, load, (post?.[id]?.stock ?? 0) * 0.5, m[id] ? m[id].cap - m[id].stock : 0);
      // erst losfliegen, wenn sich die Fahrt lohnt (mindestens 40 % einer Ladung)
      if (amount >= load * 0.4 && post?.[id]) {
        post[id].stock -= amount;
        eco.supply[id] = budget - amount;
        const npc = makeNpc(state, { sector: n.sector, kind: 'haul', tx: n.x, tz: n.z, station: n.id, ware: id, amount, home: n.id });
        npc.x = ts.x; npc.z = ts.z;
        state.npcs.push(npc);
      }
    }
  }
  // Produkte zum Handelsposten
  for (const id of own) {
    const load = HAUL_M3 / WARES[id].volume;
    // unabhängig von der Auslastung, sonst bleibt eine volle Fabrik für immer stehen
    eco.export[id] = Math.min(load * 2, (eco.export[id] ?? 0) + EXPORT_SHARE * outputRate(eco, id) * dt);
  }
  if (!inFlight(n.sector) && post) {
    // zuerst das Produkt mit dem vollsten Lager
    const full = (id: string) => (m[id] ? m[id].stock / m[id].cap : 0);
    const pick = Object.entries(eco.export)
      .filter(([id, b]) => b >= (HAUL_M3 / WARES[id].volume) * 0.4 && (m[id]?.stock ?? 0) >= (HAUL_M3 / WARES[id].volume) * 0.4)
      .sort((a, b) => full(b[0]) - full(a[0]))[0];
    if (pick) {
      const [id, budget] = pick;
      const load = HAUL_M3 / WARES[id].volume;
      const amount = Math.min(budget, load, m[id]?.stock ?? 0);
      if (amount >= load * 0.5 && post[id]) {
        m[id].stock -= amount;
        eco.export[id] = budget - amount;
        const npc = makeNpc(state, { sector: n.sector, kind: 'haul', tx: ts.x, tz: ts.z, station: n.sector, ware: id, amount, home: n.id });
        npc.x = n.x; npc.z = n.z;
        state.npcs.push(npc);
      }
    }
  }
}

/** Ausbau: gut ausgelastete Fabriken bekommen ein Modul für das Produkt, das am Handelsposten am meisten fehlt */
function grow(state: GameState, n: Factory, eco: NpcEco): void {
  if (state.time - eco.grown < GROW_CHECK) return;
  eco.grown = state.time;
  const total = Object.values(eco.prod).reduce((s, v) => s + v, 0);
  if (total >= MAX_MODULES || factoryUtil(eco) < GROW_UTIL) return;
  const f = sector(n.sector).faction;
  if (state.time - (state.npcGrow![f] ?? -Infinity) < FACTION_GROW_GAP) return;
  const post = state.markets[n.sector];
  const ratio = (w: string) => (post?.[w] ? post[w].stock / post[w].cap : 0.5);
  const w = Object.keys(eco.prod).sort((a, b) => ratio(a) - ratio(b) || a.localeCompare(b))[0];
  eco.prod[w]++;
  state.npcGrow![f] = state.time;
  ensureMarket(state, n);
  log(state, `${n.name} baut ein weiteres Modul für ${WARES[w].name} aus.`, 'info', true);
}

export function stepNpcEconomy(state: GameState, dt: number): void {
  if (!state.npcEco) initNpcEconomy(state);
  for (const n of NPC_FACTORIES) {
    const eco = state.npcEco![n.id];
    if (!eco) continue;
    produce(state, n, eco, dt);
    haul(state, n, eco, dt);
    grow(state, n, eco);
  }
}
