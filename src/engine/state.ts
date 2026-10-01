// Neues Spiel, Speichern und Laden
import { MODULES, MODULE_MAP } from '../data/modules';
import { SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP, shipName } from '../data/ships';
import { initMarkets } from './economy';
import { startMission } from './story';
import type { GameState, ModuleInst, Ship, Station } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'x4-sektorbau-save-v1';
export const START_CREDITS = 2_500_000;

export function newModule(state: GameState, def: string): ModuleInst {
  return { uid: state.nextId++, def, t: 0, running: false, stall: '', util: 0 };
}

export function newStation(state: GameState, name: string, sector: string, x: number, z: number): Station {
  return {
    id: 'st-' + state.nextId++, name, sector, x, z, modules: [], queue: [], build: null, inventory: {}, trade: {},
    produced: {}, income: 0, expenses: 0, founded: state.time,
  };
}

export function newShip(state: GameState, cls: string, home: Station, at?: { sector: string; x: number; z: number }): Ship {
  const c = SHIP_MAP[cls];
  const n = state.nextId++;
  const p = at ?? { sector: home.sector, x: home.x + 3, z: home.z + 2 };
  return {
    id: 'sh-' + n, name: shipName(c.name, n), cls, home: home.id, sector: p.sector, x: p.x, z: p.z, heading: 0, path: [],
    phase: 'idle', timer: 0, cargo: null, mineWare: '', miningField: '', mode: 'auto', route: null, job: null, status: 'Bereit',
    trips: 0, earned: 0,
  };
}

export function newGame(seed = Date.now() % 2147483647): GameState {
  const state: GameState = {
    version: SAVE_VERSION, seed, time: 0, credits: START_CREDITS, stations: [], ships: [], npcs: [], markets: {},
    sectors: ['zhin'], blueprints: MODULES.filter((m) => m.starter).map((m) => m.id), rep: { frf: 0, zya: 0 },
    contracts: [], story: { index: 0, claimed: false, startedAt: 0, base: {}, contractFloor: 0 },
    totals: { produced: {}, sold: 0, bought: 0, mined: {}, delivered: 0 }, log: [], nextId: 1, npcTimer: {},
    contractTimer: 20 * 60, savedAt: Date.now(), speed: 5,
  };
  initMarkets(state);
  const st = newStation(state, 'Station Alpha', 'zhin', -45, -55);
  for (const def of ['core', 'prod_energycells', 'storage_container', 'storage_solid', 'dock_m']) st.modules.push({ ...newModule(state, def), util: 1 });
  st.inventory = { energycells: 3000, ore: 2000 };
  state.stations.push(st);
  state.ships.push(newShip(state, 'alligator_min', st));
  startMission(state);
  state.log.push({ t: 0, text: 'Willkommen in Familie Zhin. Deine erste Station steht.', kind: 'info' });
  return state;
}

export function serialize(state: GameState): string {
  state.savedAt = Date.now();
  return JSON.stringify(state);
}

/** Lädt einen Spielstand und prüft ihn grob auf Gültigkeit */
export function deserialize(text: string): GameState {
  const raw = JSON.parse(text) as GameState;
  if (!raw || typeof raw !== 'object' || !(raw.version >= 1 && raw.version <= SAVE_VERSION) || !Array.isArray(raw.stations)) {
    throw new Error('Kein gültiger Spielstand.');
  }
  // Version 1: Containerlager S hatte 100.000 m³ – bestehende werden zu Containerlager M (echte Werte: S = 25.000 m³), Bauplan inklusive
  if (raw.version === 1) {
    const up = (def: string) => (def === 'storage_container' ? 'storage_container_m' : def);
    for (const s of raw.stations) {
      for (const m of s.modules ?? []) m.def = up(m.def);
      for (const q of s.queue ?? []) q.def = up(q.def);
      if (s.build) s.build.def = up(s.build.def);
    }
    raw.version = SAVE_VERSION;
  }
  const base = newGame(raw.seed || 1);
  const state: GameState = { ...base, ...raw };
  state.stations = raw.stations.filter((s) => s && SECTOR_MAP[s.sector]).map((s) => ({
    ...s,
    modules: (s.modules ?? []).filter((m) => MODULE_MAP[m.def]),
    queue: (s.queue ?? []).filter((q) => MODULE_MAP[q.def]).map((q) => ({ ...q, uid: q.uid ?? state.nextId++, paid: q.paid ?? 0 })),
    build: s.build && MODULE_MAP[s.build.def] ? s.build : null,
    inventory: s.inventory ?? {},
    trade: s.trade ?? {},
    produced: s.produced ?? {},
  }));
  const ids = new Set(state.stations.map((s) => s.id));
  // Haken „Zuerst eigene Stationen beliefern“ → Lieferreihenfolge mit allen anderen eigenen Stationen
  for (const st of state.stations) {
    if (st.ownFirst && !st.deliveryPrio) st.deliveryPrio = state.stations.filter((x) => x.id !== st.id).map((x) => x.id);
    delete st.ownFirst;
    if (st.deliveryPrio) st.deliveryPrio = st.deliveryPrio.filter((id) => ids.has(id) && id !== st.id);
  }
  state.ships = (raw.ships ?? []).filter((s) => SHIP_MAP[s.cls] && ids.has(s.home) && SECTOR_MAP[s.sector]);
  state.npcs = (raw.npcs ?? []).filter((n) => SECTOR_MAP[n.sector]);
  state.markets = { ...base.markets, ...(raw.markets ?? {}) };
  initMarkets(state);
  state.rep = { ...base.rep, ...(raw.rep ?? {}) };
  // Neu hinzugekommene Grundbaupläne auch in alten Spielständen; wer ein Lager M/L besitzt, behält dessen Bauplan
  const built = state.stations.flatMap((s) => [...s.modules.map((m) => m.def), ...s.queue.map((q) => q.def), s.build?.def ?? '']).filter((d) => MODULE_MAP[d]?.kind === 'storage');
  state.blueprints = [...new Set([...(raw.blueprints ?? []), ...base.blueprints, ...built])];
  state.totals = { ...base.totals, ...(raw.totals ?? {}) };
  state.story = { ...base.story, ...(raw.story ?? {}) };
  state.contracts = (raw.contracts ?? []).map((c) => ({ ...c, deadline: c.deadline ?? 0 }));
  return state;
}

export function saveLocal(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): GameState | null {
  try {
    const t = localStorage.getItem(SAVE_KEY);
    return t ? deserialize(t) : null;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
