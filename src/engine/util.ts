import type { FactionId, GameState, LogEntry, LogLink } from './types';

/** Deterministischer Zufall (mulberry32), Zustand liegt im Spielstand */
export function rand(state: GameState): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state: GameState, a: number, b: number): number {
  return a + (b - a) * rand(state);
}

export function pick<T>(state: GameState, list: T[]): T {
  return list[Math.floor(rand(state) * list.length) % list.length];
}

export function weightedPick<T>(state: GameState, list: { item: T; w: number }[]): T | null {
  const total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return null;
  let r = rand(state) * total;
  for (const x of list) {
    r -= Math.max(0, x.w);
    if (r <= 0) return x.item;
  }
  return list[list.length - 1].item;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

export function newId(state: GameState, prefix: string): string {
  return prefix + '-' + state.nextId++;
}

// ---------- Ereignisse für die Oberfläche ----------

export type GameEvent =
  | { type: 'toast'; text: string; kind: LogEntry['kind']; link?: LogLink }
  | { type: 'moduleDone'; station: string; module: string }
  | { type: 'contractDone'; id: number }
  | { type: 'story' }
  /** Kapitel abgeschlossen (Belohnung abgeholt) */
  | { type: 'chapter'; index: number; title: string; credits: number; faction: FactionId }
  | { type: 'shipBuilt'; station: string; cls: string }
  | { type: 'sale'; station: string; sector: string; x: number; z: number; value: number };

const listeners: ((e: GameEvent) => void)[] = [];
let muted = 0;

export function onGameEvent(fn: (e: GameEvent) => void): void {
  listeners.push(fn);
}

export function emit(e: GameEvent): void {
  if (muted) return;
  for (const l of listeners) l(e);
}

/** Während Offline-Nachberechnung keine Einblendungen erzeugen */
export function muteEvents<T>(fn: () => T): T {
  muted++;
  try {
    return fn();
  } finally {
    muted--;
  }
}

/** So viele Meldungen behält das Nachrichtenblatt */
export const LOG_MAX = 300;

export function log(state: GameState, text: string, kind: LogEntry['kind'] = 'info', toast = false, link?: LogLink): void {
  state.log.push({ t: state.time, text, kind, ...(toast ? { toast } : {}), ...(link ? { link } : {}) });
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  if (toast) emit({ type: 'toast', text, kind, link });
}
