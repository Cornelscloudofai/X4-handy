// Neues Spiel, Speichern und Laden
import { MODULES, MODULE_MAP } from '../data/modules';
import { SECTOR_MAP } from '../data/sectors';
import { SHIP_MAP, shipName } from '../data/ships';
import { addBuildStore, initMarkets } from './economy';
import { initNpcEconomy } from './npcEconomy';
import { generateCourier } from './contracts';
import { initIntel } from './intel';
import { OLD_STORY_IDS, STORY, startMission, storyOf } from './story';
import type { GameState, ModuleInst, Ship, StartKind, Station } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'x4-sektorbau-save-v1';
export const START_CREDITS = 2_500_000;
/** Neuer Spielstart: kleine Station ohne Produktion, wenig Geld – Handel bekommt mehr Credits, Bergbau das teurere Schiff */
export const START_KIT: Record<StartKind, { credits: number; ship: string }> = {
  trading: { credits: 50_000, ship: 'tuatara' },
  mining: { credits: 20_000, ship: 'alligator_min' },
};

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

/**
 * Neues Spiel. Ohne Startart: klassischer Start mit fertiger Solarstation und 2,5 Mio Cr (Tests, alte Spielstände).
 * Mit Startart: Stationskern, S/M-Dock, Container- und Erzlager, ein Schiff und wenig Geld.
 */
export function newGame(seed = Date.now() % 2147483647, start?: StartKind): GameState {
  const state: GameState = {
    version: SAVE_VERSION, seed, time: 0, credits: START_CREDITS, stations: [], ships: [], npcs: [], markets: {},
    sectors: ['zhin'], blueprints: MODULES.filter((m) => m.starter).map((m) => m.id), rep: { frf: 0, zya: 0 },
    contracts: [], story: { index: 0, claimed: false, startedAt: 0, base: {}, contractFloor: 0 },
    totals: { produced: {}, sold: 0, bought: 0, mined: {}, delivered: 0 }, log: [], nextId: 1, npcTimer: {},
    contractTimer: 20 * 60, savedAt: Date.now(), speed: 5,
  };
  // Startart vor den Märkten setzen: neue Spiele bekommen knappe Handelsposten
  if (start) state.start = start;
  initMarkets(state);
  initNpcEconomy(state);
  const st = newStation(state, 'Station Alpha', 'zhin', -45, -55);
  if (start) {
    state.credits = START_KIT[start].credits;
    for (const def of ['core', 'dock_m', 'storage_container', 'storage_solid']) st.modules.push({ ...newModule(state, def), util: 1 });
    state.stations.push(st);
    const ship = newShip(state, START_KIT[start].ship, st);
    state.ships.push(ship);
    // Handelsstart: Der Tuatara ist frei und handelt schon Energiezellen im Heimatsektor (Sektorhandel) – die Startstation
    // produziert noch nichts, als Stationshändler hätte er nichts zu tun
    if (start === 'trading') { ship.home = ''; ship.sectorOrder = { kind: 'trade', sector: st.sector, ware: 'energycells' }; }
    // Marktbericht der Familie: letzter bekannter Stand aller Stationen im Heimatsektor
    initIntel(state, st.sector);
    // Gleich zu Beginn ein passender Kurierauftrag, die nächsten folgen bald
    const c = generateCourier(state);
    if (c) state.contracts.push(c);
    state.contractTimer = 8 * 60;
  } else {
    for (const def of ['core', 'prod_energycells', 'storage_container', 'storage_solid', 'dock_m']) st.modules.push({ ...newModule(state, def), util: 1 });
    st.inventory = { energycells: 3000, ore: 2000 };
    state.stations.push(st);
    state.ships.push(newShip(state, 'alligator_min', st));
  }
  startMission(state);
  state.log.push({ t: 0, text: start ? 'Willkommen in Familie Zhin. Deine kleine Station steht – jetzt heißt es Geld verdienen.' : 'Willkommen in Familie Zhin. Deine erste Station steht.', kind: 'info' });
  return state;
}

export function serialize(state: GameState): string {
  state.savedAt = Date.now();
  return JSON.stringify(state);
}

/**
 * Laufender Bau aus Spielständen vor dem Baulager: Dort wurde Material erst komplett gesammelt (need = noch fehlend),
 * danach lief die Bauzeit. Gesammeltes Material kommt ins Baulager, der Bau läuft anteilig weiter.
 */
function migrateBuild(s: Station): Station['build'] {
  const old = s.build as NonNullable<Station['build']> & { need?: Record<string, number>; buyT?: number };
  if (!old.need) return old;
  const mats = MODULE_MAP[old.def].materials;
  const missing = Object.values(old.need).some((n) => n > 0.5);
  const b: NonNullable<Station['build']> = { def: old.def, total: old.total, remaining: missing ? old.total : old.remaining, paid: 0, used: {} };
  for (const [id, n] of Object.entries(mats)) {
    const got = Math.max(0, n - (old.need[id] ?? 0));
    if (!missing) b.used![id] = n;
    else if (got > 0) addBuildStore(s, id, got);
  }
  return b;
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
  for (const s of raw.stations) if (s?.build && MODULE_MAP[s.build.def]) s.build = migrateBuild(s);
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
  // Freie Schiffe (ohne Station) haben home = ''
  state.ships = (raw.ships ?? []).filter((s) => SHIP_MAP[s.cls] && (s.home === '' || ids.has(s.home)) && SECTOR_MAP[s.sector]);
  state.npcs = (raw.npcs ?? []).filter((n) => SECTOR_MAP[n.sector]);
  state.markets = { ...base.markets, ...(raw.markets ?? {}) };
  initMarkets(state);
  initNpcEconomy(state);
  state.rep = { ...base.rep, ...(raw.rep ?? {}) };
  // Neu hinzugekommene Grundbaupläne auch in alten Spielständen; wer ein Lager M/L besitzt, behält dessen Bauplan
  const built = state.stations.flatMap((s) => [...s.modules.map((m) => m.def), ...s.queue.map((q) => q.def), s.build?.def ?? '']).filter((d) => MODULE_MAP[d]?.kind === 'storage');
  state.blueprints = [...new Set([...(raw.blueprints ?? []), ...base.blueprints, ...built])];
  state.totals = { ...base.totals, ...(raw.totals ?? {}) };
  state.story = { ...base.story, ...(raw.story ?? {}) };
  // Alte Spielstände kannten nur 15 Kapitel: über die Kapitel-Kennung auf die neue Reihenfolge umstellen
  if (raw.story?.id) {
    // Die Kapitel-Kennung ist maßgeblich – so übersteht der Spielstand auch eine geänderte Kapitelreihenfolge
    const i = storyOf(state).findIndex((m) => m.id === raw.story.id);
    if (i >= 0) state.story.index = i;
  } else if (raw.story) {
    const id = OLD_STORY_IDS[state.story.index];
    const i = id ? STORY.findIndex((m) => m.id === id) : -1;
    state.story.index = i >= 0 ? i : STORY.length;
    state.story.id = STORY[state.story.index]?.id;
  }
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
