// Erkundung des unbekannten Raums: Späher fliegen über die bekannten Tore zu einem Sektor und suchen dort nach
// Torsignaturen ins Unbekannte. Ob es dort überhaupt etwas gibt, verrät die Suche nicht – „keine Spur“ heißt entweder
// Pech oder wirklich nichts. Gefundene Signaturen erscheinen auf der Sektorenkarte (state.frontier.signatures).
import { FRONTIER, FRONTIER_MAP } from '../data/frontier';
import { SECTOR_MAP } from '../data/sectors';
import { book } from './ledger';
import type { GameState } from './types';
import type { Result } from './actions';
import { log, rand } from './util';

export const SCOUT_PRICE = 140_000;
/** Flugzeit je Tor (s Spielzeit) und Dauer einer Suche */
export const SCOUT_HOP = 20 * 60;
export const SEARCH_TIME = 2 * 3600;
/** Grundchance, eine vorhandene Signatur bei einer Suche zu finden (das Peil-Minispiel verbessert sie) */
export const SEARCH_CHANCE = 0.5;

export interface Scout {
  id: string;
  name: string;
  /** Sektor, in dem der Späher gerade ist (beim Flug: der letzte erreichte) */
  at: string;
  task?: { kind: 'fly' | 'search'; target: string; path: string[]; t: number; dur: number; bonus?: number };
}

export interface FrontierState { signatures: string[]; discovered: string[]; scouts?: Scout[] }

export function frontierState(state: GameState): FrontierState {
  if (!state.frontier) state.frontier = { signatures: [], discovered: [] };
  if (!state.frontier.scouts) state.frontier.scouts = [];
  return state.frontier as FrontierState;
}

export function scouts(state: GameState): Scout[] {
  return (state.frontier as FrontierState | undefined)?.scouts ?? [];
}

const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

/** Tore in beide Richtungen (Tore aus dem neuen Raum in den Split-Raum stehen nur beim neuen Sektor) */
const INTO_SPLIT: Record<string, string[]> = {};
for (const f of FRONTIER) for (const l of f.links) if (SECTOR_MAP[l]) (INTO_SPLIT[l] ??= []).push(f.id);
export const linksOf = (id: string): string[] => SECTOR_MAP[id] ? [...SECTOR_MAP[id].links, ...(INTO_SPLIT[id] ?? [])] : FRONTIER_MAP[id]?.links ?? [];
export const sectorLabel = (id: string): string => SECTOR_MAP[id]?.name ?? FRONTIER_MAP[id]?.name ?? id;

/** Erreichbare Sektoren: der ganze Split-Raum und alle entdeckten neuen Sektoren */
export function reachable(state: GameState, id: string): boolean {
  return !!SECTOR_MAP[id] || (state.frontier?.discovered ?? []).includes(id);
}

/** Kürzester Weg über Tore zwischen erreichbaren Sektoren */
export function scoutPath(state: GameState, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev: Record<string, string> = {};
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of linksOf(cur)) {
      if (seen.has(n) || !reachable(state, n)) continue;
      seen.add(n);
      prev[n] = cur;
      if (n === to) {
        const path = [to];
        let c = to;
        while (prev[c]) { c = prev[c]; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Tore dieses Sektors ins noch Unentdeckte, deren Signatur noch nicht gefunden ist */
export function hiddenLinks(state: GameState, id: string): string[] {
  const f = state.frontier;
  return linksOf(id).filter((l) => FRONTIER_MAP[l] && !(f?.discovered ?? []).includes(l) && !(f?.signatures ?? []).includes(`${id}>${l}`));
}

export function buyScout(state: GameState): Result {
  if (state.credits < SCOUT_PRICE) return fail('Nicht genug Credits für einen Späher.');
  const home = state.stations[0]?.sector ?? 'zhin';
  const fs = frontierState(state);
  const n = fs.scouts!.length + 1;
  const scout: Scout = { id: `sp-${state.nextId++}`, name: `Späher ${['Ilka', 'Varn', 'Teshra', 'Oskel', 'Mirr', 'Daun'][(n - 1) % 6]}${n > 6 ? ' ' + n : ''}`, at: home };
  fs.scouts!.push(scout);
  book(state, -SCOUT_PRICE, 'ships', `${scout.name} gekauft`);
  return ok(`${scout.name} steht in ${sectorLabel(home)} bereit.`);
}

/** Späher zu einem Sektor schicken und dort suchen lassen (bonus: Vorsprung aus dem Peil-Minispiel, 0…1) */
export function sendScout(state: GameState, scoutId: string, target: string, bonus = 0): Result {
  const s = scouts(state).find((x) => x.id === scoutId);
  if (!s) return fail('Späher nicht gefunden.');
  if (s.task) return fail(`${s.name} ist unterwegs.`);
  if (!reachable(state, target)) return fail('Dieser Sektor ist nicht erreichbar.');
  const path = scoutPath(state, s.at, target);
  if (!path) return fail('Kein Weg dorthin bekannt.');
  if (path.length > 1) s.task = { kind: 'fly', target, path, t: 0, dur: (path.length - 1) * SCOUT_HOP, bonus };
  else s.task = { kind: 'search', target, path, t: 0, dur: SEARCH_TIME, bonus };
  return ok(path.length > 1 ? `${s.name} fliegt nach ${sectorLabel(target)} (${path.length - 1} Tor${path.length > 2 ? 'e' : ''}) und sucht dort.` : `${s.name} beginnt die Suche in ${sectorLabel(target)}.`);
}

/** Abschluss einer Suche: mit Glück eine Signatur ins Unbekannte */
function finishSearch(state: GameState, s: Scout, sector: string, bonus: number): void {
  const hidden = hiddenLinks(state, sector);
  const chance = Math.min(0.97, SEARCH_CHANCE + bonus * 0.5);
  if (hidden.length && rand(state) < chance) {
    const to = hidden[Math.floor(rand(state) * hidden.length) % hidden.length];
    frontierState(state).signatures.push(`${sector}>${to}`);
    log(state, `${s.name}: Torsignatur in ${sectorLabel(sector)} entdeckt! Sie führt ins Unbekannte.`, 'good', true, { kind: 'sector', id: sector });
  } else {
    log(state, `${s.name}: Keine Spur in ${sectorLabel(sector)}. Vielleicht woanders – oder ein zweiter Versuch.`, 'info', true, { kind: 'sector', id: sector });
  }
}

export function stepScouts(state: GameState, dt: number): void {
  for (const s of scouts(state)) {
    const task = s.task;
    if (!task) continue;
    task.t += dt;
    if (task.kind === 'fly') {
      // Fortschritt über die Tore: der zuletzt erreichte Sektor gilt als Standort
      const hop = Math.min(task.path.length - 1, Math.floor(task.t / SCOUT_HOP));
      s.at = task.path[hop];
      if (task.t >= task.dur) {
        s.at = task.target;
        s.task = { kind: 'search', target: task.target, path: [task.target], t: 0, dur: SEARCH_TIME, bonus: task.bonus };
      }
    } else if (task.t >= task.dur) {
      s.task = undefined;
      finishSearch(state, s, task.target, task.bonus ?? 0);
    }
  }
}
