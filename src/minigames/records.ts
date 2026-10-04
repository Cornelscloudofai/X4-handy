// Rekorde der Minispiele: Bestwerte je Spiel/Stufe/Spielart, Tagesaufgaben, Abzeichen (erfüllte Nebenziele).
// Vorerst nur auf diesem Gerät gespeichert; später wandert das in den Spielstand.
import type { GameResult, Level, Mode } from './common';

const KEY = 'x4-sektorbau-mg2';

interface Store {
  /** `${kind}:${level}:${mode}` → Bestwert */
  best: Record<string, { stars: number; points: number }>;
  /** `${datum}:${kind}` → Punkte */
  daily: Record<string, number>;
  /** `${kind}:${zielId}` → erreicht */
  badges: Record<string, true>;
}

let mem: Store | null = null;

function load(): Store {
  if (mem) return mem;
  let s: Partial<Store> = {};
  try {
    s = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    s = {};
  }
  mem = { best: s.best ?? {}, daily: s.daily ?? {}, badges: s.badges ?? {} };
  return mem;
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function best(kind: string, level: Level, mode: Mode = 'normal'): { stars: number; points: number } | null {
  return load().best[`${kind}:${level}:${mode}`] ?? null;
}

/** Bestwert über alle Stufen einer Spielart (für Kette/Endlos/Tagesaufgabe-Anzeige) */
export function bestPoints(kind: string, mode: Mode = 'normal'): number {
  let b = 0;
  for (const [k, v] of Object.entries(load().best)) if (k.startsWith(kind + ':') && k.endsWith(':' + mode)) b = Math.max(b, v.points);
  return b;
}

export function dailyBest(kind: string, date = today()): number | null {
  return load().daily[`${date}:${kind}`] ?? null;
}

/** Summe der besten Sterne über alle Stufen (schaltet Stufe 4 und 5 frei) */
export function totalStars(kind: string): number {
  let n = 0;
  for (let l = 1; l <= 5; l++) n += best(kind, l as Level)?.stars ?? 0;
  return n;
}

/** Sterne, die für eine Stufe nötig sind */
export const UNLOCK: Record<Level, number> = { 1: 0, 2: 0, 3: 0, 4: 6, 5: 10 };

export function unlocked(kind: string, level: Level): boolean {
  return totalStars(kind) >= UNLOCK[level];
}

export function badgeCount(kind: string): number {
  return Object.keys(load().badges).filter((k) => k.startsWith(kind + ':')).length;
}

export function hasBadge(kind: string, goal: string): boolean {
  return !!load().badges[`${kind}:${goal}`];
}

export interface RecordOutcome { newRecord: boolean; newBadges: string[]; previous: number }

/** Ergebnis eintragen */
export function recordResult(kind: string, level: Level, mode: Mode, r: GameResult, date = today()): RecordOutcome {
  const s = load();
  const key = `${kind}:${level}:${mode}`;
  const prev = s.best[key];
  const newRecord = r.points > 0 && (!prev || r.points > prev.points);
  s.best[key] = { stars: Math.max(prev?.stars ?? 0, r.stars), points: Math.max(prev?.points ?? 0, r.points) };
  if (mode === 'daily') s.daily[`${date}:${kind}`] = Math.max(s.daily[`${date}:${kind}`] ?? 0, r.points);
  const newBadges: string[] = [];
  for (const g of r.goals) {
    if (!g.done) continue;
    const b = `${kind}:${g.id}`;
    if (!s.badges[b]) { s.badges[b] = true; newBadges.push(g.id); }
  }
  save();
  return { newRecord, newBadges, previous: prev?.points ?? 0 };
}

/** Nur für Tests */
export function resetRecords(): void {
  mem = { best: {}, daily: {}, badges: {} };
}
