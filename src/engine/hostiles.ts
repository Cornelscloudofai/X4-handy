// Gegner in der Welt (Stufe 3 in docs/design/kampf.md): Piratenrotten, die Xenon-Streife in Tharka's Ravine und
// Kha'ak-Schwärme in der Glutsee fliegen sichtbar in einen Sektor ein, suchen sich einen beladenen Frachter oder Miner
// und greifen ihn an – erst dann entsteht der Überfall (Vorfall mit „Selbst übernehmen“). Eigene Kampfschiffe in der
// Nähe schrecken sie ab: Ist ihr Kampfwert hoch genug, drehen die Angreifer ab. Gekämpft wird erst ab Stufe 4.
import { SECTOR_MAP, SECTOR_RADIUS, insideHex } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { INCIDENT_CHAPTER, incidentById, repelRaid, startRaid } from './incidents';
import { moveAlong } from './logistics';
import { xenonClock } from './phenomena';
import type { GameState, Ship } from './types';
import { log } from './util';

export type Foe = 'pirates' | 'xenon' | 'khaak';

export interface Hostile {
  id: number;
  foe: Foe;
  sector: string;
  x: number;
  z: number;
  heading: number;
  path: { sector: string; x: number; z: number }[];
  /** Anzahl Schiffe und Kampfwert der ganzen Rotte */
  n: number;
  power: number;
  /** Ziel (eigenes Schiff) und der daraus entstandene Überfall */
  target?: string;
  incident?: number;
  phase: 'hunt' | 'attack' | 'leave';
  /** Ende der Jagd (danach ziehen sie ab) */
  until: number;
  /** nächste Neuplanung des Wegs */
  replan: number;
}

export interface HostileState {
  list: Hostile[];
  /** nächste Prüfung, ob irgendwo eine Rotte auftaucht */
  next: number;
  n: number;
}

/** Alle zehn Minuten Spielzeit: je Sektor eine Chance auf eine Rotte (bei Sicherheit 0) */
export const HOSTILE_CHECK = 10 * 60;
export const SPAWN_CHANCE = 0.08;
export const MAX_HOSTILES = 3;
/** Jagdzeit, Angriffsabstand, Abschreckungsradius und -anteil (Kampfwert eigener Schiffe ≥ Anteil × Rotte) */
export const HUNT_TIME = 40 * 60;
export const ATTACK_R = 3;
export const DEFEND_R = 25;
export const DETER = 0.75;
/** Tempo (km/s): schneller als Frachter, sonst holen sie keinen ein */
const SPEED: Record<Foe, number> = { pirates: 3.0, xenon: 3.4, khaak: 3.6 };
export const FOE_NAME: Record<Foe, string> = { pirates: 'Piratenrotte', xenon: 'Xenon-Streife', khaak: 'Kha’ak-Schwarm' };
const FOE_SHIPS: Record<Foe, [string, string]> = { pirates: ['Piratenschiff', 'Piratenschiffe'], xenon: ['Xenon-Jäger', 'Xenon-Jäger'], khaak: ['Kha’ak-Späher', 'Kha’ak-Späher'] };

/**
 * Grundsicherheit je Sektor (0–100): Zyarth und der Patrouillenkorridor von Rhy gut bewacht, die Schlucht und die
 * Glutsee kaum
 */
const BASE_SECURITY: Record<string, number> = { zhin: 65, tkr: 55, cascade: 55, ravine: 30, rhy: 75, hoa: 50, zyarth: 80 };
const FRONTIER_SECURITY = 35;

const words = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];

export function hostileState(state: GameState): HostileState {
  return (state.hostiles ??= { list: [], next: state.time + HOSTILE_CHECK, n: 0 });
}

/** Zufall ohne Eingriff in den Spielzufall */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9e3779b9, 1597334677)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const isCargoShip = (s: Ship): boolean => SHIP_MAP[s.cls].role !== 'fighter';

/** Kampfwert eigener Kampfschiffe im Umkreis */
export function defenseNear(state: GameState, sector: string, x: number, z: number, r = DEFEND_R): number {
  let p = 0;
  for (const s of state.ships) {
    const c = SHIP_MAP[s.cls];
    if (c.combat && s.sector === sector && Math.hypot(s.x - x, s.z - z) <= r) p += c.combat.power;
  }
  return p;
}

/**
 * Sicherheit eines Sektors (0–100): Grundwert der Fraktion, dazu eigene Kampfschiffe auf Wache oder Patrouille dort
 * (Kampfwert/8, höchstens +30), abzüglich eigenem Verkehr (je Frachter oder Miner −1,5, höchstens −15)
 */
export function sectorSecurity(state: GameState, sectorId: string): { value: number; base: number; guard: number; traffic: number } {
  const base = BASE_SECURITY[sectorId] ?? (sectorId.startsWith('f-') ? FRONTIER_SECURITY : 50);
  let power = 0, traffic = 0;
  for (const s of state.ships) {
    if (s.sector !== sectorId) continue;
    const c = SHIP_MAP[s.cls];
    if (c.combat) { if (s.combat?.kind === 'guard' || s.combat?.kind === 'patrol') power += c.combat.power; }
    else traffic++;
  }
  const guard = Math.min(30, Math.round(power / 8));
  const t = Math.min(15, Math.round(traffic * 1.5));
  return { value: Math.max(5, Math.min(95, base + guard - t)), base, guard, traffic: t };
}

const foeIn = (sector: string): Foe => (sector === 'ravine' ? 'xenon' : sector.startsWith('f-') ? 'khaak' : 'pirates');

/** Punkt am Sektorrand in Richtung des Winkels a (0 = Osten, −π/2 = Norden) */
function edgePoint(a: number, f = 0.92): { x: number; z: number } {
  let r = SECTOR_RADIUS;
  // vom Rand nach innen, bis der Punkt sicher im Sechseck liegt
  while (r > 10 && !insideHex(Math.cos(a) * r, Math.sin(a) * r, SECTOR_RADIUS * f)) r -= 4;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Rotte erscheinen lassen (für Tests und Entwicklerwerkzeuge mit festen Werten) */
export function spawnHostile(state: GameState, sector: string, foe: Foe = foeIn(sector), angle?: number): Hostile {
  const hs = hostileState(state);
  hs.n++;
  const r = (k: number) => hash(hs.n * 13 + k, state.seed ^ 0x7a11);
  const ch = Math.min(20, state.story?.index ?? 0);
  const n = foe === 'xenon' ? 3 : 2 + Math.floor(r(1) * 3);
  const per = (foe === 'xenon' ? 75 : foe === 'khaak' ? 55 : 60) + 6 * ch;
  const p = edgePoint(angle ?? r(2) * Math.PI * 2);
  const h: Hostile = {
    id: state.nextId++, foe, sector, x: p.x, z: p.z, heading: Math.atan2(-p.z, -p.x), path: [], n, power: Math.round(n * per),
    phase: 'hunt', until: state.time + HUNT_TIME, replan: 0,
  };
  hs.list.push(h);
  return h;
}

/** Wer wird gerade schon angegriffen? (Ziele von Rotten und offene Überfälle) */
function busyTargets(state: GameState, except?: Hostile): Set<string> {
  const out = new Set<string>();
  for (const h of hostileState(state).list) if (h !== except && h.target) out.add(h.target);
  for (const i of state.incidents?.open ?? []) out.add(i.target);
  return out;
}

function pickTarget(state: GameState, h: Hostile): Ship | undefined {
  const busy = busyTargets(state, h);
  let best: Ship | undefined, bd = Infinity;
  for (const s of state.ships) {
    if (s.sector !== h.sector || !isCargoShip(s) || !s.cargo || s.cargo.amount <= 0 || busy.has(s.id)) continue;
    const d = Math.hypot(s.x - h.x, s.z - h.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function leave(state: GameState, h: Hostile, why: string, kind: 'good' | 'info' = 'info'): void {
  h.phase = 'leave';
  h.target = undefined;
  const e = edgePoint(Math.atan2(h.z, h.x), 0.97);
  h.path = [{ sector: h.sector, x: e.x, z: e.z }];
  if (why) log(state, why, kind, false, { kind: 'sector', id: h.sector });
}

const crew = (h: Hostile): string => `${words[h.n] ?? h.n} ${FOE_SHIPS[h.foe][h.n === 1 ? 0 : 1]}`;

/** Je Simulationsschritt: Rotten erscheinen lassen, bewegen, angreifen oder abdrehen */
export function stepHostiles(state: GameState, dt: number): void {
  const hs = hostileState(state);
  const early = (state.story?.index ?? 99) < INCIDENT_CHAPTER;
  // Xenon-Streife in der Schlucht: kommt mit dem Ereignis durch die Lücke im Nordosten, geht mit ihm
  if (!early && state.sectors.includes('ravine') && xenonClock(state.time).active && !hs.list.some((h) => h.foe === 'xenon' && h.sector === 'ravine')) {
    const h = spawnHostile(state, 'ravine', 'xenon', -Math.PI / 4);
    h.until = state.time + xenonClock(state.time).left;
  }
  if (state.time >= hs.next) {
    hs.next = state.time + HOSTILE_CHECK;
    if (!early && hs.list.length < MAX_HOSTILES) {
      // nur in Sektoren, in denen eigene Frachter oder Miner unterwegs sind
      const secs = [...new Set(state.ships.filter(isCargoShip).map((s) => s.sector))].filter((id) => SECTOR_MAP[id] && !hs.list.some((h) => h.sector === id));
      for (const [i, id] of secs.entries()) {
        const chance = SPAWN_CHANCE * (1 - sectorSecurity(state, id).value / 100);
        if (hash(Math.floor(state.time / HOSTILE_CHECK) * 31 + i, state.seed ^ 0x3c3c) < chance) { spawnHostile(state, id); break; }
      }
    }
  }
  for (const h of [...hs.list]) stepOne(state, h, dt);
}

function stepOne(state: GameState, h: Hostile, dt: number): void {
  const hs = hostileState(state);
  h.replan -= dt;
  if (h.phase !== 'leave') {
    // Abschrecken: genug eigene Kampfkraft in der Nähe – sie drehen ab (ein laufender Überfall ist damit abgewehrt)
    const def = defenseNear(state, h.sector, h.x, h.z);
    if (def >= DETER * h.power) {
      const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
      if (inc) repelRaid(state, inc.id);
      leave(state, h, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name} dreht ab – eigene Kampfschiffe (Kampfwert ${Math.round(def)}) sind zu stark für ${crew(h)}.`, 'good');
    } else if (state.time >= h.until && h.phase === 'hunt') {
      leave(state, h, '');
    }
  }
  if (h.phase === 'leave') {
    if (moveAlong(h, SPEED[h.foe], dt)) hs.list.splice(hs.list.indexOf(h), 1);
    return;
  }
  if (h.phase === 'attack') {
    const inc = h.incident != null ? incidentById(state, h.incident) : undefined;
    if (!inc) { leave(state, h, ''); return; }
    // beim Opfer bleiben
    const t = state.ships.find((x) => x.id === h.target);
    if (t && t.sector === h.sector) { h.x += (t.x + 1.5 - h.x) * Math.min(1, dt); h.z += (t.z + 1.5 - h.z) * Math.min(1, dt); }
    return;
  }
  // Jagd: Ziel halten, solange es im Sektor bleibt und Ladung hat
  let t = h.target ? state.ships.find((x) => x.id === h.target) : undefined;
  if (t && (t.sector !== h.sector || !t.cargo)) t = undefined;
  if (!t && h.replan <= 0) {
    t = pickTarget(state, h);
    if (t) log(state, `${FOE_NAME[h.foe]} in ${SECTOR_MAP[h.sector].name}: ${crew(h)} halten auf ${t.name} zu.`, 'warn', true, { kind: 'ship', id: t.id });
  }
  h.target = t?.id;
  if (t) {
    if (Math.hypot(t.x - h.x, t.z - h.z) <= ATTACK_R) {
      const inc = startRaid(state, t, h.foe);
      if (inc) { h.incident = inc.id; h.phase = 'attack'; h.path = []; return; }
      leave(state, h, '');
      return;
    }
    if (h.replan <= 0 || !h.path.length) { h.path = [{ sector: h.sector, x: t.x, z: t.z }]; h.replan = 2; }
  } else if (!h.path.length || h.replan <= 0) {
    // kein Ziel: durch den Sektor streifen
    const a = hash(state.nextId, h.id) * Math.PI * 2, d = 40 + hash(h.id, state.nextId) * 100;
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    h.path = [{ sector: h.sector, x: p.x, z: p.z }];
    h.replan = 30;
  }
  moveAlong(h, SPEED[h.foe], dt);
}

/** Rotte in Worten (Karte und Karten-Hinweis) */
export function hostileText(state: GameState, h: Hostile): { title: string; sub: string } {
  const t = h.target ? state.ships.find((x) => x.id === h.target) : undefined;
  const what = h.phase === 'leave' ? 'zieht ab' : h.phase === 'attack' ? `greift ${t?.name ?? 'ein Schiff'} an` : t ? `hält auf ${t.name} zu` : 'streift durch den Sektor';
  return { title: FOE_NAME[h.foe], sub: `${crew(h)} · Kampfwert ${h.power} · ${what}` };
}

/** Kampfschiffe zur Abwehr schicken: die nächsten eigenen Kampfschiffe begleiten das Ziel, bis die Abschreckung reicht */
export function sendDefense(state: GameState, hostileId: number): { ok: boolean; msg: string } {
  const h = hostileState(state).list.find((x) => x.id === hostileId);
  if (!h) return { ok: false, msg: 'Die Rotte ist schon weg.' };
  const target = h.target ? state.ships.find((x) => x.id === h.target) : undefined;
  if (!target) return { ok: false, msg: 'Die Rotte hat noch kein Ziel – schick Kampfschiffe auf Patrouille in den Sektor.' };
  const need = DETER * h.power;
  const fighters = state.ships.filter((s) => SHIP_MAP[s.cls].combat && !(s.combat?.kind === 'escort' && s.combat.ship === target.id))
    .map((s) => ({ s, d: (s.sector === target.sector ? 0 : 1000) + Math.hypot(s.x - target.x, s.z - target.z) }))
    .sort((a, b) => a.d - b.d);
  let have = state.ships.filter((s) => s.combat?.kind === 'escort' && s.combat.ship === target.id).reduce((a, s) => a + (SHIP_MAP[s.cls].combat?.power ?? 0), 0);
  const sent: string[] = [];
  for (const { s } of fighters) {
    if (have >= need) break;
    s.combat = { kind: 'escort', ship: target.id };
    s.path = []; s.timer = 0;
    have += SHIP_MAP[s.cls].combat!.power;
    sent.push(s.name);
  }
  if (!sent.length) return { ok: false, msg: have >= need ? 'Es sind schon genug Kampfschiffe unterwegs.' : 'Keine Kampfschiffe verfügbar.' };
  return { ok: true, msg: `${sent.join(', ')} ${sent.length === 1 ? 'fliegt' : 'fliegen'} zu ${target.name}${have < need ? ` – Kampfwert ${Math.round(have)} reicht noch nicht (${Math.round(need)} nötig)` : ''}.` };
}

/** Rotte im Sektor (für Karte und Tests) */
export const hostilesIn = (state: GameState, sector: string): Hostile[] => hostileState(state).list.filter((h) => h.sector === sector);
